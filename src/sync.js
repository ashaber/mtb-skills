/**
 * src/sync.js — minimal sync layer, Phase 3.1.
 *
 * This sits BESIDE the local store, not in front of it. src/storage.js
 * stays the synchronous source of truth for every read in the app — this
 * module only pulls remote records into the local store and pushes
 * local-only records out. Nothing here makes storage.js reads async or
 * routes them through the network.
 *
 * Merge rules:
 *  - Roster (people):        upsert by backend `id` (savePerson already
 *                             upserts-by-id, so this is a straight write).
 *  - Observations:           union by `id` — an immutable append-only log,
 *                             so pulling never overwrites, only adds rows
 *                             the local store doesn't have yet.
 *  - Confirmed levels:       last-write-wins by `athlete_id`+`skill`,
 *                             compared on `confirmed_at`. Whichever side
 *                             (local or remote) has the newer timestamp
 *                             wins; the other side gets synced to match.
 *  - Practices:               union by `id` — a coach's/HC's practice
 *                             session, created once, rarely mutated after
 *                             (status active->ended is the only edit) — so
 *                             pulling never overwrites, only adds sessions
 *                             the local store doesn't have yet.
 *  - Attendance:               last-write-wins by `practice_id`+`person_id`,
 *                             compared on the backend's `marked_at` vs the
 *                             local record's `ts` — same posture as
 *                             confirmed levels above.
 *
 * Scope note (3.2 deferral): this increment assumes the coach's roster
 * comes from the backend pull. Reconciling PRE-EXISTING local-only
 * athletes (dedup by external_id/name, per the Phase 2b merge-key rules)
 * and an offline retry queue for failed pushes are both deferred to 3.2.
 * A push that fails here is logged and skipped for this sync pass — it
 * will be retried on the next syncNow() call, but there's no persistent
 * queue yet.
 */

import log from './log.js';
import { BACKEND_URL } from './env.js';
import { isAuthConfigured, getAccessToken } from './auth.js';
import {
  savePerson,
  getObservations, saveObservation,
  getConfirmedLevels, setConfirmedLevel,
  getPractices, upsertPracticeFromRemote,
  getAllAttendance, upsertAttendanceFromRemote,
  saveCachedIdentity, saveRemoteRosterIds,
} from './storage.js';

/**
 * Minimal fetch helper: adds the Bearer token + JSON headers, parses the
 * JSON body, and throws a plain Error (message = the server's `{error}`
 * when present) on any non-2xx response. Exported (Phase 3.2) so
 * src/main.js's reconciliation Add/Match flow can reuse it for
 * `POST /api/athletes` without duplicating the fetch/error-shape logic.
 */
export async function api(path, { method = 'GET', body } = {}) {
  const token = await getAccessToken();
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(`${BACKEND_URL}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  let json = null;
  try {
    json = await res.json();
  } catch {
    // empty/non-JSON body — leave json as null
  }

  if (!res.ok) {
    const message = (json && json.error) || `HTTP ${res.status}`;
    throw new Error(message);
  }

  return json;
}

const confirmedKey = c => `${c.athlete_id}::${c.skill}`;
const attendanceKey = a => `${a.practice_id}::${a.person_id}`;

/**
 * Pulls the caller-visible roster/observations/confirmed-levels from the
 * backend and merges them into the local store, then pushes any
 * local-only records up. Returns `{ pulled, pushed }` counts, or `null`
 * when sync didn't run at all (unconfigured / signed out / offline).
 */
export async function syncNow() {
  if (!isAuthConfigured()) {
    log.info('sync.skip', { reason: 'not_configured' });
    return null;
  }
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    log.info('sync.skip', { reason: 'offline' });
    return null;
  }

  const token = await getAccessToken();
  if (!token) {
    log.info('sync.skip', { reason: 'signed_out' });
    return null;
  }

  let pulled = 0;
  let pushed = 0;

  try {
    const [remoteRoster, remoteObs, remoteConfirmed, remotePractices, remoteAttendance, me] = await Promise.all([
      api('/api/roster'),
      api('/api/observations'),
      api('/api/confirmed-levels'),
      api('/api/practices'),
      api('/api/attendance'),
      api('/api/me'),
    ]);

    // ── Identity + remote-roster-id cache (Phase 3.2) ─────────────────────
    // Written on every successful sync so src/views.js can read "my
    // group(s)" (via src/reconcile.js's resolveMyGroups) and detect
    // local-only athletes (src/reconcile.js's detectLocalOnly) SYNCHRONOUSLY
    // — no network call on render, per this module's offline-first header.
    saveCachedIdentity(me?.personas || []);
    saveRemoteRosterIds((remoteRoster || []).map(r => r.id));

    // ── Roster: upsert by id ──────────────────────────────────────────────
    // Pass the FULL pulled row through (not just id/name/role) so
    // ride_group_id/ride_group_name/tags/external_id/grade/category all
    // persist locally. savePerson merge-preserves any field this row
    // doesn't mention (medical_notes, photo, plate, notes, ...) — see its
    // doc comment in src/storage.js.
    for (const r of remoteRoster || []) {
      savePerson({
        id:              r.id,
        name:            r.name,
        role:            r.role,
        ride_group_id:   r.ride_group_id ?? null,
        ride_group_name: r.ride_group_name ?? null,
        tags:            r.tags ?? [],
        external_id:     r.external_id ?? null,
        grade:           r.grade ?? null,
        category:        r.category ?? null,
      });
      pulled++;
    }

    // ── Observations: union by id ─────────────────────────────────────────
    const localObs = getObservations();
    const localObsIds = new Set(localObs.map(o => o.id));
    const remoteObsIds = new Set((remoteObs || []).map(o => o.id));

    for (const o of remoteObs || []) {
      if (!localObsIds.has(o.id)) {
        saveObservation({ ...o });
        pulled++;
      }
    }

    // ── Confirmed levels: LWW by athlete_id+skill, compared before any
    //    pull-side writes so the push decision below uses the original
    //    local state, not values this same pass just overwrote. ─────────
    const localConfirmed = getConfirmedLevels();
    const localConfirmedMap = new Map(localConfirmed.map(c => [confirmedKey(c), c]));
    const remoteConfirmedMap = new Map((remoteConfirmed || []).map(c => [confirmedKey(c), c]));

    for (const [key, remote] of remoteConfirmedMap) {
      const local = localConfirmedMap.get(key);
      if (!local || new Date(remote.confirmed_at) > new Date(local.confirmed_at)) {
        setConfirmedLevel({ ...remote });
        pulled++;
      }
    }

    // ── Practices: union by id ─────────────────────────────────────────
    const localPractices = getPractices();
    const localPracticeIds = new Set(localPractices.map(p => p.id));
    const remotePracticeIds = new Set((remotePractices || []).map(p => p.id));

    for (const p of remotePractices || []) {
      if (!localPracticeIds.has(p.id)) {
        upsertPracticeFromRemote(p);
        pulled++;
      }
    }

    // ── Attendance: LWW by (practice_id, person_id), compared on
    //    marked_at (remote) vs ts (local) — same ordering caveat as
    //    confirmed levels above: computed before any push-side reads. ────
    const localAttendance = getAllAttendance();
    const localAttendanceMap = new Map(localAttendance.map(a => [attendanceKey(a), a]));
    const remoteAttendanceMap = new Map((remoteAttendance || []).map(a => [attendanceKey(a), a]));

    for (const [key, remote] of remoteAttendanceMap) {
      const local = localAttendanceMap.get(key);
      if (!local || new Date(remote.marked_at) > new Date(local.ts)) {
        upsertAttendanceFromRemote(remote);
        pulled++;
      }
    }

    // Athletes the backend knows about (this pull's roster). A local record
    // whose athlete_id isn't here belongs to a LOCAL-ONLY athlete — pushing
    // it would just 403 (`athlete_not_in_scope`) and surface as "sync
    // finished with errors". We skip those cleanly here; the coach resolves
    // them via reconciliation (Add/Match → remapAthleteId re-points the id,
    // after which the next sync pushes them normally). Counted as `skipped`,
    // not errored.
    const remoteRosterIdSet = new Set((remoteRoster || []).map(r => r.id));
    let skipped = 0;

    // ── Push: local observations the backend doesn't have yet ────────────
    for (const o of localObs) {
      if (remoteObsIds.has(o.id)) continue;
      if (!remoteRosterIdSet.has(o.athlete_id)) { skipped++; continue; }
      try {
        await api('/api/observations', {
          method: 'POST',
          body: {
            id:             o.id,
            athlete_id:     o.athlete_id,
            skill:          o.skill,
            level_observed: o.level_observed,
            session_date:   o.session_date,
            notes:          o.notes ?? undefined,
          },
        });
        pushed++;
      } catch (e) {
        log.error('sync.push.observation.failed', { id: o.id, error: String(e) });
      }
    }

    // ── Push: local confirmed levels that are new or newer than remote ───
    for (const [key, local] of localConfirmedMap) {
      const remote = remoteConfirmedMap.get(key);
      if (remote && !(new Date(local.confirmed_at) > new Date(remote.confirmed_at))) continue;
      if (!remoteRosterIdSet.has(local.athlete_id)) { skipped++; continue; }
      try {
        await api('/api/confirmed-levels', {
          method: 'POST',
          body: {
            athlete_id: local.athlete_id,
            skill:      local.skill,
            level:      local.level,
          },
        });
        pushed++;
      } catch (e) {
        log.error('sync.push.confirmed_level.failed', { key, error: String(e) });
      }
    }

    // ── Push: local practices the backend doesn't have yet ───────────────
    // No local-only-athlete skip guard needed here — a practice isn't
    // owned by an athlete/person the backend might not recognize, only by
    // the (already-authorized) caller and their own ride_group/team.
    for (const p of localPractices) {
      if (remotePracticeIds.has(p.id)) continue;
      try {
        await api('/api/practices', {
          method: 'POST',
          body: {
            id:            p.id,
            ride_group_id: p.ride_group_id ?? undefined,
            session_date:  p.date,
            status:        p.status,
          },
        });
        pushed++;
      } catch (e) {
        log.error('sync.push.practice.failed', { id: p.id, error: String(e) });
      }
    }

    // ── Push: local attendance that's new or newer than remote ───────────
    for (const [key, local] of localAttendanceMap) {
      const remote = remoteAttendanceMap.get(key);
      if (remote && !(new Date(local.ts) > new Date(remote.marked_at))) continue;
      if (!remoteRosterIdSet.has(local.person_id)) { skipped++; continue; }
      try {
        await api('/api/attendance', {
          method: 'POST',
          body: {
            practice_id: local.practice_id,
            person_id:   local.person_id,
            status:      local.status,
          },
        });
        pushed++;
      } catch (e) {
        log.error('sync.push.attendance.failed', { key, error: String(e) });
      }
    }

    if (skipped) log.info('sync.push.skipped_local_only', { skipped });
    log.info('sync.done', { pulled, pushed, skipped });
    return { pulled, pushed, skipped };
  } catch (e) {
    log.error('sync.failed', { error: String(e) });
    return { pulled, pushed, error: String(e) };
  }
}

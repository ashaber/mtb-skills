/**
 * Data access layer — Phase 1 implementation backed by localStorage.
 *
 * All callers use only the exported functions below. The backend can be
 * swapped to Google Sheets (Phase 2) or a database (Phase 4) by replacing
 * this module without touching any other file.
 *
 * Data model: see app/schema.md
 */

import log, { STORAGE_KEY as LOG_KEY } from './log.js';
import { getStore } from './store/index.js';

const KEYS = {
  athletes:       'mtb_athletes',      // preserved for backward compat
  observations:   'mtb_observations',
  confirmedLevels:'mtb_confirmed_levels',
  coach:          'mtb_coach',
  team:           'mtb_team',
  rosterFilter:   'mtb_roster_filter',
  rosterGroupFilter: 'mtb_roster_group_filter',
  practices:      'mtb_practices',
  attendance:     'mtb_attendance',
};

// Category → grade mapping (MS Advanced has null grade)
export const CATEGORIES = ['5th', '6th', '7th', '8th', 'MS Advanced', 'Freshman', 'JV2', 'JV1', 'Varsity'];

const CATEGORY_GRADE = {
  '5th': 5, '6th': 6, '7th': 7, '8th': 8,
  'MS Advanced': null,
  'Freshman': 9, 'JV2': 10, 'JV1': 11, 'Varsity': 12,
};

export function categoryToGrade(category) {
  if (!category || !(category in CATEGORY_GRADE)) return null;
  return CATEGORY_GRADE[category];
}

const GRADE_CATEGORY = { 5: '5th', 6: '6th', 7: '7th', 8: '8th', 9: 'Freshman', 10: 'JV2', 11: 'JV1', 12: 'Varsity' };

export function gradeToCategory(grade) {
  return GRADE_CATEGORY[grade] ?? null;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function load(key) {
  return getStore().readCollection(key);
}

function save(key, value) {
  getStore().writeCollection(key, value);
}

export function generateId() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function today() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

// ---------------------------------------------------------------------------
// Coach / Team (v1: single coach, single team stored in settings)
// ---------------------------------------------------------------------------

export function getCoach() {
  try {
    return getStore().readObject(KEYS.coach);
  } catch {
    return null;
  }
}

export function saveCoach(fields) {
  const existing = getCoach();
  const coach = {
    id:      existing?.id ?? generateId(),
    team_id: getTeamId(),
    role:    'coach',
    ...existing,
    ...fields,
  };
  getStore().writeObject(KEYS.coach, coach);
  return coach;
}

export function getTeamId() {
  try {
    const team = getStore().readObject(KEYS.team);
    if (team?.id) return team.id;
  } catch { /* fall through */ }
  const id = generateId();
  getStore().writeObject(KEYS.team, { id });
  return id;
}

// ---------------------------------------------------------------------------
// People (schema v2 — role: athlete | coach)
// ---------------------------------------------------------------------------

/**
 * @param {{ role?: string }} [filter]
 */
export function getPeople(filter = {}) {
  const all = load(KEYS.athletes);
  if (filter.role === 'athlete') {
    // Records without a role field are legacy athletes — treat as 'athlete'
    return all.filter(p => !p.role || p.role === 'athlete');
  }
  if (filter.role === 'coach') {
    return all.filter(p => p.role === 'coach');
  }
  return all;
}

/**
 * @param {{ name: string, role?: string, category?: string|null, level?: number|null, grade?: number|null,
 *   ride_group_id?: string|null, ride_group_name?: string|null, tags?: string[], external_id?: string|null }} fields
 */
export function savePerson(fields) {
  const all = load(KEYS.athletes);
  const isNew = !fields.id;
  const existing = isNew ? null : all.find(p => p.id === fields.id);

  // `has(k)` — true only when the CALLER explicitly set this key (present in
  // `fields`, even if the value is null/undefined). This is what makes an
  // update merge-preserve: a key the caller never mentioned (e.g. a sync
  // pull that only sends {id,name,role,ride_group_id,ride_group_name,tags,
  // grade,category,external_id}) falls through to the EXISTING value below
  // rather than being wiped to null. A key the caller sets to null (e.g. the
  // edit-person form clearing a field) is honored as an explicit clear.
  const has = k => Object.prototype.hasOwnProperty.call(fields, k);

  const role = has('role') ? fields.role : (existing?.role ?? 'athlete');

  let category, grade, level;
  if (role === 'athlete') {
    category = has('category') ? (fields.category ?? null) : (existing?.category ?? null);
    if (category !== null) {
      grade = categoryToGrade(category);
    } else if (has('grade')) {
      grade = fields.grade ?? null;
    } else {
      grade = existing?.grade ?? null;
    }
    level = null;
  } else {
    level = has('level') ? (fields.level ?? null) : (existing?.level ?? null);
    category = null;
    grade = null;
  }

  // Spread the existing record first (preserves anything not enumerated
  // below, including fields this module doesn't even know about yet), THEN
  // apply computed/provided fields on top — never fields.<x> directly, so an
  // absent key can't clobber an existing value with `undefined`.
  const person = {
    ...(existing ?? {}),
    id:          existing?.id ?? fields.id ?? generateId(),
    team_id:     existing?.team_id ?? getTeamId(),
    season_year: existing?.season_year ?? new Date().getFullYear(),
    name:        has('name') ? fields.name : (existing?.name ?? fields.name),
    role,
    category,
    grade,
    level,
    plate:                   has('plate') ? (fields.plate ?? null) : (existing?.plate ?? null),
    notes:                   has('notes') ? (fields.notes ?? null) : (existing?.notes ?? null),
    medical_notes:           has('medical_notes') ? (fields.medical_notes ?? null) : (existing?.medical_notes ?? null),
    emergency_contact_name:  has('emergency_contact_name') ? (fields.emergency_contact_name ?? null) : (existing?.emergency_contact_name ?? null),
    emergency_contact_phone: has('emergency_contact_phone') ? (fields.emergency_contact_phone ?? null) : (existing?.emergency_contact_phone ?? null),
    // Phase 3.2 — pulled from the backend roster row (see src/sync.js);
    // default null/[] for locally-created people who have never synced.
    ride_group_id:           has('ride_group_id') ? (fields.ride_group_id ?? null) : (existing?.ride_group_id ?? null),
    ride_group_name:         has('ride_group_name') ? (fields.ride_group_name ?? null) : (existing?.ride_group_name ?? null),
    tags:                    has('tags') ? (fields.tags ?? []) : (existing?.tags ?? []),
    external_id:             has('external_id') ? (fields.external_id ?? null) : (existing?.external_id ?? null),
  };

  if (isNew) {
    all.push(person);
  } else {
    const idx = all.findIndex(p => p.id === person.id);
    if (idx === -1) all.push(person);
    else all[idx] = person;
  }
  save(KEYS.athletes, all);
  return person;
}

export function deletePerson(id) {
  save(KEYS.athletes, load(KEYS.athletes).filter(p => p.id !== id));
}

/**
 * Re-points a local-only athlete id to its backend counterpart everywhere
 * in the local store, after the coach Adds or Matches it during Phase 3.2
 * reconciliation (see src/reconcile.js). Idempotent: a no-op when
 * `fromId === toId` or when `fromId` isn't referenced anywhere.
 *
 * What moves:
 *  - observation.athlete_id: every `fromId` -> `toId`.
 *  - confirmed_level.athlete_id: every `fromId` -> `toId`; if that produces
 *    two entries for the same (athlete_id, skill) — i.e. `toId` already had
 *    a confirmed level for a skill `fromId` also had one for — the entry
 *    with the newer `confirmed_at` wins (same LWW rule as src/sync.js), the
 *    other is dropped.
 *  - photo (src/storage.js's PHOTO_KEY map): `fromId`'s photo moves to
 *    `toId` ONLY if `toId` doesn't already have one; otherwise `fromId`'s
 *    photo is simply dropped (never overwrites an existing `toId` photo).
 *  - person record: the local `fromId` person record is always removed
 *    afterward — Match/Add both make the backend row authoritative, and the
 *    next sync pull creates/refreshes the `toId` person locally if it
 *    isn't already present. Never leaves a dangling `fromId` duplicate.
 *
 * @param {string} fromId local-only athlete id being replaced
 * @param {string} toId backend athlete id it now maps to
 */
export function remapAthleteId(fromId, toId) {
  if (!fromId || !toId || fromId === toId) return;

  // ── Observations: reassign athlete_id ─────────────────────────────────
  const obs = load(KEYS.observations);
  let obsChanged = false;
  const remappedObs = obs.map(o => {
    if (o.athlete_id !== fromId) return o;
    obsChanged = true;
    return { ...o, athlete_id: toId };
  });
  if (obsChanged) save(KEYS.observations, remappedObs);

  // ── Confirmed levels: reassign athlete_id, then LWW-resolve any
  //    (athlete_id, skill) collision the remap just created ────────────
  const remappedConfirmed = load(KEYS.confirmedLevels).map(c =>
    c.athlete_id === fromId ? { ...c, athlete_id: toId } : c
  );
  const bySkillKey = new Map();
  for (const c of remappedConfirmed) {
    const key = `${c.athlete_id}::${c.skill}`;
    const prior = bySkillKey.get(key);
    if (!prior || new Date(c.confirmed_at) > new Date(prior.confirmed_at)) {
      bySkillKey.set(key, c);
    }
  }
  save(KEYS.confirmedLevels, Array.from(bySkillKey.values()));

  // ── Photo: move only if the target has none ───────────────────────────
  try {
    const photos = getStore().readObject(PHOTO_KEY) ?? {};
    if (fromId in photos) {
      if (!(toId in photos)) photos[toId] = photos[fromId];
      delete photos[fromId];
      getStore().writeObject(PHOTO_KEY, photos);
    }
  } catch (e) {
    log.error('athlete.remap.photo.failed', { from: fromId, to: toId, error: String(e) });
  }

  // ── Person record: drop the local fromId row — never a dangling dupe ──
  save(KEYS.athletes, load(KEYS.athletes).filter(p => p.id !== fromId));

  log.info('athlete.remap', { from: fromId, to: toId });
}

// ---------------------------------------------------------------------------
// Backward-compat aliases (Phase 1 callers — trading card, etc.)
// ---------------------------------------------------------------------------

export function getAthletes() {
  return getPeople({ role: 'athlete' });
}

export function saveAthlete(fields) {
  return savePerson({ ...fields, role: 'athlete' });
}

export function deleteAthlete(id) {
  deletePerson(id);
}

// ---------------------------------------------------------------------------
// Roster filter (persisted in localStorage)
// ---------------------------------------------------------------------------

export function getRosterFilter() {
  return getStore().readRaw(KEYS.rosterFilter) ?? 'all';
}

export function saveRosterFilter(filter) {
  getStore().writeRaw(KEYS.rosterFilter, filter);
}

// Ride-group filter (Phase 3.2) — separate from the role filter above so
// "Athletes" + "JV Boys" can be applied together. `'all'` means no group
// filtering; any other value is a `ride_group_name` string, or the literal
// `'__unassigned__'` for people with no ride_group_name.
export function getRosterGroupFilter() {
  return getStore().readRaw(KEYS.rosterGroupFilter) ?? 'all';
}

export function saveRosterGroupFilter(filter) {
  getStore().writeRaw(KEYS.rosterGroupFilter, filter);
}

// ---------------------------------------------------------------------------
// Observations (immutable append-only log)
// ---------------------------------------------------------------------------

/**
 * @param {{ athlete_id: string, skill: string, level_observed: number, notes?: string, session_date?: string }} fields
 */
export function saveObservation(fields) {
  const coach = getCoach();
  const obs = {
    id:             generateId(),
    team_id:        getTeamId(),
    coach_id:       coach?.id ?? null,
    session_date:   today(),
    notes:          null,
    ...fields,
  };
  const all = load(KEYS.observations);
  all.push(obs);
  save(KEYS.observations, all);
  return obs;
}

/**
 * @param {{ athlete_id?: string, skill?: string }} [filters]
 */
export function getObservations(filters = {}) {
  let all = load(KEYS.observations);
  if (filters.athlete_id) all = all.filter(o => o.athlete_id === filters.athlete_id);
  if (filters.skill)      all = all.filter(o => o.skill === filters.skill);
  return all;
}

// ---------------------------------------------------------------------------
// Confirmed Levels (coach-asserted, last-write-wins per athlete+skill)
// ---------------------------------------------------------------------------

/**
 * @param {{ athlete_id: string, skill: string, level: number }} fields
 */
export function setConfirmedLevel(fields) {
  const coach = getCoach();
  const entry = {
    id:           generateId(),
    team_id:      getTeamId(),
    coach_id:     coach?.id ?? null,
    confirmed_at: new Date().toISOString(),
    ...fields,
  };
  const all = load(KEYS.confirmedLevels);
  const filtered = all.filter(
    c => !(c.athlete_id === entry.athlete_id && c.skill === entry.skill)
  );
  filtered.push(entry);
  save(KEYS.confirmedLevels, filtered);
  return entry;
}

/**
 * @param {{ athlete_id?: string, skill?: string }} [filters]
 */
export function getConfirmedLevels(filters = {}) {
  let all = load(KEYS.confirmedLevels);
  if (filters.athlete_id) all = all.filter(c => c.athlete_id === filters.athlete_id);
  if (filters.skill)      all = all.filter(c => c.skill === filters.skill);
  return all;
}

/**
 * @param {string} athleteId
 * @returns {{ body_position: number, braking: number, cornering: number }}
 */
export function getAthleteConfirmedLevels(athleteId) {
  const confirmed = getConfirmedLevels({ athlete_id: athleteId });
  return {
    body_position: confirmed.find(c => c.skill === 'body_position')?.level ?? 0,
    braking:       confirmed.find(c => c.skill === 'braking')?.level ?? 0,
    cornering:     confirmed.find(c => c.skill === 'cornering')?.level ?? 0,
  };
}

// ---------------------------------------------------------------------------
// Practice attendance
// ---------------------------------------------------------------------------

export function findTodaysPractice() {
  const dateStr = today();
  const all = load(KEYS.practices).filter(p => p.date === dateStr);
  if (!all.length) return null;
  const active = all.slice().reverse().find(p => p.status !== 'ended');
  return active ?? all[all.length - 1];
}

export function createPractice({ force = false } = {}) {
  const dateStr = today();
  const all = load(KEYS.practices);
  if (!force) {
    const existing = all.find(p => p.date === dateStr);
    if (existing) return existing;
  }
  const coach = getCoach();
  const practice = {
    id:       generateId(),
    team_id:  getTeamId(),
    coach_id: coach?.id ?? null,
    date:     dateStr,
    status:   'active',
  };
  all.push(practice);
  save(KEYS.practices, all);
  return practice;
}

export function endPractice(id) {
  const all = load(KEYS.practices);
  const idx = all.findIndex(p => p.id === id);
  if (idx === -1) return null;
  all[idx] = { ...all[idx], status: 'ended' };
  save(KEYS.practices, all);
  return all[idx];
}

export function reopenPractice(id) {
  const all = load(KEYS.practices);
  const idx = all.findIndex(p => p.id === id);
  if (idx === -1) return null;
  all[idx] = { ...all[idx], status: 'active' };
  save(KEYS.practices, all);
  return all[idx];
}

export function savePractice(id, fields) {
  const all = load(KEYS.practices);
  const idx = all.findIndex(p => p.id === id);
  if (idx === -1) return null;
  all[idx] = { ...all[idx], ...fields };
  save(KEYS.practices, all);
  return all[idx];
}

export function getPractices() {
  return load(KEYS.practices);
}

/**
 * Toggle a person's attendance status for a practice.
 * absent → attending, attending → absent.
 */
export function toggleAttendance(practiceId, personId) {
  const all = load(KEYS.attendance);
  const idx = all.findIndex(a => a.practice_id === practiceId && a.person_id === personId);
  if (idx === -1) {
    all.push({
      id:          generateId(),
      practice_id: practiceId,
      person_id:   personId,
      status:      'attending',
      ts:          new Date().toISOString(),
    });
  } else {
    all[idx] = {
      ...all[idx],
      status: all[idx].status === 'attending' ? 'absent' : 'attending',
      ts:     new Date().toISOString(),
    };
  }
  save(KEYS.attendance, all);
}

export function getAttendance(practiceId) {
  return load(KEYS.attendance).filter(a => a.practice_id === practiceId);
}

export function getAttendanceStatus(practiceId, personId) {
  const rec = load(KEYS.attendance).find(
    a => a.practice_id === practiceId && a.person_id === personId
  );
  return rec?.status ?? null;
}

/**
 * Every local attendance record, across all practices — unlike
 * getAttendance(practiceId) above, this is not scoped to one practice.
 * Used by src/sync.js to diff the full local attendance set against the
 * backend's pull/push. */
export function getAllAttendance() {
  return load(KEYS.attendance);
}

// ---------------------------------------------------------------------------
// Practice / attendance — remote merge helpers (Phase 3.x backend sync)
// ---------------------------------------------------------------------------

/**
 * Upserts a PULLED remote practice row (backend/app/routes.py's
 * `_practice_row_to_dict` shape) into the local store, mapping the
 * backend's field names onto the local shape used by createPractice/
 * getPractices/etc above (`session_date` -> `date`, `created_by` ->
 * `coach_id`) so the rest of the app never has to know two shapes exist.
 *
 * Simple union by id, matching src/sync.js's "union practices by id" merge
 * rule (NOT last-write-wins, unlike attendance below) — if a practice with
 * this id already exists locally it is left untouched: the local record
 * already IS that same practice, whether it was created here originally or
 * is being echoed back from a prior push, and a practice/status pair is
 * simple enough that there's nothing to reconcile field-by-field. Returns
 * the (possibly pre-existing, untouched) local record.
 */
export function upsertPracticeFromRemote(remote) {
  const all = load(KEYS.practices);
  const idx = all.findIndex(p => p.id === remote.id);
  if (idx !== -1) return all[idx];

  const practice = {
    id:            remote.id,
    team_id:       remote.team_id ?? null,
    ride_group_id: remote.ride_group_id ?? null,
    coach_id:      remote.created_by ?? null,
    date:          remote.session_date,
    status:        remote.status ?? 'active',
  };
  all.push(practice);
  save(KEYS.practices, all);
  return practice;
}

/**
 * Upserts a PULLED remote attendance row (backend/app/routes.py's
 * `_attendance_row_to_dict` shape), last-write-wins by
 * (practice_id, person_id), comparing the backend's `marked_at` against
 * the local record's `ts` — same LWW posture as src/sync.js's
 * confirmed-level merge. Local wins (no-op) when its `ts` is already newer
 * than or equal to the remote `marked_at`; otherwise the remote status
 * replaces the local record's status/`ts` (or a new local record is
 * created, if none existed for this practice+person yet). Returns the
 * (possibly unchanged) local record.
 */
export function upsertAttendanceFromRemote(remote) {
  const all = load(KEYS.attendance);
  const idx = all.findIndex(a => a.practice_id === remote.practice_id && a.person_id === remote.person_id);

  if (idx === -1) {
    const record = {
      id:          remote.id,
      practice_id: remote.practice_id,
      person_id:   remote.person_id,
      status:      remote.status,
      ts:          remote.marked_at,
    };
    all.push(record);
    save(KEYS.attendance, all);
    return record;
  }

  const local = all[idx];
  if (local.ts && new Date(local.ts) >= new Date(remote.marked_at)) {
    return local; // local is newer or equal — keep it
  }
  all[idx] = { ...local, status: remote.status, ts: remote.marked_at };
  save(KEYS.attendance, all);
  return all[idx];
}

// ---------------------------------------------------------------------------
// Import / Export (schema v2)
// ---------------------------------------------------------------------------

export function exportAll() {
  return JSON.stringify({
    exported_at:      new Date().toISOString(),
    schema_version:   2,
    coach:            getCoach(),
    team_id:          getTeamId(),
    people:           getPeople(),
    athletes:         getAthletes(), // backward compat field
    observations:     getObservations(),
    confirmed_levels: getConfirmedLevels(),
    practices:        getPractices(),
    attendance:       load(KEYS.attendance),
    log:              getStore().readObject(LOG_KEY) ?? [],
  }, null, 2);
}

/**
 * Replaces all local data with the contents of an export JSON string.
 * Handles v1 exports by shimming athletes → people with role: 'athlete'.
 * Call only after user confirmation — this is destructive.
 */
export function importAll(jsonString) {
  const data = JSON.parse(jsonString);

  if (data.schema_version === 1 || (!data.people && data.athletes)) {
    // v1 shim: add role: 'athlete' to all imported athletes
    const shimmed = (data.athletes || []).map(a => ({ role: 'athlete', ...a }));
    save(KEYS.athletes, shimmed);
  } else if (data.people) {
    save(KEYS.athletes, data.people);
  } else if (data.athletes) {
    save(KEYS.athletes, data.athletes);
  }

  if (data.observations)     save(KEYS.observations, data.observations);
  if (data.confirmed_levels) save(KEYS.confirmedLevels, data.confirmed_levels);
  if (data.coach)            getStore().writeObject(KEYS.coach, data.coach);
  if (data.practices)        save(KEYS.practices, data.practices);
  if (data.attendance)       save(KEYS.attendance, data.attendance);
}

// ---------------------------------------------------------------------------
// Athlete photos (stored as data-URLs per athlete ID)
// ---------------------------------------------------------------------------
const PHOTO_KEY = 'mtb_photos';

export function getPhoto(athleteId) {
  try { return (getStore().readObject(PHOTO_KEY) ?? {})[athleteId] || null; }
  catch { return null; }
}
export function savePhoto(athleteId, dataUrl) {
  try {
    const photos = getStore().readObject(PHOTO_KEY) ?? {};
    photos[athleteId] = dataUrl;
    getStore().writeObject(PHOTO_KEY, photos);
    return true;
  } catch (e) {
    log.error('photo.save.failed', { athlete_id: athleteId, error: String(e) });
    return false;
  }
}

// ---------------------------------------------------------------------------
// Sync identity cache (Phase 3.2 — ride-group UI + reconciliation)
//
// src/sync.js writes these two caches on every successful syncNow() so the
// roster view can read "my group(s)" and "which athletes are local-only"
// SYNCHRONOUSLY, without ever blocking a render on a network call — the
// offline-first constraint that governs this whole module. Both read back
// null when there's no cache yet (never synced / signed out / unconfigured),
// which is exactly the signal the view uses to hide the feature entirely.
// ---------------------------------------------------------------------------
const IDENTITY_KEY = 'mtb_identity';
const REMOTE_ROSTER_IDS_KEY = 'mtb_remote_roster_ids';
const ACTIVE_PERSONA_KEY = 'mtb_active_persona_id';

/**
 * @returns {{ personas: Array<{person_id:string, role:string, team_id:string, ride_group_id:string|null, name:string, team_name:string|null}>, cached_at: string }|null}
 */
export function getCachedIdentity() {
  try { return getStore().readObject(IDENTITY_KEY); }
  catch { return null; }
}

/**
 * @param {Array<object>} personas the `personas` array from GET /api/me
 */
export function saveCachedIdentity(personas) {
  try {
    getStore().writeObject(IDENTITY_KEY, { personas: personas ?? [], cached_at: new Date().toISOString() });
  } catch (e) {
    log.error('identity.cache.save.failed', { error: String(e) });
  }
}

export function clearCachedIdentity() {
  try { getStore().writeObject(IDENTITY_KEY, null); }
  catch { /* best-effort */ }
}

// ---------------------------------------------------------------------------
// Active persona (D26 — team switcher). A coach with coaching duties on more
// than one team (src/sync.js's syncNow gets >1 persona back from GET
// /api/me) has one `person` row per team; this is which one the app is
// currently scoped to. Persisted so the choice survives a reload without
// re-signing-in. Read back null when there's never been a selection (a
// single-persona coach never needs one at all — src/reconcile.js's
// resolveActivePersona resolves that case without ever touching this key),
// which is exactly the signal src/main.js uses to show the "which hat"
// picker.
// ---------------------------------------------------------------------------

/**
 * @returns {string|null} the selected persona's `person_id`, or null if
 *   none has been chosen yet (or there's only ever been one).
 */
export function getActivePersonaId() {
  try { return getStore().readObject(ACTIVE_PERSONA_KEY); }
  catch { return null; }
}

/**
 * @param {string|null} personId
 */
export function saveActivePersonaId(personId) {
  try { getStore().writeObject(ACTIVE_PERSONA_KEY, personId ?? null); }
  catch (e) { log.error('active_persona.save.failed', { error: String(e) }); }
}

/**
 * @returns {string[]|null} ids present in the backend roster as of the last
 *   successful pull, or null when there has never been one.
 */
export function getRemoteRosterIds() {
  try { return getStore().readObject(REMOTE_ROSTER_IDS_KEY); }
  catch { return null; }
}

/**
 * @param {string[]} ids
 */
export function saveRemoteRosterIds(ids) {
  try { getStore().writeObject(REMOTE_ROSTER_IDS_KEY, ids ?? []); }
  catch (e) { log.error('remote_roster_ids.save.failed', { error: String(e) }); }
}

// ---------------------------------------------------------------------------
// Team / league settings (white-label name, coach display name)
// ---------------------------------------------------------------------------
const TEAM_SETTINGS_KEY = 'mtb_team_settings';

export function getTeamSettings() {
  try { return getStore().readObject(TEAM_SETTINGS_KEY) ?? {}; }
  catch { return {}; }
}
export function saveTeamSettings(settings) {
  const existing = getTeamSettings();
  getStore().writeObject(TEAM_SETTINGS_KEY, { ...existing, ...settings });
}

// ---------------------------------------------------------------------------
// Local data reset ("Clear local data & re-sync" — Settings, HC-facing but
// available to anyone signed in or not; src/main.js gates the re-sync half
// on being signed in, not this function). Wipes ONLY roster/derived data
// that a backend pull can fully reconstruct — never the coach's own
// identity/team config, and never a Supabase auth token (those live under
// `sb-*` keys this module never touches at all).
// ---------------------------------------------------------------------------

// Every key this function removes. Deliberately explicit (not "everything
// except an allowlist") so a new KEYS entry added later does NOT get wiped
// by default — a future storage.js key must be added here on purpose.
const LOCAL_ROSTER_DATA_KEYS = [
  KEYS.athletes,
  KEYS.observations,
  KEYS.confirmedLevels,
  PHOTO_KEY,
  KEYS.attendance,
  KEYS.practices,
  REMOTE_ROSTER_IDS_KEY,
  IDENTITY_KEY,
  ACTIVE_PERSONA_KEY,
  KEYS.rosterFilter,
  KEYS.rosterGroupFilter,
];

/**
 * Removes only the local-storage keys listed in LOCAL_ROSTER_DATA_KEYS —
 * roster (people), observations, confirmed levels, photos, attendance,
 * practices, the cached remote-roster-id set, the cached identity, the
 * active-persona (team switcher) selection, and the two roster filter
 * selections. Deliberately does NOT touch `mtb_coach`,
 * `mtb_team`, `mtb_team_settings`, or any Supabase `sb-*` auth key — those
 * are the coach's own profile/config and sign-in session, not data a
 * backend re-sync repopulates. Call sites (src/main.js) follow this with
 * `runSync()` when signed in so the wiped roster/observations/confirmed-
 * levels are immediately re-pulled; offline or signed out this is just a
 * clean local wipe.
 */
export function clearLocalRosterData() {
  LOCAL_ROSTER_DATA_KEYS.forEach(key => getStore().remove(key));
  log.info('storage.local_cleared', { keys: LOCAL_ROSTER_DATA_KEYS.length });
}

// ---------------------------------------------------------------------------
// Attendance export helper
// ---------------------------------------------------------------------------

export function exportAttendance(practiceId) {
  const practice = getPractices().find(p => p.id === practiceId);
  const attendingIds = getAttendance(practiceId)
    .filter(a => a.status === 'attending')
    .map(a => a.person_id);
  const people = getPeople().filter(p => attendingIds.includes(p.id));

  return JSON.stringify({
    practice_date: practice?.date ?? today(),
    exported_at:   new Date().toISOString(),
    mood:          practice?.mood          ?? null,
    reflection:    practice?.reflection    ?? null,
    incidents:     practice?.incidents     ?? null,
    attending: people.map(p => {
      const parts = (p.name || '').trim().split(/\s+/);
      const first = parts[0] ?? '';
      const last  = parts.slice(1).join(' ');
      return {
        first_name: first,
        last_name:  last,
        role:       p.role,
        ...(p.role === 'athlete' ? { category: p.category } : { level: p.level }),
      };
    }),
  }, null, 2);
}

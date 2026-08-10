/**
 * src/hc-dashboard.js — pure aggregation logic for the HC/TD Team Dashboard
 * (Phase 3.4 MVP — a deliberately simpler first cut than ROADMAP.md's full
 * "HC dashboard" vision; see docs/PHASE3_TEAM_VISIBILITY_PLAN.md's "HC
 * dashboard" section for the deferred full feature set).
 *
 * Scope: a read-only, current-state snapshot table — name, ride group,
 * attendance over a small fixed recent-practice window, and current
 * confirmed level per skill. Deliberately NOT built here (see
 * docs/PHASE3_TEAM_VISIBILITY_PLAN.md's "Open questions" — both explicitly
 * deferred to a Tim/Andrew product session, not this build):
 *   - any "falling behind" / staleness heuristic (open question #2 — how
 *     many practices/days without a level change triggers it is undecided)
 *   - ride-group-lead recommendation/flag workflows (open question #3)
 *   - cross-practice trend charts / progress-over-time visualizations
 *
 * Every function here is pure (no DOM, no storage, no network) so it's
 * directly unit-testable; src/views.js's viewHcDashboard() wires these to
 * storage.js's getPeople()/getPractices()/getAllAttendance()/
 * getConfirmedLevels() — data already pulled into the local store by the
 * existing GET /api/roster, /api/attendance, /api/confirmed-levels sync
 * (src/sync.js), so this view makes no network calls of its own.
 */

/** Fixed attendance window — "last N practices". No config UI (by design;
 * see this module's docstring on scope). */
export const DEFAULT_WINDOW_SIZE = 5;

/**
 * The N most recent practices (by `date`, descending), capped at
 * `windowSize`. Does not mutate the input array.
 * @param {Array<{id:string, date:string}>} practices
 * @param {number} [windowSize]
 * @returns {Array<{id:string, date:string}>}
 */
export function selectRecentPractices(practices, windowSize = DEFAULT_WINDOW_SIZE) {
  return (practices || [])
    .slice()
    .sort((a, b) => String(b?.date || '').localeCompare(String(a?.date || '')))
    .slice(0, windowSize);
}

/**
 * `{ attended, total }` for one person over a set of recent practice ids.
 * `total` is always the size of the recent-practice window (not just the
 * practices a record happens to exist for) — a missing attendance row for
 * a practice in-window counts as not attended, same as an explicit
 * 'absent' status.
 * @param {string} personId
 * @param {Array<{practice_id:string, person_id:string, status:string}>} attendance
 * @param {Iterable<string>} recentPracticeIds
 * @returns {{attended:number, total:number}}
 */
export function computeAttendanceRate(personId, attendance, recentPracticeIds) {
  const idSet = recentPracticeIds instanceof Set ? recentPracticeIds : new Set(recentPracticeIds || []);
  const attended = (attendance || []).filter(
    a => a && a.person_id === personId && a.status === 'attending' && idSet.has(a.practice_id)
  ).length;
  return { attended, total: idSet.size };
}

/**
 * Current confirmed level per skill for one athlete — 0 ("unset") when no
 * confirmed_level row exists for that athlete+skill. Mirrors
 * storage.js's getAthleteConfirmedLevels() shape/logic, kept as a pure
 * function here (no localStorage read) so it takes an already-loaded
 * confirmedLevels array instead.
 * @param {string} athleteId
 * @param {Array<{athlete_id:string, skill:string, level:number}>} confirmedLevels
 * @returns {{body_position:number, braking:number, cornering:number}}
 */
export function levelsForAthlete(athleteId, confirmedLevels) {
  const mine = (confirmedLevels || []).filter(c => c && c.athlete_id === athleteId);
  return {
    body_position: mine.find(c => c.skill === 'body_position')?.level ?? 0,
    braking:       mine.find(c => c.skill === 'braking')?.level ?? 0,
    cornering:     mine.find(c => c.skill === 'cornering')?.level ?? 0,
  };
}

/**
 * Builds the dashboard's row set: one row per athlete (coaches excluded —
 * a record with no `role` field is a legacy athlete, same convention as
 * storage.js's getPeople({role:'athlete'})), sorted alphabetically by name.
 * @param {{
 *   people?: Array<{id:string, name:string, role?:string, ride_group_name?:string|null}>,
 *   practices?: Array<{id:string, date:string}>,
 *   attendance?: Array<{practice_id:string, person_id:string, status:string}>,
 *   confirmedLevels?: Array<{athlete_id:string, skill:string, level:number}>,
 * }} data
 * @param {{windowSize?: number}} [opts]
 * @returns {Array<{
 *   id:string, name:string, ride_group_name:string|null,
 *   attended:number, total:number,
 *   levels:{body_position:number, braking:number, cornering:number},
 * }>}
 */
export function buildHcDashboardRows(
  { people, practices, attendance, confirmedLevels } = {},
  { windowSize = DEFAULT_WINDOW_SIZE } = {}
) {
  const recentIds = new Set(selectRecentPractices(practices, windowSize).map(p => p.id));
  const athletes = (people || []).filter(p => p && (!p.role || p.role === 'athlete'));

  return athletes
    .map(a => {
      const { attended, total } = computeAttendanceRate(a.id, attendance, recentIds);
      return {
        id: a.id,
        name: a.name,
        ride_group_name: a.ride_group_name ?? null,
        attended,
        total,
        levels: levelsForAthlete(a.id, confirmedLevels),
      };
    })
    .sort((x, y) => String(x.name || '').localeCompare(String(y.name || '')));
}

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

const KEYS = {
  athletes:       'mtb_athletes',
  observations:   'mtb_observations',
  confirmedLevels:'mtb_confirmed_levels',
  coach:          'mtb_coach',
  team:           'mtb_team',
};

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function load(key) {
  try {
    return JSON.parse(localStorage.getItem(key) ?? 'null') ?? [];
  } catch (e) {
    log.error('storage.read.error', { key, error: e.message });
    return [];
  }
}

function save(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

export function generateId() {
  // crypto.randomUUID() is available in all modern browsers and in Node 19+.
  // Fall back to a timestamp+random string for environments that lack it.
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function today() {
  return new Date().toISOString().slice(0, 10); // YYYY-MM-DD
}

// ---------------------------------------------------------------------------
// Coach / Team (v1: single coach, single team stored in settings)
// ---------------------------------------------------------------------------

export function getCoach() {
  try {
    return JSON.parse(localStorage.getItem(KEYS.coach) ?? 'null');
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
  localStorage.setItem(KEYS.coach, JSON.stringify(coach));
  return coach;
}

export function getTeamId() {
  try {
    const team = JSON.parse(localStorage.getItem(KEYS.team) ?? 'null');
    if (team?.id) return team.id;
  } catch { /* fall through */ }
  // Auto-create a stable team ID on first use.
  const id = generateId();
  localStorage.setItem(KEYS.team, JSON.stringify({ id }));
  return id;
}

// ---------------------------------------------------------------------------
// Athletes
// ---------------------------------------------------------------------------

export function getAthletes() {
  return load(KEYS.athletes);
}

/**
 * @param {{ name: string, grade?: number|null, season_year?: number }} fields
 */
export function saveAthlete(fields) {
  const athletes = load(KEYS.athletes);
  const isNew = !fields.id;
  const athlete = {
    id:          fields.id ?? generateId(),
    team_id:     getTeamId(),
    season_year: new Date().getFullYear(),
    grade:       null,
    ...fields,
  };
  if (isNew) {
    athletes.push(athlete);
  } else {
    const idx = athletes.findIndex(a => a.id === athlete.id);
    if (idx === -1) athletes.push(athlete);
    else athletes[idx] = athlete;
  }
  save(KEYS.athletes, athletes);
  return athlete;
}

export function deleteAthlete(id) {
  save(KEYS.athletes, load(KEYS.athletes).filter(a => a.id !== id));
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
  // Remove any prior confirmed level for this athlete+skill, then append.
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
 * Convenience: returns { body_position, braking, cornering } confirmed level
 * numbers for one athlete. Missing skills return 0.
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
// Import / Export
// ---------------------------------------------------------------------------

export function exportAll() {
  return JSON.stringify({
    exported_at:     new Date().toISOString(),
    schema_version:  1,
    coach:           getCoach(),
    team_id:         getTeamId(),
    athletes:        getAthletes(),
    observations:    getObservations(),
    confirmed_levels: getConfirmedLevels(),
    log:             JSON.parse(localStorage.getItem(LOG_KEY) || '[]'),
  }, null, 2);
}

/**
 * Replaces all local data with the contents of an export JSON string.
 * Call only after user confirmation — this is destructive.
 */
export function importAll(jsonString) {
  const data = JSON.parse(jsonString);
  if (data.athletes)        save(KEYS.athletes, data.athletes);
  if (data.observations)    save(KEYS.observations, data.observations);
  if (data.confirmed_levels) save(KEYS.confirmedLevels, data.confirmed_levels);
  if (data.coach)           localStorage.setItem(KEYS.coach, JSON.stringify(data.coach));
}

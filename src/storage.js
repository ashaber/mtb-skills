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
  athletes:       'mtb_athletes',      // preserved for backward compat
  observations:   'mtb_observations',
  confirmedLevels:'mtb_confirmed_levels',
  coach:          'mtb_coach',
  team:           'mtb_team',
  rosterFilter:   'mtb_roster_filter',
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
  const id = generateId();
  localStorage.setItem(KEYS.team, JSON.stringify({ id }));
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
  if (filter.role) return all.filter(p => p.role === filter.role);
  return all;
}

/**
 * @param {{ name: string, role?: string, category?: string|null, level?: number|null, grade?: number|null }} fields
 */
export function savePerson(fields) {
  const all = load(KEYS.athletes);
  const isNew = !fields.id;
  const role = fields.role ?? 'athlete';

  let category = null;
  let grade = null;
  let level = null;

  if (role === 'athlete') {
    category = fields.category ?? null;
    grade = category !== null ? categoryToGrade(category) : (fields.grade ?? null);
    level = null;
  } else {
    level = fields.level ?? null;
    category = null;
    grade = null;
  }

  const person = {
    id:          fields.id ?? generateId(),
    team_id:     getTeamId(),
    season_year: new Date().getFullYear(),
    name:        fields.name,
    role,
    category,
    grade,
    level,
    plate:       fields.plate ?? null,
    notes:       fields.notes ?? null,
    medical_notes:           fields.medical_notes ?? null,
    emergency_contact_name:  fields.emergency_contact_name ?? null,
    emergency_contact_phone: fields.emergency_contact_phone ?? null,
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
  return localStorage.getItem(KEYS.rosterFilter) ?? 'all';
}

export function saveRosterFilter(filter) {
  localStorage.setItem(KEYS.rosterFilter, filter);
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

export function getTodaysPractice() {
  const dateStr = today();
  const all = load(KEYS.practices);
  const existing = all.find(p => p.date === dateStr);
  if (existing) return existing;
  const coach = getCoach();
  const practice = {
    id:       generateId(),
    team_id:  getTeamId(),
    coach_id: coach?.id ?? null,
    date:     dateStr,
  };
  all.push(practice);
  save(KEYS.practices, all);
  return practice;
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
    log:              JSON.parse(localStorage.getItem(LOG_KEY) || '[]'),
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
  if (data.coach)            localStorage.setItem(KEYS.coach, JSON.stringify(data.coach));
  if (data.practices)        save(KEYS.practices, data.practices);
  if (data.attendance)       save(KEYS.attendance, data.attendance);
}

// ---------------------------------------------------------------------------
// Athlete photos (stored as data-URLs per athlete ID)
// ---------------------------------------------------------------------------
const PHOTO_KEY = 'mtb_photos';

export function getPhoto(athleteId) {
  try { return (JSON.parse(localStorage.getItem(PHOTO_KEY) || '{}'))[athleteId] || null; }
  catch { return null; }
}
export function savePhoto(athleteId, dataUrl) {
  const photos = JSON.parse(localStorage.getItem(PHOTO_KEY) || '{}');
  photos[athleteId] = dataUrl;
  localStorage.setItem(PHOTO_KEY, JSON.stringify(photos));
}

// ---------------------------------------------------------------------------
// Team / league settings (white-label name, coach display name)
// ---------------------------------------------------------------------------
const TEAM_SETTINGS_KEY = 'mtb_team_settings';

export function getTeamSettings() {
  try { return JSON.parse(localStorage.getItem(TEAM_SETTINGS_KEY) || '{}'); }
  catch { return {}; }
}
export function saveTeamSettings(settings) {
  const existing = getTeamSettings();
  localStorage.setItem(TEAM_SETTINGS_KEY, JSON.stringify({ ...existing, ...settings }));
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

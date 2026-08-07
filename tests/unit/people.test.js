import { describe, it, expect, beforeEach } from 'vitest';
import {
  savePerson, getPeople, deletePerson,
  saveAthlete, getAthletes,
  getRosterFilter, saveRosterFilter,
  createPractice, findTodaysPractice, endPractice,
  toggleAttendance, getAttendance, getAttendanceStatus,
  exportAll, importAll,
  generateId,
} from '../../src/storage.js';

beforeEach(() => {
  localStorage.clear();
});

// ── Person schema v2 ──────────────────────────────────────────────────────────

describe('savePerson — athlete', () => {
  it('defaults role to athlete', () => {
    const p = savePerson({ name: 'Alice' });
    expect(p.role).toBe('athlete');
  });

  it('derives grade from category', () => {
    const cases = [
      ['5th', 5], ['6th', 6], ['7th', 7], ['8th', 8],
      ['Freshman', 9], ['JV2', 10], ['JV1', 11], ['Varsity', 12],
    ];
    for (const [cat, expectedGrade] of cases) {
      localStorage.clear();
      const p = savePerson({ name: 'Rider', category: cat });
      expect(p.grade).toBe(expectedGrade);
    }
  });

  it('MS Advanced has null grade', () => {
    const p = savePerson({ name: 'Rider', category: 'MS Advanced' });
    expect(p.grade).toBeNull();
    expect(p.category).toBe('MS Advanced');
  });

  it('athlete with no category has null grade and null category', () => {
    const p = savePerson({ name: 'Rider', role: 'athlete' });
    expect(p.grade).toBeNull();
    expect(p.category).toBeNull();
  });

  it('assigns id and team_id', () => {
    const p = savePerson({ name: 'Rider' });
    expect(p.id).toBeTruthy();
    expect(p.team_id).toBeTruthy();
  });

  it('updates existing person by id', () => {
    const p = savePerson({ name: 'Original', category: 'JV1' });
    savePerson({ id: p.id, name: 'Updated', category: 'Varsity' });
    const all = getPeople();
    expect(all).toHaveLength(1);
    expect(all[0].name).toBe('Updated');
    expect(all[0].grade).toBe(12);
  });
});

// ── savePerson — merge-preserve on update (Phase 3.2) ─────────────────────────
// A sync pull passes only {id,name,role,ride_group_id,ride_group_name,tags,
// grade,category,external_id} — it must never wipe fields it doesn't
// mention, and new roster fields must round-trip.
describe('savePerson — update merge-preserve', () => {
  it('preserves an unlisted medical_notes field when the update omits it', () => {
    const p = savePerson({ name: 'Rider', medical_notes: 'Asthma — carries inhaler' });
    const updated = savePerson({ id: p.id, name: 'Rider Updated', role: 'athlete' });
    expect(updated.medical_notes).toBe('Asthma — carries inhaler');
    expect(updated.name).toBe('Rider Updated');
  });

  it('preserves emergency contact fields and plate/notes not mentioned in the update', () => {
    const p = savePerson({
      name: 'Rider',
      plate: 42,
      notes: 'Great cornering form',
      emergency_contact_name: 'Parent Name',
      emergency_contact_phone: '555-1234',
    });
    const updated = savePerson({ id: p.id, name: 'Rider', role: 'athlete', category: 'JV1' });
    expect(updated.plate).toBe(42);
    expect(updated.notes).toBe('Great cornering form');
    expect(updated.emergency_contact_name).toBe('Parent Name');
    expect(updated.emergency_contact_phone).toBe('555-1234');
  });

  it('preserves a locally-set photo-adjacent field (medical_notes) across a sync-shaped update', () => {
    const p = savePerson({ name: 'Rider', medical_notes: 'Bee sting allergy' });
    // Sync-shaped update: exactly the fields src/sync.js passes through.
    const synced = savePerson({
      id: p.id, name: 'Rider', role: 'athlete',
      ride_group_id: 'g1', ride_group_name: 'JV Boys', tags: ['lead'],
      grade: null, category: null, external_id: 'NICA-1',
    });
    expect(synced.medical_notes).toBe('Bee sting allergy');
  });

  it('an explicit null clears a field (does not fall back to existing)', () => {
    const p = savePerson({ name: 'Rider', notes: 'old note' });
    const updated = savePerson({ id: p.id, name: 'Rider', role: 'athlete', notes: null });
    expect(updated.notes).toBeNull();
  });

  it('round-trips ride_group_id, ride_group_name, and tags', () => {
    const p = savePerson({ name: 'Rider' });
    expect(p.ride_group_id).toBeNull();
    expect(p.ride_group_name).toBeNull();
    expect(p.tags).toEqual([]);

    const updated = savePerson({
      id: p.id, name: 'Rider', role: 'athlete',
      ride_group_id: 'g1', ride_group_name: 'JV Boys', tags: ['lead', 'sweep'],
    });
    expect(updated.ride_group_id).toBe('g1');
    expect(updated.ride_group_name).toBe('JV Boys');
    expect(updated.tags).toEqual(['lead', 'sweep']);
  });

  it('round-trips external_id and defaults it to null when never set', () => {
    const p = savePerson({ name: 'Rider' });
    expect(p.external_id).toBeNull();
    const updated = savePerson({ id: p.id, name: 'Rider', role: 'athlete', external_id: 'NICA-42' });
    expect(updated.external_id).toBe('NICA-42');
  });

  it('a second update that omits ride_group_id/tags preserves them from the prior sync', () => {
    const p = savePerson({ name: 'Rider', ride_group_id: 'g1', ride_group_name: 'JV Boys', tags: ['lead'] });
    const untouched = savePerson({ id: p.id, name: 'Rider Renamed' });
    expect(untouched.ride_group_id).toBe('g1');
    expect(untouched.ride_group_name).toBe('JV Boys');
    expect(untouched.tags).toEqual(['lead']);
  });
});

describe('savePerson — coach', () => {
  it('stores level, null category and grade', () => {
    const p = savePerson({ name: 'Coach Bob', role: 'coach', level: 2 });
    expect(p.role).toBe('coach');
    expect(p.level).toBe(2);
    expect(p.category).toBeNull();
    expect(p.grade).toBeNull();
  });

  it('accepts levels 1, 2, 3', () => {
    for (const lv of [1, 2, 3]) {
      localStorage.clear();
      const p = savePerson({ name: 'Coach', role: 'coach', level: lv });
      expect(p.level).toBe(lv);
    }
  });
});

describe('getPeople', () => {
  beforeEach(() => {
    savePerson({ name: 'Athlete A', role: 'athlete', category: 'JV1' });
    savePerson({ name: 'Coach B', role: 'coach', level: 2 });
    savePerson({ name: 'Athlete C', role: 'athlete', category: 'Freshman' });
  });

  it('returns all people by default', () => {
    expect(getPeople()).toHaveLength(3);
  });

  it('filters to athletes only', () => {
    const athletes = getPeople({ role: 'athlete' });
    expect(athletes).toHaveLength(2);
    expect(athletes.every(p => p.role === 'athlete')).toBe(true);
  });

  it('filters to coaches only', () => {
    const coaches = getPeople({ role: 'coach' });
    expect(coaches).toHaveLength(1);
    expect(coaches[0].name).toBe('Coach B');
  });
});

describe('deletePerson', () => {
  it('removes a person by id', () => {
    const p = savePerson({ name: 'To Remove' });
    deletePerson(p.id);
    expect(getPeople()).toHaveLength(0);
  });

  it('does not remove other people', () => {
    const a = savePerson({ name: 'Keep' });
    const b = savePerson({ name: 'Remove' });
    deletePerson(b.id);
    expect(getPeople()).toHaveLength(1);
    expect(getPeople()[0].id).toBe(a.id);
  });
});

// ── Backward compat ───────────────────────────────────────────────────────────

describe('backward compat aliases', () => {
  it('saveAthlete works and sets role: athlete', () => {
    const a = saveAthlete({ name: 'Old API' });
    expect(a.role).toBe('athlete');
  });

  it('getAthletes returns athletes only', () => {
    saveAthlete({ name: 'Athlete' });
    savePerson({ name: 'Coach', role: 'coach', level: 1 });
    expect(getAthletes()).toHaveLength(1);
    expect(getAthletes()[0].name).toBe('Athlete');
  });
});

// ── Roster filter ─────────────────────────────────────────────────────────────

describe('roster filter', () => {
  it('defaults to all', () => {
    expect(getRosterFilter()).toBe('all');
  });

  it('persists saved filter', () => {
    saveRosterFilter('coaches');
    expect(getRosterFilter()).toBe('coaches');
  });

  it('persists athletes filter', () => {
    saveRosterFilter('athletes');
    expect(getRosterFilter()).toBe('athletes');
  });
});

// ── Practice attendance ───────────────────────────────────────────────────────

describe('createPractice', () => {
  it('creates a practice for today', () => {
    const p = createPractice();
    expect(p.id).toBeTruthy();
    expect(p.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(p.status).toBe('active');
  });

  it('returns same practice on second call (idempotent)', () => {
    const p1 = createPractice();
    const p2 = createPractice();
    expect(p1.id).toBe(p2.id);
  });
});

describe('findTodaysPractice', () => {
  it('returns null when no practice exists', () => {
    expect(findTodaysPractice()).toBeNull();
  });

  it('returns the practice after createPractice', () => {
    const created = createPractice();
    const found = findTodaysPractice();
    expect(found).not.toBeNull();
    expect(found.id).toBe(created.id);
  });
});

describe('endPractice', () => {
  it('sets status to ended', () => {
    const p = createPractice();
    const ended = endPractice(p.id);
    expect(ended.status).toBe('ended');
  });

  it('returns null for unknown id', () => {
    expect(endPractice('nonexistent-id')).toBeNull();
  });
});

describe('toggleAttendance', () => {
  it('marks person as attending on first toggle', () => {
    const practice = createPractice();
    const person = savePerson({ name: 'Rider' });
    toggleAttendance(practice.id, person.id);
    expect(getAttendanceStatus(practice.id, person.id)).toBe('attending');
  });

  it('toggles back to absent on second toggle', () => {
    const practice = createPractice();
    const person = savePerson({ name: 'Rider' });
    toggleAttendance(practice.id, person.id);
    toggleAttendance(practice.id, person.id);
    expect(getAttendanceStatus(practice.id, person.id)).toBe('absent');
  });

  it('toggling again marks attending again', () => {
    const practice = createPractice();
    const person = savePerson({ name: 'Rider' });
    toggleAttendance(practice.id, person.id);
    toggleAttendance(practice.id, person.id);
    toggleAttendance(practice.id, person.id);
    expect(getAttendanceStatus(practice.id, person.id)).toBe('attending');
  });
});

describe('getAttendance', () => {
  it('returns empty array for new practice', () => {
    const practice = createPractice();
    expect(getAttendance(practice.id)).toHaveLength(0);
  });

  it('returns records for attended people', () => {
    const practice = createPractice();
    const p1 = savePerson({ name: 'A' });
    const p2 = savePerson({ name: 'B' });
    toggleAttendance(practice.id, p1.id);
    toggleAttendance(practice.id, p2.id);
    const att = getAttendance(practice.id);
    expect(att).toHaveLength(2);
    expect(att.every(a => a.status === 'attending')).toBe(true);
  });

  it('filters by practice_id', () => {
    const p1 = createPractice();
    const person = savePerson({ name: 'Rider' });
    toggleAttendance(p1.id, person.id);
    const fakePracticeId = generateId();
    expect(getAttendance(fakePracticeId)).toHaveLength(0);
  });
});

describe('getAttendanceStatus', () => {
  it('returns null for person not in practice', () => {
    const practice = createPractice();
    expect(getAttendanceStatus(practice.id, 'nonexistent-id')).toBeNull();
  });
});

// ── Export v2 ─────────────────────────────────────────────────────────────────

describe('exportAll v2', () => {
  it('schema_version is 2', () => {
    const data = JSON.parse(exportAll());
    expect(data.schema_version).toBe(2);
  });

  it('includes people key with role field', () => {
    savePerson({ name: 'Rider', category: 'JV1' });
    savePerson({ name: 'Coach', role: 'coach', level: 1 });
    const data = JSON.parse(exportAll());
    expect(data.people).toHaveLength(2);
    expect(data.people.some(p => p.role === 'coach')).toBe(true);
  });

  it('includes practices and attendance', () => {
    const practice = createPractice();
    const person = savePerson({ name: 'Rider' });
    toggleAttendance(practice.id, person.id);
    const data = JSON.parse(exportAll());
    expect(data.practices).toHaveLength(1);
    expect(data.attendance).toHaveLength(1);
  });
});

// ── Import v1 shim ────────────────────────────────────────────────────────────

describe('importAll v1 shim', () => {
  it('imports v1 athletes and adds role: athlete', () => {
    const v1Export = JSON.stringify({
      schema_version: 1,
      athletes: [{ id: generateId(), team_id: generateId(), name: 'Legacy Rider', grade: 10 }],
      observations: [],
      confirmed_levels: [],
    });
    importAll(v1Export);
    const people = getPeople();
    expect(people).toHaveLength(1);
    expect(people[0].role).toBe('athlete');
    expect(people[0].name).toBe('Legacy Rider');
  });
});

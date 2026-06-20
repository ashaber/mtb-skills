import { describe, it, expect, beforeEach } from 'vitest';
import {
  savePerson, getPeople, deletePerson,
  saveAthlete, getAthletes,
  getRosterFilter, saveRosterFilter,
  getTodaysPractice, toggleAttendance, getAttendance, getAttendanceStatus,
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

describe('getTodaysPractice', () => {
  it('creates a practice on first call', () => {
    const p = getTodaysPractice();
    expect(p.id).toBeTruthy();
    expect(p.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('returns same practice on second call (idempotent)', () => {
    const p1 = getTodaysPractice();
    const p2 = getTodaysPractice();
    expect(p1.id).toBe(p2.id);
  });
});

describe('toggleAttendance', () => {
  it('marks person as attending on first toggle', () => {
    const practice = getTodaysPractice();
    const person = savePerson({ name: 'Rider' });
    toggleAttendance(practice.id, person.id);
    expect(getAttendanceStatus(practice.id, person.id)).toBe('attending');
  });

  it('toggles back to absent on second toggle', () => {
    const practice = getTodaysPractice();
    const person = savePerson({ name: 'Rider' });
    toggleAttendance(practice.id, person.id);
    toggleAttendance(practice.id, person.id);
    expect(getAttendanceStatus(practice.id, person.id)).toBe('absent');
  });

  it('toggling again marks attending again', () => {
    const practice = getTodaysPractice();
    const person = savePerson({ name: 'Rider' });
    toggleAttendance(practice.id, person.id);
    toggleAttendance(practice.id, person.id);
    toggleAttendance(practice.id, person.id);
    expect(getAttendanceStatus(practice.id, person.id)).toBe('attending');
  });
});

describe('getAttendance', () => {
  it('returns empty array for new practice', () => {
    const practice = getTodaysPractice();
    expect(getAttendance(practice.id)).toHaveLength(0);
  });

  it('returns records for attended people', () => {
    const practice = getTodaysPractice();
    const p1 = savePerson({ name: 'A' });
    const p2 = savePerson({ name: 'B' });
    toggleAttendance(practice.id, p1.id);
    toggleAttendance(practice.id, p2.id);
    const att = getAttendance(practice.id);
    expect(att).toHaveLength(2);
    expect(att.every(a => a.status === 'attending')).toBe(true);
  });

  it('filters by practice_id', () => {
    const p1 = getTodaysPractice();
    const person = savePerson({ name: 'Rider' });
    toggleAttendance(p1.id, person.id);
    const fakePracticeId = generateId();
    expect(getAttendance(fakePracticeId)).toHaveLength(0);
  });
});

describe('getAttendanceStatus', () => {
  it('returns null for person not in practice', () => {
    const practice = getTodaysPractice();
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
    const practice = getTodaysPractice();
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

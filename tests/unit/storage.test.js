import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  generateId,
  getAthletes, saveAthlete, deleteAthlete,
  saveObservation, getObservations,
  setConfirmedLevel, getConfirmedLevels, getAthleteConfirmedLevels,
  getCoach, saveCoach, getTeamId,
  getPhoto, savePhoto,
  exportAll, importAll,
  createPractice, getPractices,
} from '../../src/storage.js';

beforeEach(() => {
  localStorage.clear();
});

describe('generateId', () => {
  it('returns a non-empty string', () => {
    const id = generateId();
    expect(typeof id).toBe('string');
    expect(id.length).toBeGreaterThan(0);
  });

  it('generates unique values across 100 calls', () => {
    const ids = new Set(Array.from({ length: 100 }, () => generateId()));
    expect(ids.size).toBe(100);
  });
});

describe('getTeamId', () => {
  it('creates and persists a stable team ID', () => {
    const id1 = getTeamId();
    const id2 = getTeamId();
    expect(id1).toBe(id2);
    expect(id1.length).toBeGreaterThan(0);
  });
});

describe('athletes', () => {
  it('starts empty', () => {
    expect(getAthletes()).toHaveLength(0);
  });

  it('saveAthlete creates an athlete with id and team_id', () => {
    const a = saveAthlete({ name: 'Test Rider' });
    expect(a.id).toBeTruthy();
    expect(a.team_id).toBeTruthy();
    expect(a.name).toBe('Test Rider');
  });

  it('getAthletes returns all saved athletes', () => {
    saveAthlete({ name: 'Alice' });
    saveAthlete({ name: 'Bob' });
    expect(getAthletes()).toHaveLength(2);
  });

  it('saveAthlete updates an existing athlete by id', () => {
    const a = saveAthlete({ name: 'Original' });
    saveAthlete({ id: a.id, name: 'Updated', team_id: a.team_id });
    const all = getAthletes();
    expect(all).toHaveLength(1);
    expect(all[0].name).toBe('Updated');
  });

  it('deleteAthlete removes the athlete', () => {
    const a = saveAthlete({ name: 'To Delete' });
    deleteAthlete(a.id);
    expect(getAthletes()).toHaveLength(0);
  });

  it('deleteAthlete does not affect other athletes', () => {
    const a1 = saveAthlete({ name: 'Keep' });
    const a2 = saveAthlete({ name: 'Remove' });
    deleteAthlete(a2.id);
    const all = getAthletes();
    expect(all).toHaveLength(1);
    expect(all[0].id).toBe(a1.id);
  });
});

describe('observations', () => {
  it('saveObservation returns a record with id and team_id', () => {
    const a = saveAthlete({ name: 'Rider' });
    const obs = saveObservation({ athlete_id: a.id, skill: 'braking', level_observed: 3 });
    expect(obs.id).toBeTruthy();
    expect(obs.team_id).toBeTruthy();
    expect(obs.level_observed).toBe(3);
    expect(obs.skill).toBe('braking');
  });

  it('observations are append-only — multiple saves accumulate', () => {
    const a = saveAthlete({ name: 'Rider' });
    saveObservation({ athlete_id: a.id, skill: 'braking', level_observed: 2 });
    saveObservation({ athlete_id: a.id, skill: 'braking', level_observed: 3 });
    expect(getObservations({ athlete_id: a.id })).toHaveLength(2);
  });

  it('getObservations filters by athlete_id', () => {
    const a1 = saveAthlete({ name: 'A' });
    const a2 = saveAthlete({ name: 'B' });
    saveObservation({ athlete_id: a1.id, skill: 'braking', level_observed: 2 });
    saveObservation({ athlete_id: a2.id, skill: 'braking', level_observed: 3 });
    expect(getObservations({ athlete_id: a1.id })).toHaveLength(1);
    expect(getObservations({ athlete_id: a2.id })).toHaveLength(1);
  });

  it('getObservations filters by skill', () => {
    const a = saveAthlete({ name: 'Rider' });
    saveObservation({ athlete_id: a.id, skill: 'braking', level_observed: 2 });
    saveObservation({ athlete_id: a.id, skill: 'cornering', level_observed: 3 });
    expect(getObservations({ skill: 'braking' })).toHaveLength(1);
    expect(getObservations({ skill: 'cornering' })).toHaveLength(1);
  });

  it('getObservations with no filters returns all records', () => {
    const a = saveAthlete({ name: 'Rider' });
    saveObservation({ athlete_id: a.id, skill: 'braking', level_observed: 2 });
    saveObservation({ athlete_id: a.id, skill: 'cornering', level_observed: 3 });
    expect(getObservations()).toHaveLength(2);
  });
});

describe('confirmed levels', () => {
  it('setConfirmedLevel stores an entry with team_id and confirmed_at', () => {
    const a = saveAthlete({ name: 'Rider' });
    const entry = setConfirmedLevel({ athlete_id: a.id, skill: 'braking', level: 3 });
    expect(entry.level).toBe(3);
    expect(entry.team_id).toBeTruthy();
    expect(entry.confirmed_at).toBeTruthy();
  });

  it('setConfirmedLevel replaces prior level for same athlete+skill', () => {
    const a = saveAthlete({ name: 'Rider' });
    setConfirmedLevel({ athlete_id: a.id, skill: 'braking', level: 2 });
    setConfirmedLevel({ athlete_id: a.id, skill: 'braking', level: 3 });
    const all = getConfirmedLevels({ athlete_id: a.id, skill: 'braking' });
    expect(all).toHaveLength(1);
    expect(all[0].level).toBe(3);
  });

  it('different skills for same athlete are stored independently', () => {
    const a = saveAthlete({ name: 'Rider' });
    setConfirmedLevel({ athlete_id: a.id, skill: 'braking', level: 3 });
    setConfirmedLevel({ athlete_id: a.id, skill: 'cornering', level: 2 });
    expect(getConfirmedLevels({ athlete_id: a.id })).toHaveLength(2);
  });

  it('getAthleteConfirmedLevels returns 0 for all unassessed skills', () => {
    const a = saveAthlete({ name: 'Rider' });
    const c = getAthleteConfirmedLevels(a.id);
    expect(c.body_position).toBe(0);
    expect(c.braking).toBe(0);
    expect(c.cornering).toBe(0);
  });

  it('getAthleteConfirmedLevels reflects confirmed values', () => {
    const a = saveAthlete({ name: 'Rider' });
    setConfirmedLevel({ athlete_id: a.id, skill: 'braking', level: 3 });
    const c = getAthleteConfirmedLevels(a.id);
    expect(c.braking).toBe(3);
    expect(c.body_position).toBe(0);
    expect(c.cornering).toBe(0);
  });
});

describe('coach', () => {
  it('getCoach returns null before any save', () => {
    expect(getCoach()).toBeNull();
  });

  it('saveCoach persists and returns the coach', () => {
    const coach = saveCoach({ name: 'Coach Andy' });
    expect(coach.name).toBe('Coach Andy');
    expect(coach.id).toBeTruthy();
    expect(coach.team_id).toBeTruthy();
    expect(getCoach()?.name).toBe('Coach Andy');
  });

  it('saveCoach preserves id on update', () => {
    const first = saveCoach({ name: 'Original' });
    const second = saveCoach({ name: 'Updated' });
    expect(second.id).toBe(first.id);
    expect(second.name).toBe('Updated');
  });
});

describe('exportAll / importAll', () => {
  it('exportAll includes all required top-level keys', () => {
    const data = JSON.parse(exportAll());
    for (const key of ['athletes', 'observations', 'confirmed_levels', 'log', 'schema_version', 'exported_at']) {
      expect(data).toHaveProperty(key);
    }
  });

  it('exportAll includes saved athlete data', () => {
    saveAthlete({ name: 'Export Test' });
    const data = JSON.parse(exportAll());
    expect(data.athletes).toHaveLength(1);
    expect(data.athletes[0].name).toBe('Export Test');
    expect(data.athletes[0].team_id).toBeTruthy();
  });

  it('importAll restores athletes and observations', () => {
    const a = saveAthlete({ name: 'Import Test' });
    saveObservation({ athlete_id: a.id, skill: 'braking', level_observed: 3 });
    const exported = exportAll();
    localStorage.clear();
    importAll(exported);
    expect(getAthletes()).toHaveLength(1);
    expect(getAthletes()[0].name).toBe('Import Test');
    expect(getObservations()).toHaveLength(1);
  });

  it('exportAll / importAll round-trip loses no data', () => {
    const a = saveAthlete({ name: 'Round Trip' });
    saveObservation({ athlete_id: a.id, skill: 'cornering', level_observed: 2 });
    setConfirmedLevel({ athlete_id: a.id, skill: 'cornering', level: 2 });
    const exported = exportAll();
    localStorage.clear();
    importAll(exported);
    const restored = getAthletes()[0];
    expect(restored.id).toBe(a.id);
    expect(restored.team_id).toBe(a.team_id);
    expect(getObservations({ athlete_id: a.id })).toHaveLength(1);
    const c = getAthleteConfirmedLevels(a.id);
    expect(c.cornering).toBe(2);
  });
});

describe('photos', () => {
  it('getPhoto returns null for unknown id', () => {
    expect(getPhoto('nonexistent-id')).toBeNull();
  });

  it('savePhoto / getPhoto round-trip', () => {
    const id = generateId();
    const dataUrl = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
    const ok = savePhoto(id, dataUrl);
    expect(ok).toBe(true);
    expect(getPhoto(id)).toBe(dataUrl);
  });

  it('savePhoto stores photos for multiple athletes independently', () => {
    const id1 = generateId();
    const id2 = generateId();
    const url1 = 'data:image/png;base64,AAA=';
    const url2 = 'data:image/png;base64,BBB=';
    savePhoto(id1, url1);
    savePhoto(id2, url2);
    expect(getPhoto(id1)).toBe(url1);
    expect(getPhoto(id2)).toBe(url2);
  });

  it('savePhoto overwrites existing photo for same athlete', () => {
    const id = generateId();
    savePhoto(id, 'data:image/png;base64,OLD=');
    savePhoto(id, 'data:image/png;base64,NEW=');
    expect(getPhoto(id)).toBe('data:image/png;base64,NEW=');
  });

  it('savePhoto returns false when localStorage is full', () => {
    const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation((key) => {
      if (key === 'mtb_photos') throw new DOMException('QuotaExceededError');
    });
    const ok = savePhoto(generateId(), 'data:image/png;base64,LARGE=');
    expect(ok).toBe(false);
    spy.mockRestore();
  });
});

describe('local date — practice and observation timestamps', () => {
  it('createPractice records local calendar date, not UTC', () => {
    const p = createPractice();
    const d = new Date();
    const localDate = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
    expect(p.date).toBe(localDate);
  });

  it('saveObservation session_date matches local calendar date', () => {
    const a = saveAthlete({ name: 'Date Test' });
    const obs = saveObservation({ athlete_id: a.id, skill: 'braking', level_observed: 2 });
    const d = new Date();
    const localDate = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
    expect(obs.session_date).toBe(localDate);
  });

  it('date format is YYYY-MM-DD with zero-padded month and day', () => {
    const p = createPractice();
    expect(p.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

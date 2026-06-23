import { describe, it, expect, beforeEach } from 'vitest';
import {
  createPractice, findTodaysPractice, endPractice, savePractice,
  getPractices, exportAll, importAll,
} from '../../src/storage.js';

beforeEach(() => {
  localStorage.clear();
});

// ── savePractice — partial update (merge, not overwrite) ──────────────────────

describe('savePractice', () => {
  it('merges reflection fields onto existing practice', () => {
    const p = createPractice();
    const updated = savePractice(p.id, { reflection: 'Great day', mood: 4, incidents: null });
    expect(updated.reflection).toBe('Great day');
    expect(updated.mood).toBe(4);
    expect(updated.incidents).toBeNull();
    // Core fields unchanged
    expect(updated.id).toBe(p.id);
    expect(updated.date).toBe(p.date);
    expect(updated.team_id).toBe(p.team_id);
  });

  it('does not overwrite fields not included in update', () => {
    const p = createPractice();
    savePractice(p.id, { reflection: 'First save' });
    const updated = savePractice(p.id, { mood: 3 });
    expect(updated.reflection).toBe('First save');
    expect(updated.mood).toBe(3);
  });

  it('can set status to ended via savePractice', () => {
    const p = createPractice();
    const updated = savePractice(p.id, { status: 'ended', mood: 5 });
    expect(updated.status).toBe('ended');
    expect(updated.mood).toBe(5);
  });

  it('returns null for unknown practice id', () => {
    const result = savePractice('nonexistent-id', { mood: 3 });
    expect(result).toBeNull();
  });

  it('persists to localStorage', () => {
    const p = createPractice();
    savePractice(p.id, { reflection: 'Persisted', mood: 2 });
    const all = getPractices();
    const saved = all.find(x => x.id === p.id);
    expect(saved.reflection).toBe('Persisted');
    expect(saved.mood).toBe(2);
  });
});

// ── Mood range validation ─────────────────────────────────────────────────────

describe('mood range', () => {
  it('accepts valid mood values 1–5', () => {
    const p = createPractice();
    for (const mood of [1, 2, 3, 4, 5]) {
      const updated = savePractice(p.id, { mood });
      expect(updated.mood).toBe(mood);
    }
  });

  it('stores null mood when not set', () => {
    const p = createPractice();
    const updated = savePractice(p.id, { mood: null });
    expect(updated.mood).toBeNull();
  });
});

// ── Export / import round-trip ────────────────────────────────────────────────

describe('export/import round-trip with reflection fields', () => {
  it('export includes reflection, mood, incidents on practice', () => {
    const p = createPractice();
    savePractice(p.id, { reflection: 'Round trip test', mood: 3, incidents: 'Minor fall' });
    const exported = JSON.parse(exportAll());
    const practice = exported.practices.find(x => x.id === p.id);
    expect(practice.reflection).toBe('Round trip test');
    expect(practice.mood).toBe(3);
    expect(practice.incidents).toBe('Minor fall');
  });

  it('import restores reflection fields', () => {
    const p = createPractice();
    savePractice(p.id, { reflection: 'Imported reflection', mood: 5 });
    const json = exportAll();
    localStorage.clear();
    importAll(json);
    const practices = getPractices();
    const restored = practices.find(x => x.id === p.id);
    expect(restored.reflection).toBe('Imported reflection');
    expect(restored.mood).toBe(5);
  });

  it('backward-compatible: import of old export without reflection fields', () => {
    const p = createPractice();
    const exported = JSON.parse(exportAll());
    // Simulate old export without reflection fields
    delete exported.practices[0].reflection;
    delete exported.practices[0].mood;
    delete exported.practices[0].incidents;
    localStorage.clear();
    importAll(JSON.stringify(exported));
    const practices = getPractices();
    const restored = practices.find(x => x.id === p.id);
    expect(restored).toBeDefined();
    expect(restored.reflection).toBeUndefined();
    expect(restored.mood).toBeUndefined();
    // App code should treat missing as null via optional chaining — no crash
  });
});

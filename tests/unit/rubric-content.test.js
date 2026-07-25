import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import _def from '../../src/rubric-default.js';

// loadRubricContent uses fetch + module-level lets — re-import fresh each test.
async function freshLoad() {
  vi.resetModules();
  return import('../../src/rubric-content.js');
}

describe('rubric-content defaults', () => {
  it('exports SKILLS with 3 skills before any fetch', async () => {
    const { SKILLS } = await freshLoad();
    expect(Object.keys(SKILLS)).toHaveLength(3);
    expect(SKILLS).toHaveProperty('body_position');
    expect(SKILLS).toHaveProperty('braking');
    expect(SKILLS).toHaveProperty('cornering');
  });

  it('each default skill has 5 levels with required fields', async () => {
    const { SKILLS } = await freshLoad();
    for (const skill of Object.values(SKILLS)) {
      for (let n = 1; n <= 5; n++) {
        const lv = skill.levels[n];
        expect(lv).toHaveProperty('consistency');
        expect(lv).toHaveProperty('failure_modes');
        expect(lv).toHaveProperty('detail');
        expect(Array.isArray(lv.failure_modes)).toBe(true);
      }
    }
  });

  it('exports SCORING_RULES as non-empty array', async () => {
    const { SCORING_RULES } = await freshLoad();
    expect(Array.isArray(SCORING_RULES)).toBe(true);
    expect(SCORING_RULES.length).toBeGreaterThan(0);
  });

  it('exports SCALE with 5 entries', async () => {
    const { SCALE } = await freshLoad();
    expect(SCALE).toHaveLength(5);
    expect(SCALE[0]).toHaveProperty('level');
    expect(SCALE[0]).toHaveProperty('trail');
    expect(SCALE[0]).toHaveProperty('consistency');
  });

  it('exports TRAIL_GUIDE with expected keys', async () => {
    const { TRAIL_GUIDE } = await freshLoad();
    expect(TRAIL_GUIDE).toHaveProperty('intro');
    expect(TRAIL_GUIDE).toHaveProperty('assessment_rules');
    expect(Array.isArray(TRAIL_GUIDE.assessment_rules)).toBe(true);
  });

  it('exports COACH_NOTES with expected keys', async () => {
    const { COACH_NOTES } = await freshLoad();
    expect(COACH_NOTES).toHaveProperty('fitts_posner');
    expect(COACH_NOTES).toHaveProperty('common_errors');
    expect(Array.isArray(COACH_NOTES.common_errors)).toBe(true);
  });
});

describe('loadRubricContent — fetch success', () => {
  beforeEach(() => { vi.stubGlobal('fetch', vi.fn()); });
  afterEach(() => { vi.unstubAllGlobals(); });

  it('updates SKILLS from fetched JSON', async () => {
    const patched = {
      SKILLS: {
        body_position: { description: 'PATCHED', levels: { 1: { consistency: 'x', failure_modes: ['x'], detail: 'x' }, 2: { consistency: 'x', failure_modes: [], detail: 'x' }, 3: { consistency: 'x', failure_modes: [], detail: 'x' }, 4: { consistency: 'x', failure_modes: [], detail: 'x' }, 5: { consistency: 'x', failure_modes: [], detail: 'x' } }, dimensions: [] },
        braking:       { description: 'PATCHED', levels: { 1: { consistency: 'x', failure_modes: [], detail: 'x' }, 2: { consistency: 'x', failure_modes: [], detail: 'x' }, 3: { consistency: 'x', failure_modes: [], detail: 'x' }, 4: { consistency: 'x', failure_modes: [], detail: 'x' }, 5: { consistency: 'x', failure_modes: [], detail: 'x' } }, dimensions: [] },
        cornering:     { description: 'PATCHED', levels: { 1: { consistency: 'x', failure_modes: [], detail: 'x' }, 2: { consistency: 'x', failure_modes: [], detail: 'x' }, 3: { consistency: 'x', failure_modes: [], detail: 'x' }, 4: { consistency: 'x', failure_modes: [], detail: 'x' }, 5: { consistency: 'x', failure_modes: [], detail: 'x' } }, dimensions: [] },
      },
      SCORING_RULES: ['patched rule'],
    };
    fetch.mockResolvedValueOnce({ ok: true, json: async () => patched });

    const mod = await freshLoad();
    await mod.loadRubricContent('');

    expect(mod.SKILLS.body_position.description).toBe('PATCHED');
    expect(mod.SCORING_RULES).toEqual(['patched rule']);
  });

  it('preserves defaults for keys not present in fetched JSON', async () => {
    fetch.mockResolvedValueOnce({ ok: true, json: async () => ({ SCORING_RULES: ['only this'] }) });
    const mod = await freshLoad();
    await mod.loadRubricContent('');

    expect(mod.SCORING_RULES).toEqual(['only this']);
    // SKILLS was not in the payload — should still be defaults
    expect(mod.SKILLS).toEqual(_def.SKILLS);
  });
});

describe('loadRubricContent — fetch failure', () => {
  beforeEach(() => { vi.stubGlobal('fetch', vi.fn()); });
  afterEach(() => { vi.unstubAllGlobals(); });

  it('keeps bundled defaults when fetch rejects (offline)', async () => {
    fetch.mockRejectedValueOnce(new Error('network error'));
    const mod = await freshLoad();
    await mod.loadRubricContent('');
    expect(mod.SKILLS).toEqual(_def.SKILLS);
    expect(mod.TRAIL_GUIDE).toEqual(_def.TRAIL_GUIDE);
  });

  it('keeps bundled defaults when server returns non-ok status', async () => {
    fetch.mockResolvedValueOnce({ ok: false, status: 404 });
    const mod = await freshLoad();
    await mod.loadRubricContent('');
    expect(mod.SKILLS).toEqual(_def.SKILLS);
  });
});

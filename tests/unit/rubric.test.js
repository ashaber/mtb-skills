import { describe, it, expect } from 'vitest';
import {
  SKILLS,
  SKILL_IDS,
  TRAIL_MINIMUMS,
  TRAIL_LABELS,
  trailReadiness,
} from '../../src/rubric.js';

describe('SKILLS data shape', () => {
  it('exports exactly 3 skills', () => {
    expect(SKILL_IDS).toHaveLength(3);
    expect(SKILL_IDS).toContain('body_position');
    expect(SKILL_IDS).toContain('braking');
    expect(SKILL_IDS).toContain('cornering');
  });

  it('each skill has 5 levels', () => {
    for (const id of SKILL_IDS) {
      expect(Object.keys(SKILLS[id].levels)).toHaveLength(5);
    }
  });

  it('each level has required fields with non-empty content', () => {
    for (const id of SKILL_IDS) {
      for (let n = 1; n <= 5; n++) {
        const level = SKILLS[id].levels[n];
        expect(level).toHaveProperty('when_breaks');
        expect(level).toHaveProperty('failure_modes');
        expect(level).toHaveProperty('detail');
        expect(Array.isArray(level.failure_modes)).toBe(true);
        expect(level.failure_modes.length).toBeGreaterThan(0);
        expect(level.when_breaks.length).toBeGreaterThan(0);
        expect(level.detail.length).toBeGreaterThan(0);
      }
    }
  });

  it('TRAIL_MINIMUMS and TRAIL_LABELS have matching keys', () => {
    expect(Object.keys(TRAIL_MINIMUMS)).toEqual(Object.keys(TRAIL_LABELS));
  });

  it('trail minimums reference only known skills', () => {
    for (const mins of Object.values(TRAIL_MINIMUMS)) {
      for (const skill of Object.keys(mins)) {
        expect(SKILL_IDS).toContain(skill);
      }
    }
  });
});

describe('trailReadiness', () => {
  it('returns empty array when all levels are 0', () => {
    expect(trailReadiness({ body_position: 0, braking: 0, cornering: 0 })).toHaveLength(0);
  });

  it('returns empty array for empty object', () => {
    expect(trailReadiness({})).toHaveLength(0);
  });

  it('unlocks green at BP≥2, Braking≥1, Cornering≥1', () => {
    const ready = trailReadiness({ body_position: 2, braking: 1, cornering: 1 });
    expect(ready).toContain('green');
    expect(ready).not.toContain('blue');
  });

  it('does not unlock green if any minimum is unmet', () => {
    expect(trailReadiness({ body_position: 1, braking: 1, cornering: 1 })).not.toContain('green');
    expect(trailReadiness({ body_position: 2, braking: 1, cornering: 0 })).not.toContain('green');
  });

  it('unlocks green and blue at BP≥2, Braking≥2, Cornering≥2', () => {
    const ready = trailReadiness({ body_position: 2, braking: 2, cornering: 2 });
    expect(ready).toContain('green');
    expect(ready).toContain('blue');
    expect(ready).not.toContain('black');
  });

  it('unlocks green, blue, black at 3-3-3', () => {
    const ready = trailReadiness({ body_position: 3, braking: 3, cornering: 3 });
    expect(ready).toContain('green');
    expect(ready).toContain('blue');
    expect(ready).toContain('black');
    expect(ready).not.toContain('double_black');
  });

  it('unlocks all 4 trails at 5-4-5', () => {
    const ready = trailReadiness({ body_position: 5, braking: 4, cornering: 5 });
    expect(ready).toHaveLength(4);
    expect(ready).toContain('double_black');
  });

  it('higher levels satisfy lower trail minimums', () => {
    const ready = trailReadiness({ body_position: 5, braking: 5, cornering: 5 });
    expect(ready).toHaveLength(4);
  });
});

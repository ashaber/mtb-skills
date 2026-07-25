import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { progressionStripHTML } from '../../src/ui.js';
import _def from '../../src/rubric-default.js';

// ── IDEA-015: per-level progression deltas ───────────────────────────────────
// Each level 2–5 carries a `progression` block describing what changed vs the
// level below: adds (skill gained), resolves (failures that drop away),
// terrain (trail class unlocked), how_to (drills/cues that develop INTO it).

const SKILL_IDS = ['body_position', 'braking', 'cornering'];

describe('progression content — completeness', () => {
  it('levels 2–5 of every skill have a well-formed progression block', () => {
    for (const id of SKILL_IDS) {
      for (let n = 2; n <= 5; n++) {
        const prog = _def.SKILLS[id].levels[n].progression;
        expect(prog, `${id} L${n} progression`).toBeTruthy();

        expect(Array.isArray(prog.adds), `${id} L${n} adds`).toBe(true);
        expect(prog.adds.length, `${id} L${n} adds`).toBeGreaterThan(0);

        expect(Array.isArray(prog.resolves), `${id} L${n} resolves`).toBe(true);
        expect(prog.resolves.length, `${id} L${n} resolves`).toBeGreaterThan(0);

        expect(typeof prog.terrain, `${id} L${n} terrain`).toBe('string');
        expect(prog.terrain.length, `${id} L${n} terrain`).toBeGreaterThan(0);

        expect(Array.isArray(prog.how_to), `${id} L${n} how_to`).toBe(true);
        expect(prog.how_to.length, `${id} L${n} how_to`).toBeGreaterThan(0);
      }
    }
  });

  // Level 1 is the baseline, so a progression block there is OPTIONAL — there is
  // no level below it to improve on. Content authors may still add one (terrain
  // and adds render fine); if they do, it must be well-formed.
  it('tolerates an optional, well-formed progression block on level 1', () => {
    for (const id of SKILL_IDS) {
      const prog = _def.SKILLS[id].levels[1].progression;
      if (!prog) continue;
      for (const key of ['adds', 'resolves', 'how_to']) {
        if (prog[key] !== undefined) expect(Array.isArray(prog[key]), `${id} L1 ${key}`).toBe(true);
      }
      if (prog.terrain !== undefined) expect(typeof prog.terrain).toBe('string');
    }
  });

  it('does not use the retired "Gary Test" term anywhere in rubric content', () => {
    expect(JSON.stringify(_def)).not.toMatch(/Gary Test/i);
  });

  // "breaks" is too easily confused with "brakes" in a rubric that scores braking.
  it('never uses the word "break" in coach-facing content', () => {
    const stray = JSON.stringify(_def).match(/[^"]*break[^"]*/gi);
    expect(stray, `found: ${stray?.join(' | ')}`).toBeNull();
  });

  // Skill level and trail rating are different scales — never equate them.
  it('describes terrain by its character, not by a trail rating', () => {
    for (const id of SKILL_IDS) {
      for (let n = 2; n <= 5; n++) {
        const t = _def.SKILLS[id].levels[n].progression.terrain;
        expect(t, `${id} L${n}: ${t}`).not.toMatch(/green|blue|black|◆|■|●/i);
      }
    }
  });

  it('every level carries a consistency gate (replaces when_breaks)', () => {
    for (const id of SKILL_IDS) {
      for (let n = 1; n <= 5; n++) {
        expect(_def.SKILLS[id].levels[n].consistency, `${id} L${n}`).toBeTruthy();
        expect(_def.SKILLS[id].levels[n].when_breaks).toBeUndefined();
      }
    }
  });
});

describe('bundled fallback is public/rubric.json', () => {
  it('imports the same content that is served at /rubric.json', () => {
    const fromJson = JSON.parse(readFileSync(join(process.cwd(), 'public/rubric.json'), 'utf8'));
    expect(_def).toEqual(fromJson);
  });
});

describe('progressionStripHTML', () => {
  const prog = {
    adds: ['Stands off the saddle', 'Eyes lift off the front wheel'],
    resolves: ['No longer seated', 'No longer staring down'],
    terrain: 'Green ● — easy trail',
    how_to: ['Ready-position holds'],
  };

  it('returns empty string for missing progression', () => {
    expect(progressionStripHTML(null)).toBe('');
    expect(progressionStripHTML(undefined)).toBe('');
  });

  it('renders an item from each of the three categories', () => {
    const html = progressionStripHTML(prog);
    expect(html).toContain('Stands off the saddle');
    expect(html).toContain('No longer seated');
    expect(html).toContain('Green ● — easy trail');
  });

  it('includes all three directional icons', () => {
    const html = progressionStripHTML(prog);
    expect(html).toContain('prog-line--adds');
    expect(html).toContain('prog-line--resolves');
    expect(html).toContain('prog-line--terrain');
    expect((html.match(/<svg/g) || []).length).toBe(3);
  });

  it('renders every item — the card has room now that the old columns are gone', () => {
    const many = { ...prog, adds: ['a one', 'b two', 'c three', 'd four'] };
    const html = progressionStripHTML(many);
    for (const t of ['a one', 'b two', 'c three', 'd four']) expect(html).toContain(t);
  });

  it('labels each category', () => {
    const html = progressionStripHTML(prog);
    expect(html).toContain('Adds');
    expect(html).toContain('Fewer failures');
    expect(html).toContain('Terrain');
  });

  it('escapes HTML in content', () => {
    const nasty = { ...prog, adds: ['<img src=x onerror=alert(1)>'], resolves: [], terrain: '' };
    const html = progressionStripHTML(nasty);
    expect(html).not.toContain('<img');
    expect(html).toContain('&lt;img');
  });

  it('omits a category that has no content', () => {
    const html = progressionStripHTML({ adds: ['only this'], resolves: [], terrain: '', how_to: [] });
    expect(html).toContain('prog-line--adds');
    expect(html).not.toContain('prog-line--resolves');
    expect(html).not.toContain('prog-line--terrain');
  });

  it('does not render the how_to items — those belong to the guide expander', () => {
    const html = progressionStripHTML(prog);
    expect(html).not.toContain('Ready-position holds');
  });
});

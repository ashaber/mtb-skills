import { describe, it, expect } from 'vitest';
import { levelSelectorHTML } from '../../src/ui.js';

// ── IDEA-013: full-card level selector uses preview-level, not draft-level ────

describe('levelSelectorHTML', () => {
  it('uses preview-level action when size is full', () => {
    const html = levelSelectorHTML('cornering', 3, 'athlete-1', 'full');
    expect(html).toContain('data-a="preview-level"');
    expect(html).not.toContain('data-a="draft-level"');
  });

  it('uses draft-level action when size is compact (default)', () => {
    const html = levelSelectorHTML('cornering', 3, 'athlete-1', 'compact');
    expect(html).toContain('data-a="draft-level"');
    expect(html).not.toContain('data-a="preview-level"');
  });

  it('uses draft-level when no size provided', () => {
    const html = levelSelectorHTML('braking', 2, 'athlete-2');
    expect(html).toContain('data-a="draft-level"');
  });

  it('marks selected level with sel class', () => {
    const html = levelSelectorHTML('body_position', 4, 'athlete-3', 'full');
    // Level 4 button should have sel class
    expect(html).toMatch(/class="lv-seg sel"[^>]*data-n="4"/);
  });

  it('includes all 5 levels', () => {
    const html = levelSelectorHTML('braking', 1, 'athlete-4', 'full');
    [1, 2, 3, 4, 5].forEach(n => {
      expect(html).toContain(`data-n="${n}"`);
    });
  });

  it('passes through skill and athleteId as data attributes', () => {
    const html = levelSelectorHTML('cornering', 2, 'abc-123', 'full');
    expect(html).toContain('data-sk="cornering"');
    expect(html).toContain('data-aid="abc-123"');
  });
});

// ── IDEA-014: feedback mode localStorage toggle ───────────────────────────────

describe('feedback mode localStorage', () => {
  it('defaults to on when key is absent', () => {
    localStorage.removeItem('mtb_feedback_mode');
    const on = localStorage.getItem('mtb_feedback_mode') !== 'false';
    expect(on).toBe(true);
  });

  it('is off when explicitly set to false', () => {
    localStorage.setItem('mtb_feedback_mode', 'false');
    const on = localStorage.getItem('mtb_feedback_mode') !== 'false';
    expect(on).toBe(false);
    localStorage.removeItem('mtb_feedback_mode');
  });

  it('is on when explicitly set to true', () => {
    localStorage.setItem('mtb_feedback_mode', 'true');
    const on = localStorage.getItem('mtb_feedback_mode') !== 'false';
    expect(on).toBe(true);
    localStorage.removeItem('mtb_feedback_mode');
  });
});

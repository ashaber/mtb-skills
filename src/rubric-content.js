/**
 * Rubric content — fetched from public/rubric.json at startup.
 * Exports are live bindings: after loadRubricContent() resolves, all importers
 * see the updated values without re-importing.
 * Falls back to bundled defaults (rubric-default.js) if fetch fails.
 */
import log from './log.js';
import _def from './rubric-default.js';

export let SKILLS        = _def.SKILLS;
export let SCORING_RULES = _def.SCORING_RULES;
export let SCALE         = _def.SCALE;
export let TRAIL_GUIDE   = _def.TRAIL_GUIDE;
export let COACH_NOTES   = _def.COACH_NOTES;

export async function loadRubricContent(base = '') {
  try {
    const url = `${base}/rubric.json`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    if (data.SKILLS)        SKILLS        = data.SKILLS;
    if (data.SCORING_RULES) SCORING_RULES = data.SCORING_RULES;
    if (data.SCALE)         SCALE         = data.SCALE;
    if (data.TRAIL_GUIDE)   TRAIL_GUIDE   = data.TRAIL_GUIDE;
    if (data.COACH_NOTES)   COACH_NOTES   = data.COACH_NOTES;
    log.info('rubric.json loaded', { url });
  } catch (e) {
    log.warn('rubric.json fetch failed, using bundled defaults', { error: String(e) });
  }
}

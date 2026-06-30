// Structural constants — these have code implications if changed.
// Rubric text content lives in public/rubric.json (GitHub-editable).
// See src/rubric-content.js for fetch + live bindings.

export const SKILL_IDS = ['body_position', 'braking', 'cornering'];

export const TRAIL_MINIMUMS = {
  green:        { body_position: 2, braking: 1, cornering: 1 },
  blue:         { body_position: 2, braking: 2, cornering: 2 },
  black:        { body_position: 3, braking: 3, cornering: 3 },
  double_black: { body_position: 5, braking: 4, cornering: 5 },
};

export const TRAIL_LABELS = {
  green:        'Green ●',
  blue:         'Blue ■',
  black:        'Black ◆',
  double_black: 'Dbl Black ◆◆',
};

/**
 * Returns which trails an athlete is ready for given their confirmed levels.
 * @param {{ body_position?: number, braking?: number, cornering?: number }} confirmedLevels
 * @returns {string[]} trail keys the athlete meets minimums for
 */
export function trailReadiness(confirmedLevels) {
  return Object.entries(TRAIL_MINIMUMS)
    .filter(([, mins]) =>
      Object.entries(mins).every(
        ([skill, min]) => (confirmedLevels[skill] ?? 0) >= min
      )
    )
    .map(([trail]) => trail);
}

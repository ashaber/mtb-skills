// Authoritative rubric data. All app views derive from this — never hard-code
// skill names, level descriptions, or trail minimums elsewhere.

export const SCORING_RULES = [
  'Consistent = earns the level. One good rep does not qualify.',
  'Any single item on the failure list = level not met.',
  'Speed or trail complexity can trigger any failure mode.',
  'Assess under real trail conditions whenever possible.',
  'Assess at start of every season — skills regress in off-season.',
];

export const SCALE = [
  { level: 1, trail: 'Paved / no rating',       consistency: 'Breaks on anything beyond flat' },
  { level: 2, trail: 'Green ● — Easy',           consistency: 'Breaks with distraction or challenge' },
  { level: 3, trail: 'Blue ■ — More Difficult',  consistency: 'Breaks when over-challenged' },
  { level: 4, trail: 'Black ◆ — Very Difficult', consistency: 'Breaks only at extreme consequence' },
  { level: 5, trail: 'Dbl Black ◆◆',            consistency: 'Essentially does not break' },
];

// Failure modes are from the card content (master). Detail is from the reference doc.
export const SKILLS = {
  body_position: {
    id: 'body_position',
    name: 'Body Position',
    description: 'Foundation for Braking and Cornering. Three accumulated steps: (1) standing ready appropriate to terrain, (2) BBS S/S and F/B, (3) pumping / pressure control.',
    levels: {
      1: {
        when_breaks: 'Breaks on anything beyond flat',
        failure_modes: [
          'Seated or knees pinch saddle',
          'Rigid — no BBS possible',
          'Looks at front wheel',
          'No ready position',
          '3 Key Essentials absent',
        ],
        detail: 'Knees pinch saddle or seated rather than standing ready. Rigid on bike — no BBS possible. Looks at front wheel. 3 Key Essentials absent or inconsistent: no deep bend in elbows and knees, elbows not wide, weight not in feet.',
      },
      2: {
        when_breaks: 'Breaks with distraction or challenge',
        failure_modes: [
          'Standing but rigid',
          'Weight shifts fwd or back unintentionally',
          'BBS absent',
          'Loses ready with distraction',
        ],
        detail: 'Standing but rigid. Weight shifts forward or back unintentionally — from habit, misunderstanding, or fear. Does not reliably adjust tall/low ready to terrain. BBS S/S and F/B absent or minimal. 3 Key Essentials fail with distraction or challenge.',
      },
      3: {
        when_breaks: 'Breaks when over-challenged',
        failure_modes: [
          'BBS breaks under pressure',
          'Pressure control only emerging on features',
          '3 Key Essentials reliable (positive gate)',
        ],
        detail: 'Standing ready appropriate to terrain most of the time. Tall/low selection mostly correct. 3 Key Essentials reliable. BBS S/S and F/B present most of the time. Pressure control emerging — intentional F/B loading beginning to appear on features, inconsistent. Reverts to stiff or close vision only when significantly over-challenged.',
      },
      4: {
        when_breaks: 'Breaks only at extreme consequence',
        failure_modes: [
          'BBS always present (positive gate)',
          'Pressure control consistent',
          'Intentional loading for features',
          'Largely autonomous',
        ],
        detail: 'Always adjusts tall/low ready appropriately to terrain steepness and features. 3 Key Essentials automatic. BBS S/S and F/B always present. Intentional F/B loading for features — lunge on roll-down, step-up. Pressure control consistent. Foundation for front wheel lifts (OTB-201). Largely autonomous — no conscious attention required.',
      },
      5: {
        when_breaks: 'Essentially does not break',
        failure_modes: [
          'Full tactical pressure control any terrain',
          'Beyond NICA trail scope',
        ],
        detail: 'Low ready automatic under all conditions. Full pumping / pressure control automatic across all features and terrain. Foundation for wheelies and manuals (OTB-301). Fully autonomous — tactical application. Beyond NICA trail scope.',
      },
    },
  },

  braking: {
    id: 'braking',
    name: 'Braking',
    description: 'Builds on standing ready position. Three accumulated steps: (1) both brakes with modulation, (2) bracing leg and hips back, (3) timing for corners and trail braking.',
    levels: {
      1: {
        when_breaks: 'Breaks on anything beyond flat',
        failure_modes: [
          'Rear brake only',
          '2–3 fingers on lever',
          'Grabs and skids',
          'Afraid to brake hard',
          'Brakes in corners',
        ],
        detail: 'Rear brake only or heavily rear-biased. Two or three fingers on levers — no modulation possible. Grabs brakes resulting in skid. Afraid to brake hard — limited ability to slow down. Brakes in corners as default behavior.',
      },
      2: {
        when_breaks: 'Breaks in unexpected stops',
        failure_modes: [
          'Yanks rear under surprise',
          'Skids',
          'Body shifts forward',
          'Brakes in corners when scared',
        ],
        detail: 'Even front/rear braking under perfect conditions. Unexpected stop yanks rear only — skids. Upper body shifts forward compounding the skid. Bracing leg present in controlled expected stops, lost in unexpected scenarios. Brakes in corners as panic response to speed or consequence.',
      },
      3: {
        when_breaks: 'Breaks at extreme surprise',
        failure_modes: [
          'Rarely skids (positive gate)',
          'Bracing leg lost at extreme surprise',
          'Hips back and down: learning, not yet reliable',
        ],
        detail: 'Good modulation — rarely skids. Powerful braking, short stopping distance. Bracing leg consistent except most extreme surprise stops. Hips back and down introduced — learning the movement, present sometimes in normal stops, not yet reliable under pressure or surprise. Maintains body position enabling transition to cornering.',
      },
      4: {
        when_breaks: 'Breaks only at extreme consequence',
        failure_modes: [
          'Never skids (positive gate)',
          'Hips back and down automatic',
          'Always braces leg',
          'Brakes before corners',
          'Correct braking when surprised (Gary Test)',
        ],
        detail: 'Never skids. Both brakes always consistent. Braking always solid on any terrain — planned and emergency stops. Hips back and down automatic. Always braces leg including emergency situations. Brakes before corners consistently. Correct braking maintained in unexpected stops — passes Gary Test on trail.',
      },
      5: {
        when_breaks: 'Essentially does not break',
        failure_modes: [
          'Full tactical braking',
          'Precise modulation + timing',
          'Front/rear intentional',
          'Beyond NICA trail scope',
        ],
        detail: 'All foundational braking always correct. Precise modulation, timing, and intentional front/rear pressure for any conditions. Carries speed to last second before corner — brakes hard to precise entry speed — releases front first, trails rear to settle suspension. Holds rear brake through steep corners to manage speed. Senses traction loss on slippery surfaces and modulates in real time.',
      },
    },
  },

  cornering: {
    id: 'cornering',
    name: 'Cornering',
    description: 'Most extensive step progression. Sequence accumulates: Level 2: BBS S/S lean + maintains ready. Level 3: Low-Look-Lean + hip rotation/counterbalance. Level 4: Full sequence consistent. Level 5: Pumping / pressure control through apex.',
    levels: {
      1: {
        when_breaks: 'Breaks on anything beyond flat',
        failure_modes: [
          'Steers all corners',
          'No lean or leans to outside',
          'Seated — no ready',
          'Pedals uneven',
        ],
        detail: 'Setup: Pedals uneven or inside pedal down. Seated — no ready position. Lean: No bike lean or leans to outside. Steers through all corners. Eyes: On front tire or threat — increases perceived speed, triggers panic.',
      },
      2: {
        when_breaks: 'Breaks at faster or unpredictable corners',
        failure_modes: [
          'Body-bike locked same lean',
          'Knees squeezed',
          'Steers under pressure',
          'Eyes on threat',
          'Weight too far fwd or back',
        ],
        detail: 'Setup: Outside or inside pedal down. Seated or tall ready entering corner. Lean: Body and bike locked same lean — knees squeezed, no BBS S/S. May lean to outside. Steers rather than leans, especially under speed. Eyes: On front tire or threat rather than through exit. Panic: Braking in corner, weight back, squeezes bike and steers to compensate.',
      },
      3: {
        when_breaks: 'Breaks at higher speed or consequence',
        failure_modes: [
          'BBS lean breaks under pressure',
          'Hip rotation only in ideal conditions',
          'Ready erodes mid-corner',
          'Weight shifts under pressure',
        ],
        detail: 'Setup: Pedals level on entry most of the time. Low ready present but erodes mid-corner. Lean: BBS S/S lean consistent — correct direction, knees wide, elbows hinge, seat shifts toward inside thigh. Lean limited to OTB-101 range. Hip: Hip rotation and counterbalance present under ideal conditions only. Eyes: Through exit most of the time. Reverts under pressure.',
      },
      4: {
        when_breaks: 'Breaks only at extreme consequence',
        failure_modes: [
          'Hip rotation breaks at extreme consequence',
          'Pressure control only on consistent banked corners',
          'Largely autonomous (positive gate)',
        ],
        detail: 'Setup: Level pedals consistent. Low ready maintained through arc always. Lean: BBS S/S consistent. Hip: Hip rotation and counterbalance always consistent on blue/black terrain. Eyes: Through exit consistently. Rarely reverts. Weight: Stable through arc. Pressure control present under ideal conditions — consistent banked corners.',
      },
      5: {
        when_breaks: 'Essentially does not break',
        failure_modes: [
          'Full sequence any terrain',
          'Pumps the apex',
          'Beyond NICA trail scope',
        ],
        detail: 'Full sequence consistent under any conditions — rocky, off-camber, loose, rutted, drop exits. Pumps the apex: dynamic pressure load through corner peak maximises traction. Applied to mid-corner features (roots, rolls, drops). Momentum-dependent — cannot be held statically.',
      },
    },
  },
};

export const SKILL_IDS = Object.keys(SKILLS);

// Trail readiness: minimum confirmed level required per skill.
// Floors not ceilings — match to the hardest feature on the trail.
export const TRAIL_MINIMUMS = {
  green:        { body_position: 2, braking: 2, cornering: 1 },
  blue:         { body_position: 3, braking: 2, cornering: 2 },
  black:        { body_position: 3, braking: 3, cornering: 3 },
  double_black: { body_position: 4, braking: 4, cornering: 4 },
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

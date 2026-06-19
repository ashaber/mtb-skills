/**
 * src/trading.js — athlete trading card encode / decode.
 * Pure functions: no DOM, no storage, no side-effects.
 */

/**
 * Encode an athlete record + confirmed levels into a QR payload JSON string.
 * @param {object} athlete
 * @param {{ body_position: number, braking: number, cornering: number }} confirmedLevels
 * @returns {string}
 */
export function encodeCard(athlete, confirmedLevels) {
  return JSON.stringify({
    v:                        1,
    source_athlete_id:        athlete.id,
    name:                     athlete.name,
    grade:                    athlete.grade ?? null,
    medical_notes:            athlete.medical_notes ?? null,
    emergency_contact_name:   athlete.emergency_contact_name ?? null,
    emergency_contact_phone:  athlete.emergency_contact_phone ?? null,
    confirmed_levels: {
      body_position: confirmedLevels.body_position || null,
      braking:       confirmedLevels.braking       || null,
      cornering:     confirmedLevels.cornering     || null,
    },
  });
}

/**
 * Decode and validate a raw QR string.
 * Throws a descriptive Error if the payload is not a valid trading card.
 * @param {string} jsonString
 * @returns {object}
 */
export function decodeCard(jsonString) {
  let data;
  try {
    data = JSON.parse(jsonString);
  } catch {
    throw new Error('Not valid JSON');
  }
  if (!data || data.v !== 1 || typeof data.name !== 'string') {
    throw new Error('Not a valid MTB Skills trading card');
  }
  return data;
}

/**
 * Check whether a scanned card matches an athlete already on this device.
 * Returns the matching athlete or null.
 * @param {object[]} athletes
 * @param {string|null} sourceAthleteId
 * @returns {object|null}
 */
export function detectMerge(athletes, sourceAthleteId) {
  if (!sourceAthleteId) return null;
  return athletes.find(a => a.id === sourceAthleteId) ?? null;
}

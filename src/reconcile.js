/**
 * src/reconcile.js — pure logic for local-silo reconciliation + ride-group
 * identity resolution, Phase 3.2 (docs/PHASE3_RECONCILIATION_PLAN.md Part 2).
 *
 * A coach who used the app before the backend existed (Phase 1/2) has local
 * athletes with local ids the backend has never heard of — pushing them
 * 403s, and left unmarked they'd just silently pollute the roster forever.
 * Every function here is pure (no DOM, no storage, no network) so it's
 * directly unit-testable; the calling code (src/main.js) wires these to
 * storage.js's `remapAthleteId` and the Add/Match/Delete sheet UI.
 */

/**
 * Local athletes whose `id` the backend roster has never seen — the
 * default "keep-as-local" posture just means these render with a
 * "⚠ local only" affordance rather than being hidden or auto-deleted.
 * @param {Array<{id:string}>} localAthletes
 * @param {Iterable<string>|null|undefined} remoteRosterIds ids from the
 *   last GET /api/roster pull (src/storage.js's getRemoteRosterIds()).
 *   `null`/`undefined` (never synced) is treated as "nothing is remote yet"
 *   — every local athlete would show as local-only, so callers should gate
 *   on `remoteRosterIds != null` before calling this at all (see
 *   src/views.js's roster gating for the signed-out/never-synced case).
 * @returns {Array<{id:string}>} the subset of localAthletes not in remoteRosterIds
 */
export function detectLocalOnly(localAthletes, remoteRosterIds) {
  const remoteIds = remoteRosterIds instanceof Set ? remoteRosterIds : new Set(remoteRosterIds || []);
  return (localAthletes || []).filter(a => a && !remoteIds.has(a.id));
}

/**
 * Best-effort auto-match of a local-only athlete against the backend
 * roster, pre-selecting a suggestion for the "Match" reconciliation action.
 * Precedence:
 *   1. `external_id` exact match (a NICA/PitZone id is a much stronger
 *      signal than a name, per CLAUDE.md's Phase 2b merge-key priority).
 *   2. case-insensitive, whitespace-trimmed full-name match.
 * Returns `null` when nothing matches (never a partial/fuzzy guess — the
 * coach picks manually in that case).
 * @param {{name?:string, external_id?:string|null}} local
 * @param {Array<{id:string, name?:string, external_id?:string|null}>} remoteRoster
 * @returns {object|null} the matching remote roster row, or null
 */
export function autoMatchByName(local, remoteRoster) {
  if (!local || !Array.isArray(remoteRoster) || !remoteRoster.length) return null;

  if (local.external_id) {
    const byExternalId = remoteRoster.find(r => r.external_id && r.external_id === local.external_id);
    if (byExternalId) return byExternalId;
  }

  const localName = String(local.name || '').trim().toLowerCase();
  if (!localName) return null;
  return remoteRoster.find(r => String(r.name || '').trim().toLowerCase() === localName) ?? null;
}

/**
 * Resolves the signed-in coach's persona(s) — cached from GET /api/me
 * (src/storage.js's getCachedIdentity()) — into a display-ready shape that
 * carries the ride group NAME, not just its id. `/api/me` only returns
 * `ride_group_id` (no name); the roster (GET /api/roster) is the one
 * response that denormalizes `ride_group_name` onto each person row, so
 * this resolves a persona's group name by matching `persona.person_id` to
 * that persona's OWN row in the roster (a coach's person row carries the
 * ride_group_id of the group they coach — see backend/app/routes.py's
 * `_select_attributing_coach` docstring for the same one-coach:one-group
 * assumption this pilot makes).
 * @param {Array<{person_id:string, role:string, ride_group_id:string|null, name:string}>} personas
 * @param {Array<{id:string, ride_group_id:string|null, ride_group_name:string|null}>} roster
 * @returns {Array<{person_id:string, name:string, role:string, ride_group_id:string|null, ride_group_name:string|null}>}
 */
export function resolveMyGroups(personas, roster) {
  const byId = new Map((roster || []).map(p => [p.id, p]));
  return (personas || []).map(persona => {
    const row = byId.get(persona.person_id);
    return {
      person_id:       persona.person_id,
      name:            persona.name,
      role:            persona.role,
      ride_group_id:   row?.ride_group_id ?? persona.ride_group_id ?? null,
      ride_group_name: row?.ride_group_name ?? null,
    };
  });
}

// Matches backend/app/routes.py's `_HC_TD_ROLES` -- the two persona roles
// that carry HC/TD-team-wide authority (roster editing, ride-group
// reassignment). Kept here (not just inline where it's used) so both
// src/views.js's frontend gating AND its own unit test share one source of
// truth for "what counts as HC/TD" on the client.
const HC_TD_ROLES = new Set(['head_coach', 'team_director']);

/**
 * Whether ANY of the caller's cached personas (src/storage.js's
 * getCachedIdentity()?.personas) carries head_coach/team_director
 * standing. Purely a client-side UI gate (show/hide the "reassign group"
 * affordance) -- the actual authorization decision is always the backend's
 * RLS `person_update` policy (POST /api/roster/assign), never this.
 * @param {Array<{role?:string}>|null|undefined} personas
 * @returns {boolean}
 */
export function isHcOrTd(personas) {
  return (personas || []).some(p => HC_TD_ROLES.has(p?.role));
}

// ---------------------------------------------------------------------------
// Team switcher (D26) — a coach with coaching duties on more than one team
// (backend/app/identity.py's MultiplePersonasError doc comment: a traveling
// Team Director, or one head coach running several schools' programs) gets
// back more than one persona from GET /api/me, one per team. Both helpers
// below are pure so they're directly unit-testable, same posture as the rest
// of this module — src/main.js/src/views.js wire them to
// src/storage.js's getActivePersonaId()/saveActivePersonaId().
// ---------------------------------------------------------------------------

const ROLE_LABELS = {
  head_coach:    'Head Coach',
  team_director: 'Team Director',
  coach:         'Coach',
  league_staff:  'League Staff',
};

/**
 * @param {string} role
 * @returns {string} a human-readable label for a persona role, falling back
 *   to the raw role string for anything not in ROLE_LABELS (forward-
 *   compatible with a role this client doesn't know about yet).
 */
export function personaRoleLabel(role) {
  return ROLE_LABELS[role] || role || '';
}

/**
 * Resolves which persona the app is currently scoped to. A single-persona
 * caller is unambiguous regardless of any stored selection — this is what
 * keeps a single-persona coach's experience byte-for-byte unchanged (no
 * picker, no behavior change): constraint straight from the D26 task brief.
 * A multi-persona caller resolves to whichever persona matches the stored
 * `activePersonaId`, or `null` if there isn't one (or it no longer matches
 * any current persona, e.g. after a re-sync) — `null` is exactly the signal
 * callers use to show the "which hat" picker.
 * @param {Array<{person_id:string}>|null|undefined} personas
 * @param {string|null|undefined} activePersonaId
 * @returns {object|null}
 */
export function resolveActivePersona(personas, activePersonaId) {
  if (!personas || !personas.length) return null;
  if (personas.length === 1) return personas[0];
  if (!activePersonaId) return null;
  return personas.find(p => p.person_id === activePersonaId) || null;
}

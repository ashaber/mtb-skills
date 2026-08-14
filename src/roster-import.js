/**
 * src/roster-import.js — HC/TD roster-import column-mapping CSV importer,
 * Phase 3.2.
 *
 * Pairs with backend/app/roster.py's POST /api/roster/import (already
 * shipped): this module is entirely client-side "turn a real NICA PitZone
 * CSV export into RosterRowIn-shaped rows, then POST them" — the backend
 * does not parse CSV or fetch a sheet itself (see app/roster.py's module
 * docstring).
 *
 * Deliberately split from the two-column-Name model CLAUDE.md's Phase 2b
 * section describes (a single "Name" column) — real PitZone exports carry
 * separate First/Last name columns, so this importer maps and combines
 * those instead. `postImport`'s wire shape (name/role/email/ride_group/
 * grade/category/external_id) is otherwise the same RosterRowIn contract.
 *
 * Uses papaparse (not a naive `split(',')`) because a real PitZone export
 * can contain quoted fields with embedded commas AND newlines (e.g. a
 * header like `"First Aid type, expires"`) — a naive split silently
 * corrupts those rows.
 *
 * Pure functions below (parseCsv/mapRows/parseRole/guessMapping) take no
 * DOM/localStorage dependency so they're directly unit-testable
 * (tests/unit/roster-import.test.js); only postImport touches the network.
 */

import Papa from 'papaparse';

/**
 * Parses raw CSV text into `{ columns, rows }` — `columns` is the header
 * row (in file order), `rows` is an array of plain objects keyed by
 * header. Blank lines (including a lone trailing newline) are dropped.
 * @param {string} text
 * @returns {{ columns: string[], rows: Record<string, string>[] }}
 */
export function parseCsv(text) {
  const result = Papa.parse(String(text ?? ''), {
    header: true,
    skipEmptyLines: true,
  });
  return {
    columns: result.meta?.fields ?? [],
    rows: result.data ?? [],
  };
}

/**
 * Maps a raw CSV role/type cell to the backend's `role` values
 * (app/schemas.py's VALID_ROSTER_ROLES). Case-insensitive substring match.
 * Checks the full-word PitZone export labels FIRST ("head coach" -> head_
 * coach, "team director" -> team_director) since a real PitZone coach
 * export spells these out in full, not as "HC"/"TD" — a coach whose own
 * row uses the full-word label previously silently fell through to plain
 * 'coach' (neither "head coach" nor "team director" contains the bare "hc"/
 * "td" substring, since the space breaks it). That's not just a
 * misclassification: if the caller's OWN row is in the batch, downgrading
 * them to 'coach' mid-transaction revokes their HC/TD RLS standing for
 * every row processed afterward in the SAME import, cascading into
 * `psycopg.errors.InsufficientPrivilege` on every subsequent row and
 * rolling back the whole batch (see DEFECTS.md D32). The short "hc"/"td"
 * codes are kept as a fallback for any file that already uses them, then
 * anything else (blank, "Lead", "Sweep", "Ride Leader", "Group Ride
 * Coordinator", ...) -> coach. Only called for a row whose file actually
 * maps a role column (a coach file) — the athlete file has no role column
 * at all, so `mapRows` below assigns 'athlete' directly without ever
 * calling this.
 *
 * Separator-normalized before matching (runs of whitespace/hyphens/
 * underscores collapsed to a single space) so "Team-Director",
 * "Team_Director", and "Team   Director" all match the same as "Team
 * Director" — real rosters aren't consistent about this. Deliberately
 * NOT fully stripped down to bare letters (e.g. "TeamDirector" with no
 * separator at all): doing that to the short "hc"/"td" fallback too would
 * risk false-positive matches inside unrelated concatenated text (e.g.
 * "Assistant Director" stripped becomes "...antdirector...", which
 * contains "td"). Normalizing separators only, not removing them, avoids
 * that risk while still covering the realistic real-world variants.
 * @param {string|null|undefined} value
 * @returns {'head_coach'|'team_director'|'coach'}
 */
export function parseRole(value) {
  const v = String(value ?? '').trim().toLowerCase().replace(/[\s\-_]+/g, ' ');
  if (v.includes('head coach')) return 'head_coach';
  if (v.includes('team director')) return 'team_director';
  if (v.includes('hc')) return 'head_coach';
  if (v.includes('td')) return 'team_director';
  return 'coach';
}

const _cell = (row, col) => (col ? String(row[col] ?? '').trim() : '');

/**
 * Maps parsed CSV `rows` into RosterRowIn-shaped objects per `mapping`
 * (any key may be unset/null — an unset column contributes nothing).
 * `firstNameCol`/`lastNameCol` combine into `name` ("<First> <Last>",
 * trimmed); a row whose combined name is blank is dropped (never sent to
 * the backend — app/schemas.py's RosterRowIn rejects a blank name at the
 * request boundary, which would otherwise 400 the ENTIRE batch for one
 * stray blank CSV line). `grade`/`category` are passed through as raw
 * trimmed strings (or null) — the backend's RosterRowIn already coerces a
 * numeric-looking grade string to int / drops a non-numeric one, so no
 * client-side parsing is needed here.
 * @param {Record<string, string>[]} rows
 * @param {{firstNameCol?, lastNameCol?, emailCol?, roleCol?, rideGroupCol?, gradeCol?, categoryCol?}} mapping
 * @returns {Array<{name:string, role:string, email:string|null, ride_group:string|null, grade:string|null, category:string|null, external_id:null}>}
 */
export function mapRows(rows, mapping = {}) {
  const out = [];
  for (const row of rows) {
    const first = _cell(row, mapping.firstNameCol);
    const last = _cell(row, mapping.lastNameCol);
    const name = `${first} ${last}`.trim();
    if (!name) continue; // no name to merge on — drop rather than 400 the batch

    const roleCell = _cell(row, mapping.roleCol);
    const role = mapping.roleCol ? parseRole(roleCell) : 'athlete';

    out.push({
      name,
      role,
      email: _cell(row, mapping.emailCol) || null,
      ride_group: _cell(row, mapping.rideGroupCol) || null,
      grade: _cell(row, mapping.gradeCol) || null,
      category: _cell(row, mapping.categoryCol) || null,
      // external_id is the strongest merge key (app/roster.py). Real PitZone
      // exports here carry no per-person GUID, but our OWN roster export can
      // stamp `person.id` into an "External ID" column so a later re-import
      // matches exactly instead of falling back to email+name.
      external_id: _cell(row, mapping.externalIdCol) || null,
    });
  }
  return out;
}

// Ordered substring matchers per app field — first column (in file order)
// whose lowercased header includes the highest-priority substring wins.
// Covers both the coach-file PitZone headers ("First Name","Last Name",
// "Email","Coach Role","Ride Group") and the athlete-file ones ("Rider
// Email","Grade","Racing Category").
const _GUESS_PATTERNS = {
  firstNameCol: ['first name', 'first'],
  lastNameCol: ['last name', 'last'],
  emailCol: ['email'],
  roleCol: ['coach role', 'role'],
  rideGroupCol: ['ride group', 'lead coach', 'group'],
  gradeCol: ['grade', 'year'],
  categoryCol: ['racing category', 'category', 'cat'],
  // Distinct multiword ID headers only — never a bare 'id' substring, which
  // would false-match columns like "Rider Email". Covers a future PitZone/
  // NICA GUID and our own export's "External ID" column.
  externalIdCol: ['pit zone id', 'pitzone id', 'nica id', 'registration id', 'external id', 'guid'],
};

function _findColumn(columns, substrings) {
  for (const sub of substrings) {
    const found = columns.find(c => String(c ?? '').trim().toLowerCase().includes(sub));
    if (found) return found;
  }
  return null;
}

/**
 * Best-effort auto-map of `columns` (a CSV header row) to the app fields
 * `mapRows` expects, so the coach usually just confirms rather than
 * mapping every field by hand. Any field with no matching header maps to
 * `null` (left for the coach to pick manually, or intentionally unmapped).
 * @param {string[]} columns
 * @returns {{firstNameCol: string|null, lastNameCol: string|null, emailCol: string|null, roleCol: string|null, rideGroupCol: string|null, gradeCol: string|null, categoryCol: string|null}}
 */
export function guessMapping(columns) {
  const cols = columns ?? [];
  const mapping = {};
  for (const [field, patterns] of Object.entries(_GUESS_PATTERNS)) {
    mapping[field] = _findColumn(cols, patterns);
  }
  return mapping;
}

/**
 * POSTs already-mapped `rows` to `${backendUrl}/api/roster/import` with a
 * Bearer token, mirroring src/sync.js's `api()` fetch helper. Returns the
 * backend's summary (`{people_created, people_updated, groups_created,
 * skipped}`); throws an Error (message = the server's `{error}` when
 * present) on any non-2xx response.
 * @param {object[]} rows
 * @param {string|null} token
 * @param {string} backendUrl
 * @returns {Promise<{people_created:number, people_updated:number, groups_created:number, skipped:Array}>}
 */
export async function postImport(rows, token, backendUrl) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(`${backendUrl}/api/roster/import`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ rows }),
  });

  let json = null;
  try {
    json = await res.json();
  } catch {
    // empty/non-JSON body — leave json as null
  }

  if (!res.ok) {
    const message = (json && json.error) || `HTTP ${res.status}`;
    throw new Error(message);
  }

  return json;
}

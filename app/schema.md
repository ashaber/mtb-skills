# Data Model — MTB Skills Assessment App

Schema version 1. All entities use UUID primary keys. All records carry `team_id` and `coach_id` so the data model supports multi-tenant promotion (Phase 4) without migration.

---

## Entities

### Athlete
```json
{
  "id":          "uuid",
  "team_id":     "uuid",
  "name":        "string",
  "grade":       "integer | null",
  "season_year": "integer"
}
```

### Coach
Stored in app settings (v1: one coach per device). In Phase 2, resolved via Google OAuth.
```json
{
  "id":      "uuid",
  "team_id": "uuid",
  "name":    "string",
  "role":    "head_coach | coach"
}
```

### Observation
Immutable append-only log. Never edited or deleted — the history is the record.
```json
{
  "id":             "uuid",
  "athlete_id":     "uuid",
  "team_id":        "uuid",
  "coach_id":       "uuid",
  "session_date":   "YYYY-MM-DD",
  "skill":          "body_position | braking | cornering",
  "level_observed": 1 | 2 | 3 | 4 | 5,
  "notes":          "string | null"
}
```
`notes` is free-text context — what the coach saw that led to the level. Optional.

### ConfirmedLevel
Coach-asserted skill level. Last-write-wins per `athlete_id + skill`. Separate from raw observations — the coach sets this explicitly when they believe the consistency gate is met.
```json
{
  "id":           "uuid",
  "athlete_id":   "uuid",
  "team_id":      "uuid",
  "coach_id":     "uuid",
  "confirmed_at": "ISO-8601 datetime",
  "skill":        "body_position | braking | cornering",
  "level":        1 | 2 | 3 | 4 | 5
}
```

---

## Skill identifiers

| Key             | Display name    |
|-----------------|-----------------|
| `body_position` | Body Position   |
| `braking`       | Braking         |
| `cornering`     | Cornering       |

---

## Trail readiness calculation

Computed client-side from ConfirmedLevels — never stored. Source of truth is `app/rubric.js` → `TRAIL_MINIMUMS`.

| Trail key      | Display        | Min BP | Min Braking | Min Cornering |
|---------------|----------------|--------|-------------|---------------|
| `green`       | Green ●        | 2      | 2           | 1             |
| `blue`        | Blue ■         | 3      | 2           | 2             |
| `black`       | Black ◆        | 3      | 3           | 3             |
| `double_black` | Dbl Black ◆◆  | 4      | 4           | 4             |

---

## localStorage keys (Phase 1)

| Key                    | Contents              |
|------------------------|-----------------------|
| `mtb_athletes`         | Athlete[]             |
| `mtb_observations`     | Observation[]         |
| `mtb_confirmed_levels` | ConfirmedLevel[]      |
| `mtb_coach`            | Coach (single object) |
| `mtb_team`             | `{ id: uuid }`        |

---

## Phase 2 migration notes

- Observations are append-only → no merge conflict on sync; just union the two sets by `id`
- ConfirmedLevel uses last-write-wins by `athlete_id + skill`; `confirmed_at` timestamp resolves conflicts
- All UUID keys are globally unique — no renaming needed when moving to a shared backend
- Add a `teams` table referencing `team_id` to enable multi-tenant in Phase 4; existing data needs no column changes

---

## Phase 3 addendum — team-visibility backend

> This documents the *current* v1 client model above. Phase 3 introduces a Supabase Postgres backend. Full design: `docs/PHASE3_TEAM_VISIBILITY_PLAN.md`. Summary of the schema delta:

**New tables** (Supabase Postgres, UUID PKs, RLS on every table):

| Table | Purpose |
|---|---|
| `league` | League (e.g. "Idaho") |
| `team` | Team, `→ league_id` |
| `ride_group` | `→ team_id`, `lead_coach_id` — first-class (no longer a string tag) |
| `person` | `→ team_id`, `ride_group_id`, `role ∈ {league_staff, head_coach, team_director, coach, athlete}`, `external_id` (PitZone GUID) |
| `auth_person` | Links Supabase `auth.users` (email) → `person` (role). One email may map to a coach *and* an athlete (shared family PitZone email); login always assumes the coach persona |

**Changed:** `observation` / `confirmed_level` keep their v1 shape (already carry `team_id` + `coach_id`) and gain a denormalized `ride_group_id` for RLS performance.

**Not modeled server-side (pilot):** medical notes + emergency contacts (IDEA-005) stay device-local — only roster identity + skill/observation data syncs.

**Access:** enforced by Postgres Row-Level Security keyed off `auth.uid() → person → {role, team_id, ride_group_id}` — see the design doc's RLS matrix. Cutover is reversible per-team via a store-factory flag (`local | db`) behind `src/storage.js`; local data is never deleted.

**Correction to the note above:** Phase 3 (not 4) is where the backend lands, and it *adds tables + a real DB* — existing fields need no migration, but the "no column changes" phrasing understates the addition of the tables listed here.

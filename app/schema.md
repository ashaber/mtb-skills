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

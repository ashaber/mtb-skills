# System Architecture

## System landscape

Two fully isolated environments (separate Supabase projects, separate
Cloud Run services, separate Firebase Hosting targets) so ITG can be broken
on purpose without any risk to real coach data — the same promotion
discipline described in `docs/architecture/SECURITY.md`'s deploy-pipeline
section. See `README.md`'s "Deployment" section for the live URLs and
deploy commands.

```mermaid
flowchart TB
  subgraph Client["Coach's device — offline-first PWA"]
    APP["Vanilla JS app<br/>main.js / views.js / storage.js"]
    SW["Service Worker<br/>precache + offline cache"]
    LOCAL[("localStorage<br/>local-first store")]
    APP --- SW
    APP --- LOCAL
  end

  subgraph GH["GitHub"]
    REPO["Repo: ashaber/mtb-skills"]
    CI["CI — ci.yml<br/>unit · e2e Chromium+WebKit · backend · db/RLS"]
    CD["CD — workflow_dispatch<br/>deploy-frontend.yml / deploy-backend.yml"]
    REPO --> CI --> CD
  end

  GOAUTH["Google OAuth"]
  AR["Artifact Registry<br/>backend container image"]

  subgraph ITG["GCP + Supabase — ITG"]
    FH_ITG["Firebase Hosting<br/>mtb-skills-itg.web.app"]
    CR_ITG["Cloud Run<br/>mtb-api-itg (FastAPI)"]
    AUTH_ITG["Supabase Auth"]
    PG_ITG[("Postgres + RLS<br/>ITG project")]
  end

  subgraph PROD["GCP + Supabase — Prod"]
    FH_PROD["Firebase Hosting<br/>mtb-skills-prod.web.app"]
    CR_PROD["Cloud Run<br/>mtb-api-prod (FastAPI)"]
    AUTH_PROD["Supabase Auth"]
    PG_PROD[("Postgres + RLS<br/>Prod project")]
  end

  GHPAGES["GitHub Pages<br/>Phase 1-2 legacy static hosting"]

  CD -- "WIF / OIDC, no static keys<br/>push to main" --> FH_ITG
  CD -- "WIF / OIDC, no static keys<br/>push to main" --> CR_ITG
  CD -- "WIF / OIDC<br/>manual gated promote" --> FH_PROD
  CD -- "WIF / OIDC<br/>manual gated promote" --> CR_PROD
  CD --> AR --> CR_ITG
  AR --> CR_PROD

  APP -- "HTTPS, static app" --> FH_ITG
  APP -- "HTTPS, static app" --> FH_PROD
  APP -- "HTTPS, static app (legacy)" --> GHPAGES
  APP -- "REST + JWT" --> CR_ITG
  APP -- "REST + JWT" --> CR_PROD
  APP -- "OAuth sign-in" --> GOAUTH
  GOAUTH --> AUTH_ITG
  GOAUTH --> AUTH_PROD

  CR_ITG -- "RLS-scoped SQL" --> PG_ITG
  CR_PROD -- "RLS-scoped SQL" --> PG_PROD
  AUTH_ITG -.->|issues session JWT| PG_ITG
  AUTH_PROD -.->|issues session JWT| PG_PROD
```

## Infrastructure as code

- The Postgres schema, indexes, and every RLS policy live as numbered,
  idempotent SQL migrations in `supabase/migrations/` — the schema's
  source of truth is version-controlled and re-derivable from scratch, not
  click-ops in a Supabase dashboard.
- Idempotency isn't a suggestion — the CI `db` job actually re-applies
  every migration a second time and fails the build on any error.
- GCP resource bindings (WIF pool/provider, IAM roles) are provisioned by
  an idempotent shell script (`scripts/setup-wif.sh`), not manual console
  clicks — safe to re-run, existence-checked at every step.
- `scripts/ops_check.sh` gives a one-shot read of both environments'
  health, DB reachability, and deployed-commit drift against `main` — see
  root `README.md`.

## Database schema (ERD)

```mermaid
erDiagram
  LEAGUE ||--o{ TEAM : "has"
  TEAM ||--o{ RIDE_GROUP : "has"
  TEAM ||--o{ PERSON : "employs / rosters"
  RIDE_GROUP ||--o{ PERSON : "home group"
  PERSON ||--o{ AUTH_PERSON : "login link"
  PERSON ||--o{ OBSERVATION : "athlete_id"
  PERSON ||--o{ OBSERVATION : "coach_id"
  PERSON ||--o{ CONFIRMED_LEVEL : "athlete_id"
  PERSON ||--o{ CONFIRMED_LEVEL : "coach_id"
  TEAM ||--o{ PRACTICE : "hosts"
  RIDE_GROUP ||--o{ PRACTICE : "scopes (nullable = team-wide)"
  PRACTICE ||--o{ ATTENDANCE : "roster for"
  PERSON ||--o{ ATTENDANCE : "person_id"

  LEAGUE {
    uuid id PK
    text name
  }
  TEAM {
    uuid id PK
    uuid league_id FK
    text name
  }
  RIDE_GROUP {
    uuid id PK
    uuid team_id FK
    text name
    uuid lead_coach_id "advisory display only, not FK-enforced"
  }
  PERSON {
    uuid id PK
    uuid team_id FK
    uuid ride_group_id FK "null for HC/TD/league_staff"
    text role "league_staff | head_coach | team_director | coach | athlete"
    text name
    text email "coach-only; the auth match key; never returned by any API response"
    int grade "athlete only, nullable"
    text category "athlete only, nullable"
    text external_id "PitZone GUID, merge key"
    text[] tags "descriptive folksonomy (e.g. sweep/lead), carries no RLS meaning"
  }
  AUTH_PERSON {
    uuid auth_user_id PK "Supabase auth.users.id"
    uuid person_id PK,FK
  }
  OBSERVATION {
    uuid id PK
    uuid athlete_id FK
    uuid coach_id FK
    uuid team_id FK "denormalized for RLS"
    uuid ride_group_id FK "denormalized for RLS"
    date session_date
    text skill "body_position | braking | cornering"
    int level_observed "1-5"
  }
  CONFIRMED_LEVEL {
    uuid id PK
    uuid athlete_id FK
    uuid coach_id FK
    uuid team_id FK "denormalized for RLS"
    uuid ride_group_id FK "denormalized for RLS"
    text skill
    int level "1-5"
  }
  PRACTICE {
    uuid id PK
    uuid team_id FK
    uuid ride_group_id FK "nullable = team-wide"
    date session_date
    text status "active | ended"
  }
  ATTENDANCE {
    uuid id PK
    uuid practice_id FK
    uuid person_id FK
    uuid team_id FK "denormalized for RLS"
    uuid ride_group_id FK "denormalized for RLS"
    text status "attending | absent"
  }
  FEEDBACK {
    uuid id PK
    text comment
    text email "self-reported, optional"
    text app_version
  }
  ENGAGEMENT {
    uuid id PK
    text session_id
    jsonb events
    text app_version
  }
```

Two intentional design choices worth calling out:

- **Denormalized `team_id`/`ride_group_id` on `observation`, `confirmed_level`,
  `practice`, and `attendance`** — each row carries its own scope columns
  instead of requiring a join back through `person`/`practice` at query
  time, so every RLS policy filters on an indexed column directly. A
  conscious performance/normalization tradeoff, not an oversight.
- **`feedback` and `engagement` are deliberately disconnected from the
  tenant graph** — no foreign keys to `person`/`team`, RLS enabled with
  *zero* policies (default-deny for every role). They're intentionally
  unreachable from the coach-facing API, because both are anonymous
  submissions with no persona to scope them to.

## Offline-first architecture

Practices happen on trails with no cell service, so this isn't a
progressive-enhancement afterthought:

- Service worker pre-caches the full app shell and rubric content at
  install time — zero network calls needed to open the app after first
  install.
- `src/storage.js` is a swappable storage abstraction (`local` | `db`) —
  the entire app was built and used fully offline-only for Phases 1–2, and
  the Phase 3 sync layer was added *underneath* that same interface
  without changing any view code.
- Sync/merge strategy is explicit and conflict-safe: observations are
  append-only (unioned by ID, never overwritten), confirmed skill levels
  are last-write-wins, and a coach's local data is never deleted by a
  failed or partial sync — rollback is always "flip the storage flag back."

## Tech stack

| | |
|---|---|
| Frontend | Vanilla JS (ES modules), Vite, `vite-plugin-pwa` |
| Backend | Python 3.12, FastAPI |
| Database | PostgreSQL via Supabase (managed), Row-Level Security |
| Auth | Supabase Auth, Google OAuth, JWT |
| Infra | GCP Cloud Run, Artifact Registry, Firebase Hosting, Workload Identity Federation |
| CI/CD | GitHub Actions |
| Testing | Vitest, Playwright (Python), pytest, pytest-cov |

Current test counts and coverage change often enough that hardcoding them
here would go stale — see the CI workflow (`unit`/`e2e`/`backend`/`db`
jobs) for the current pass/fail state on any given commit.

# backend/

Phase 3.0 skeleton for the mtb-skills API: a FastAPI service that will, in
later increments, front the Supabase Postgres DB defined in
`supabase/migrations/` (schema: `league`, `team`, `ride_group`, `person`,
`auth_person`, `observation`, `confirmed_level`). See
`docs/PHASE3_TEAM_VISIBILITY_PLAN.md` for the full design and build-phase
layout, and `docs/PHASE3_INFRA_SETUP.md` for the one-time Cloud Run/Supabase
infra setup.

**This skeleton has no business or DB routes yet.** It stands up cleanly,
loads and validates config fail-fast, exposes `/health` and `/version`, and
is container-ready. Auth routes (Google OAuth verification against Supabase
Auth + RLS) land in 3.1; the DB connection layer and store wiring land in
3.1-3.2.

Pattern source: mirrors the `swim-coach` repo's `backend/` (config loader,
JSON structured logging, non-root Docker user, Cloud Run `PORT` handling,
transaction-pooler note for Supabase) -- but this backend has **no
Anthropic/LLM** and **no intervals.icu sync**; those are swim-coach-specific
and dropped entirely here.

## Run locally

```bash
cd backend
cp .env.example .env   # fill in DATABASE_URL / SESSION_SECRET / GOOGLE_CLIENT_ID
pip install -r requirements.txt
uvicorn app.main:app --reload
```

Then:

```bash
curl http://localhost:8000/health    # {"status":"ok"}
curl http://localhost:8000/version   # {"version":"3.0.0","commit":"dev"}
```

## Environment variables

See `.env.example` for the full list, defaults, and which vars are secrets
(`DATABASE_URL`, `SESSION_SECRET`) vs. public (`GOOGLE_CLIENT_ID` -- the same
value the frontend bakes in as `VITE_GOOGLE_CLIENT_ID`). Config is loaded and
validated fail-fast by `app/config.py::Settings.from_env()` -- the process
refuses to start if a required var is missing or a value is invalid.

## Tests

```bash
# from the repo root
.venv/bin/pytest tests/api -v
```

`tests/api/test_health.py` covers `/health` and `/version`.
`tests/api/test_config.py` covers the fail-fast config loader (missing
required vars raise, a full env succeeds, defaults apply).

## Docker

Build context is the **repo root** (mirrors swim-coach):

```bash
docker build -f backend/Dockerfile -t mtb-skills-api .
docker run --rm -p 8000:8000 --env-file backend/.env mtb-skills-api
```

Runs as a non-root user; `python:3.12-slim` base; `uvicorn` binds `PORT`
(default `8000`, overridden by Cloud Run at deploy time).

## What's next (not in this skeleton)

- **3.1** -- Google OAuth verification against `GOOGLE_CLIENT_ID`, session
  minting, `auth_user -> person` resolution (incl. the shared-PitZone-email
  "who are you" picker).
- **3.1-3.2** -- the actual DB connection layer (`get_settings().database_url`
  via the Supabase transaction pooler, prepared statements disabled -- see
  `app/config.py`'s `db_pool` note) and business routes.

One-time Cloud Run + Supabase infra setup (ITG + prod, WIF, Artifact
Registry, GCS) is **not** part of this skeleton -- see
`docs/PHASE3_INFRA_SETUP.md`.

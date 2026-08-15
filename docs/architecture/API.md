# API Reference

The API spec is **auto-generated from the actual route code** (FastAPI +
Pydantic), so it can never drift out of sync with what's deployed the way a
hand-maintained spec would. This page is a pointer and a quick-reference
table, not a duplicate spec to keep updated by hand.

## Live, interactive reference

| Environment | Swagger UI | Raw OpenAPI schema |
|---|---|---|
| ITG | https://mtb-api-itg-899076610571.us-central1.run.app/docs | https://mtb-api-itg-899076610571.us-central1.run.app/openapi.json |
| Prod | https://mtb-api-prod-899076610571.us-central1.run.app/docs | https://mtb-api-prod-899076610571.us-central1.run.app/openapi.json |

These are on the **backend** (Cloud Run) host, not the frontend
(`mtb-skills-{itg,prod}.web.app` only serves the app itself — Firebase
Hosting rewrites every path there to `index.html`).

Both are publicly reachable with no authentication required to view the
schema (no data is exposed, only endpoint/request/response shapes) — see
`SECURITY.md`'s Open Items for the note on whether that should stay open on
prod long-term.

## Endpoint quick reference

All routes are prefixed `/api`, require a `Bearer <Supabase JWT>` header
(except the two marked anonymous below), and are RLS-scoped per
`SECURITY.md`'s RBAC matrix — the route only picks which rows to ask for;
the database decides what the caller may actually see or write.

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/me` | Caller's resolved coach persona(s) |
| `GET` / `POST` | `/observations` | Skill observations |
| `GET` / `POST` | `/confirmed-levels` | Confirmed skill levels |
| `GET` / `POST` | `/practices` | Practice sessions |
| `GET` / `POST` | `/attendance` | Practice attendance |
| `GET` | `/roster` | Team/ride-group roster |
| `POST` | `/athletes` | Add a single athlete |
| `POST` | `/roster/import` | Bulk CSV roster import (HC/TD only) |
| `POST` | `/roster/assign` | Reassign an athlete's ride group (HC/TD only) |
| `POST` | `/feedback` | In-app feedback (anonymous, no auth) |
| `POST` | `/engagement` | Usage-tracking ping (anonymous, no auth) |

`GET /health` and `GET /health/db` (unprefixed, no `/api`) are liveness and
DB-connectivity checks — see root `README.md`'s "Stack health check"
section.

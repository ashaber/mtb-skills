# Architecture & Security Documentation

Index for the durable, repo-versioned architecture package — as opposed to
point-in-time chat artifacts or planning docs. Written for anyone doing
technical due diligence on this project: NICA's IT architect, a fractional
CTO, or a future maintainer.

- **[SECURITY.md](SECURITY.md)** — authentication, authorization (Row-Level
  Security), the full RBAC matrix, attack surface by network hop, PII
  inventory, and open hardening items. The source of record for security
  review conversations — keep it current as the auth/RLS model evolves.
- **[ARCHITECTURE.md](ARCHITECTURE.md)** — system landscape diagram and
  database ERD.
- **[API.md](API.md)** — how to reach the live, auto-generated API
  reference (Swagger UI / OpenAPI schema), plus a quick-reference endpoint
  table.
- **[SUPPORT.md](SUPPORT.md)** — the prod-access model, a troubleshooting
  runbook (queries, log access, symptom → likely cause), the monitoring
  roadmap, free-tier scale limits, when a Cloud SQL migration would
  actually make sense, and the continuity/bus-factor plan.

## Keeping this current

Unlike a generated report, these are meant to be edited in place as the
system changes — treat drift here the same as a failing test. When RLS
policies, roles, or the schema change, update `SECURITY.md`/`ARCHITECTURE.md`
in the same PR, not after the fact.

For narrative/pilot-status context (what's built, what's not, decision
history) see the root [`README.md`](../../README.md), [`ROADMAP.md`](../../ROADMAP.md),
[`DEFECTS.md`](../../DEFECTS.md), and [`IDEAS.md`](../../IDEAS.md) — this
package is architecture/security only, not a duplicate of those.

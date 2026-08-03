# Phase 3.0 — Build Progress & Resume Point

Living checklist for the 3.0 (foundations & environments) build. **Updated after every workstream.** If a build session is interrupted (usage limit, etc.), resume from here.

## Where the work lives
- **Branch:** `phase3/team-visibility-design` (same branch as the design docs — PR #17 grows to "design + 3.0 foundations"). Later increments (3.1+) get their own branches/PRs.
- **Rule:** each workstream is committed AND pushed the moment it verifies green. Nothing large stays uncommitted. → a limit hit never loses more than the one in-flight workstream.
- **Not merged by the agent** — Andrew reviews & merges.

## Resume protocol (do this first on any resume)
1. `git fetch origin && git checkout phase3/team-visibility-design && git pull --ff-only`
2. Read this file's checklist; run `git log --oneline -15` to see which workstreams are committed.
3. If a background build agent was mid-flight, check the working tree for its files and run that workstream's **verify** command below before trusting/committing them.
4. Continue at the first unchecked workstream. Commit + push when it verifies.

## 3.0 workstreams (sequential, for coherence)

| # | Workstream | Paths | Verify command | Status |
|---|---|---|---|---|
| B | DB schema + RLS | `supabase/migrations/`, `tests/db/`, `scripts/db_test.sh` | `bash scripts/db_test.sh` (docker postgres:16; migrations apply twice; RLS matrix passes) | ⏳ building (Sonnet agent) |
| A | Backend FastAPI skeleton | `backend/` | `.venv/bin/pytest tests/api -v` | ⬜ not started |
| C | Frontend store factory (flag OFF) | `src/store/`, `src/storage.js`, `tests/unit/` | `npm run test` (all pass; zero behavior change when flag off) | ⬜ not started |
| D | CI/CD (orchestrator does this) | `.github/workflows/ci.yml` (+`deploy-backend.yml`, GCS deploy — dormant) | workflows lint; `npm run test:all` green | ⬜ not started |
| — | Integration + PR | — | `npm run test:all` green; update PR #17 title/desc; **do not merge** | ⬜ not started |

## Scope guardrails
- 3.0 is **additive only**; the store-factory flag **defaults OFF** → live pilot app behaves exactly as today.
- Deploy workflows land **dormant** (no secrets yet) — nothing actually deploys. Live deploy + auth is 3.1, which needs the runbook (`docs/PHASE3_INFRA_SETUP.md`).
- Auth architecture: **Supabase-Auth + RLS** (confirmed with Andrew).

## Notes / decisions log
- (append per-workstream verification results, commit SHAs, and anything Andrew should review)

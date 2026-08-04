# Phase 3.1 — Auth head-start (partial, built ahead of the live session)

**Status:** built overnight per Andrew's go-ahead, scoped to the **fork-independent, headless-testable core** of 3.1. Lands as a **draft PR — not merged.** The interactive OAuth round-trip verification and the architecture fork below are for the live session with Andrew.

## Scope (what this branch delivers)
The parts of 3.1 that are needed **regardless** of the architecture decision below, and that can be fully verified against local Postgres with no browser / no deploy:

1. **`supabase/migrations/0003_grants.sql`** — grant `SELECT/INSERT/UPDATE` on the app tables to the Supabase **`authenticated`** role (RLS still filters *which* rows; grants are the SQL-privilege layer underneath). Needed for RLS to work via Supabase in *either* fork. No grants to `anon` (anonymous = default-deny).
2. **`authenticated`-role RLS integration test** — proves the exact same isolation matrix from `tests/db/test_rls.py` holds when invoked the way **real Supabase** does it: `SET ROLE authenticated` + `SET request.jwt.claims` (not just the custom `app_user`/`request.jwt.claim.sub` shim). This is the crown-jewel verification — it confirms our RLS enforces under Supabase's actual role + claims mechanism.
3. **Backend auth core** (fork-independent domain logic):
   - `backend/app/auth.py` — verify a Supabase JWT (HS256 via `SUPABASE_JWT_SECRET`), return `{sub, email}`.
   - `backend/app/db.py` — an RLS-enforcing DB session helper: opens a txn, `SET LOCAL role authenticated` + `SET LOCAL request.jwt.claims`, so any query run through it is filtered by our policies as that user.
   - `backend/app/identity.py` — resolve `sub → auth_person → person` rows → coach persona(s): 0 personas ⇒ 403 (not a known coach), 1 ⇒ that coach, >1 coach personas ⇒ "which hat" picker (per the design doc's shared-family-email rule).
   - Tests: unit (JWT verify with a self-signed token) + integration (the session helper actually enforces RLS — a coach's sub sees only their group's rows *through the backend*).

## NOT in this branch (needs Andrew)
- **Business endpoints** (GET/POST observations, roster, etc.) — their *existence* depends on the fork below.
- The real Google→Supabase→app **browser round-trip** verification (interactive).
- Any **deploy** (Cloud Run / Firebase). Everything here is local/CI-tested only.
- The frontend "Sign in with Google" UI.

## ⚠️ Architecture fork to decide in the live session
**Who runs RLS-protected CRUD — the frontend directly, or the FastAPI backend?**

- **(a) Frontend → Supabase directly** (supabase-js + user JWT; PostgREST applies RLS natively). Idiomatic Supabase, least backend code. FastAPI is then only for privileged/complex ops (HC roster import, "falling behind" computed views, ride-group moves).
- **(b) Frontend → FastAPI → Supabase** (backend verifies JWT, impersonates via the `db.py` helper). More control/centralization, more code, and the backend must *never* connect as `postgres` (that bypasses RLS) — hence the `db.py` helper.

Everything in this branch is **needed in both** (the grants, the authenticated-role test, JWT verify, identity resolution, and the impersonation helper — (b) uses it directly; (a) still benefits from it for the privileged backend ops). So no rework is expected from the decision; it only determines *which endpoints* get built next.

## Resume protocol (if interrupted)
1. `git fetch && git checkout phase3/3.1-auth-headstart && git pull --ff-only`
2. `git log --oneline main..HEAD` — see what's committed.
3. Verify commands: `bash scripts/db_test.sh` (DB + both RLS test suites) and `.venv/bin/pytest tests/api backend -v` (backend). Both must be green before opening/updating the PR.
4. Continue from the first unchecked item; commit each verified piece; do **not** merge.

## Checklist
- [x] `0003_grants.sql` + `authenticated` role in the test shim
- [x] authenticated-role RLS integration test green (18 tests; isolation holds under SET ROLE authenticated + request.jwt.claims). **Orchestrator independently proved the linchpin**: owner sees all, `SET ROLE authenticated` + stranger sub → 0 rows, + own sub → own rows only.
- [x] `backend/app/auth.py` (+ `SUPABASE_JWT_SECRET` config, requirements: pyjwt) + unit tests
- [x] `backend/app/db.py` RLS-enforcing session helper + integration test
- [x] `backend/app/identity.py` persona resolution + tests
- [x] full suites green: `scripts/db_test.sh` **43**, `pytest tests/api` **22**, `pytest tests/backend` **12**, `npm run test` **173** (unaffected)
- [x] draft PR opened, not merged

## Security finding fixed during verification
**`auth_person` had RLS disabled** — 0002 enabled RLS on the six domain tables but missed `auth_person`, and 0003 granted `authenticated` SELECT on it, so any logged-in user could read the whole `auth_user_id → person_id` mapping (UUIDs only; `person` names stayed protected — low severity, but a least-privilege gap). **Fixed** in `supabase/migrations/0004_auth_person_rls.sql` (RLS on, own-rows-only SELECT, writes default-denied; the security-definer helpers bypass it so persona resolution is unaffected) + 3 new tests. Verified `resolve_personas` still works under the new policy.

## Deploy-wiring follow-ups (when we deploy 3.1 — not now)
- `SUPABASE_JWT_SECRET` is now a **required** backend config field. Before deploy, add `SUPABASE_JWT_SECRET_ITG/PROD` to Secret Manager (extend `scripts/setup-secrets.sh`), and mount it in `deploy-backend.yml` (`--set-secrets`). Source: Supabase → Settings → API → JWT Secret, per project.
- `supabase/migrations/0003` + `0004` still need to be applied to the real Supabase projects (only 0001+0002 were applied during infra setup).
- The **architecture fork** (frontend→Supabase direct vs frontend→FastAPI→Supabase) is still open — decides which business endpoints get built next.

# Phase 3 — Local-silo reconciliation + ride-group UI (build plan)

Built while Andrew is out. Two coupled parts on branch `phase3/reconciliation-ride-groups` off clean main (#23 merged). Lands as ONE PR — not merged.

## Why
A coach who has already used the app (Phase 1/2) has a **local roster** that doesn't exist server-side, so sync's pushes 403 and the app shows a flat, unscoped, polluted roster. Also the Phase-1 frontend has **no ride-group awareness** — a coach can't see their group or a rider's group. Decisions locked with Andrew:
- **(a)** a ride-group coach may add an athlete (walk-up SA / one-time waiver) to **their own group**.
- **lead/sweep = tags** (folksonomy, arbitrary/multiple) now; permissions later when attendance/promote-demote/medical land.
- Reconciliation default = **keep-as-local**, marked "⚠ local only"; tap → **Add / Match / Delete**; auto-match by name; Match → pick from the backend roster.

## Part 1 — backend plumbing (build + verify FIRST; frontend depends on the contract)
- `0007_person_tags.sql`: `person.tags text[] not null default '{}'`.
- `0008_coach_add_athlete_rls.sql`: policy letting a ride-group coach INSERT `role='athlete'` into a ride_group they coach (`ride_group_id in app_caller_ride_group_ids()`), WITH CHECK also pins team via the group. (HC/TD keep their existing team-wide person_insert.)
- `schemas.RosterRowIn` + `roster.import_roster` + `GET /api/roster`: carry `tags`.
- `POST /api/athletes` (new): a coach adds one athlete to their group — body `{name, ride_group_id, grade?, category?}`; server derives team from the group; via `rls_connection` (the new policy is the authz). Returns the created person.
- Tests: coach adds athlete to own group ✓; to another group → 403; adding a coach (role!=athlete) → 403; HC anywhere ✓; tags round-trip through import + GET.

## Part 2 — frontend (after Part 1 verified)
- **Ride-group UI:** show each rider's ride group on the roster; group/filter the roster by ride group; show "your group(s)" for the signed-in coach. (The pulled `person.ride_group_id` + a groups list — GET /api/roster already returns ride_group_id; may need group names — expose via /api/me or a groups list.)
- **Reconciliation:** after sync, mark local-only athletes (local records with no backend match) "⚠ local only" (default keep-local). Tap → **Add** (POST /api/athletes → then treat as backend) / **Match** (picker of backend roster → link) / **Delete** (drop local).
- **Re-pointing (the delicate, verify-hard part):** when a local athlete is Matched/Added, remap its local `athlete_id` → the backend id across the LOCAL store (athletes + observations + confirmed_levels) so pushes succeed and dedupe. Keep an id→canonical map; never lose observations.
- Tests: unit for the local-only detection + auto-match-by-name + id-remap logic (fetch/storage mocked); e2e must still pass (offline default intact).

## Resume protocol
`git fetch && git checkout phase3/reconciliation-ride-groups && git pull`. Verify: `bash scripts/db_test.sh`, `pytest tests/api tests/backend`, `npm run test`, `npm run test:e2e`. Backend committed first, frontend second; each verified before commit. Do NOT merge.

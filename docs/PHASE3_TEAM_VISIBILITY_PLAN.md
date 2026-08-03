# Phase 3 — Team Visibility Design

**Status:** Design doc — pending (a) a review session with Tim on the open questions and (b) Andrew's approval to start the build. No code has been written. When the build starts it follows the execution model and build-phase layout below.

**Decisions locked with Andrew (2026-08):**
- **Team-visibility is required at pilot launch** (a few-team pilot starts within ~1–2 weeks). The design is built around a *reversible, additive* cutover so stability never depends on the backend staying up — a team can always fall back to fully-offline client-only operation.
- **Environments:** proper but lightweight **staging (ITG) + prod** — two Supabase projects, two Cloud Run services, GCS bucket per env. (Vercel-vs-Pages was rejected: it isolates only the frontend, not the DB/auth.)
- **AuthN:** **Google OAuth first**, email magic link as a fast-follow (both eventually).
- **AuthZ:** Supabase **Row-Level Security (RLS)**, server-enforced.
- **Pattern source:** mirrors the `swim-coach` repo (Supabase + FastAPI on Cloud Run + WIF CI deploy + a store-factory cutover flag), adjusted from swim-coach's single-prod setup to a true ITG/prod stack.

---

## Context

A ride-group coach reached out unprompted:

> "Tried the app for skills assessment but how can I see data from other coaches? I can only see my data. Anyway to link this all together? Right now it is like each coach has their roster with scores but I can't see them."

Today every coach's app is an isolated `localStorage` silo (Phase 1–2). This is the first real signal that the multi-coach visibility gap — already anticipated in `ROADMAP.md` Phase 3 — is now actively blocking a coach's workflow, not just a roadmap item. An earlier informal idea (IDEA-011, "google doc backend") isn't the right foundation for access-controlled, role-aware, queryable multi-coach data — a real backend is. `ROADMAP.md` already specifies **Phase 3 — Supabase Multi-Tenant Backend**; this plan deepens that design around the org/access model the coach's request requires.

---

## Org & access model

```
League (e.g. "Idaho")
  └─ League staff: League Director, Director of Coaching — see all teams in league (Phase 5 dashboard)
  └─ Team (one per school/program)
       └─ Head Coach (HC) — full team visibility, roster management
       └─ Team Director (TD) — same authority as HC (peer role, not subordinate)
            └─ Ride Group (e.g. "Group A", assigned lead coach)
                 └─ Ride Group coaches — see all ratings within their group (shared, collaborative)
                 └─ Student athletes (SA)
```

| Role | Sees | Writes |
|---|---|---|
| League staff (LD, DoC) | All teams in their league — **read-only** | none (dashboard is Phase 5) |
| Head Coach / Team Director | Entire team: all ride groups, coaches, athletes, observations | Whole team |
| Ride Group coach | Own ride group only — *all* coaches in a group see *all* ratings in it (collaborative, not per-coach siloed) | Athletes in own ride group |

A HC cannot see another team's data — the multi-tenant boundary already baked into every record via `team_id`.

---

## AuthN — authentication

- **Supabase Auth.** v1 = **Google OAuth**; email **magic link** (OTP) as a fast-follow. Both routes yield a Supabase `auth.users` row keyed by a *verified* email.
- **Why verified-email auth is load-bearing:** it is what makes "the email present in the imported roster ⇒ authorized as that coach" safe. The login *proves* ownership of that email; a plain email claim would be trivially impersonable. (Mirrors swim-coach: the backend verifies the Google ID token `aud` against `GOOGLE_CLIENT_ID` server-side, then mints a session token — see `swim-coach/backend/app/routes/auth.py`.)
- **`VITE_GOOGLE_CLIENT_ID`** is a *public* value (a repo Actions **variable**, not a secret) baked into the frontend build per environment; the backend verifies against the same client id.

> ⚠️ **Launch prerequisite / risk:** Google-only at launch means **every pilot coach must be able to sign in with a Google-account email.** Confirm the pilot roster's emails are Google-workable — otherwise the magic-link provider becomes co-launch-critical, not a fast-follow.

---

## Identity / person resolution  *(resolves open question: shared PitZone email)*

- `auth.users` (email-scoped) is **separate** from `person` (role-scoped). A join table `auth_person(auth_user_id, person_id)` links them.
- PitZone email is **family-level**, not individual — a parent coach and their student athlete can share one email. So one email → potentially multiple `person` rows.
- **Rule:** login always assumes the **coach** persona; athlete persons are *data*, not logins (minors do not authenticate). If one email maps to more than one coach persona (rare — e.g. coaches two teams), present a "who are you" picker. This keeps a shared family email from collapsing a coach and their child into one identity.

---

## AuthZ — Row-Level Security  *(resolves gap: server-side write authorization)*

Server-enforced **RLS** on Postgres, keyed off `auth.uid()` → `person` → `{role, team_id, ride_group_id}`. Applied to **every** read and write. "Append-only, no conflict" solves *merge*, not *authorization* — a ride-group coach must not be able to write to another group's or another team's athletes.

| Policy | SELECT | INSERT/UPDATE |
|---|---|---|
| Ride-group coach | rows where `ride_group_id` = theirs | observations/confirmed levels for athletes in their ride group |
| HC / TD | rows where `team_id` = theirs | anything in their team |
| League staff | rows where `league_id` = theirs (read-only) | none |
| Cross-team | **denied** | **denied** |

RLS policies live in `supabase/migrations/*.sql` and are exercised in CI (see Environments).

---

## Roster import & access control (reuses Phase 2b, extends it)

1. HC exports roster from PitZone (same file shape as Phase 2b).
2. HC imports into a **team-level HC import interface** (distinct from the individual-coach import in Phase 2b — this seeds the *shared* team roster).
3. HC assigns each row a `ride_group`.
4. Each row's email — where present — becomes the access-control entry: that email is authorized to sign in as that team/ride-group coach (no separate invite step). AuthN (above) is what makes this safe.

**Merge key priority** (unchanged from Phase 2b): `external_id` (NICA/PitZone GUID) first, name-match fallback.

---

## Non-destructive cutover + silo reconciliation  *(resolves the biggest practical risk)*

This is the mechanism that lets team-visibility launch on an aggressive timeline without betting the pilot on backend uptime. It mirrors swim-coach's **store-factory + cutover flag** (`STORE_BACKEND=file|db`, rollback = flip the flag — see `swim-coach/backend/app/store_factory.py` and its `.env.example`).

- Introduce a **store factory** behind `src/storage.js` (whose `_read`/`_write` helpers, `storage.js:50/58`, are the seam). Two backends:
  - `local` — today's `localStorage` (default; unchanged behavior).
  - `db` — Supabase, via the backend API.
- **Additive, offline-first:** reads stay local-first even under `db`; observations are captured locally and synced. Views and `main.js` are untouched — the swap is entirely below `storage.js`.
- **On auth (cutover):**
  - **push** local observations (union by `id`, append-only → zero conflict) + confirmed levels (last-write-wins by `athlete_id + skill`, `confirmed_at` resolves);
  - **pull** the team roster + in-scope coaches' data into a read cache.
- **Duplicate-athlete reconciliation:** run the Phase 2b merge keys (`external_id` → name) to map each coach's local athlete UUIDs onto the canonical team-roster UUIDs; keep a local `id → canonical_id` map so pushed observations re-point to the canonical athlete. Without this, day-one produces duplicate athletes.
- **Reversible:** local data is **never deleted** on cutover. Flag off ⇒ the app reverts to fully-offline client-only operation on local data. Per-team flag ⇒ enable one team at a time; a team that isn't ready simply stays client-only (no pilot outage).

---

## Ride group moves — permanent vs. temporary

- **Permanent move** — athlete's `ride_group_id` changes going forward. HC/TD-only. A ride-group lead can *recommend* a move (flag/note visible to HC/TD) but can't execute it.
- **Temporary move** — single-practice override (e.g. a recovery-day ride with a slower group). Modeled as a per-`practice_id` `ride_group_override_id`, defaulting to the athlete's home group — never mutates the home `ride_group_id`.

The data model needs both a stable home ride group on the athlete and a per-practice override, or a temporary ride permanently reclassifies the athlete.

---

## "Falling behind" flag (HC dashboard)

Computed view, not a stored flag — recalculated from existing `Observation`/`ConfirmedLevel` records. An athlete is flagged if their confirmed level hasn't changed in **N practices / N days** (open question), **or** they're below the trail-minimum for rides their group has actually done (ties into IDEA-001, Trail Network Checker — anticipate the data shape).

---

## HC dashboard — feature set

1. **Roster management** — import/re-import from PitZone export, assign/reassign ride groups, manage coach access (via imported emails)
2. **Cross-coach ratings view** — who is rating whom, filterable by ride group / coach / athlete
3. **Progress view** — confirmed-level trend per athlete over time (new — recommend **per-skill** BP/Bk/Cn, not a composite; a single trend hides which skill is the bottleneck)
4. **Ride group move tool** — permanent (HC/TD) + visibility into lead recommendations
5. **Falling-behind list** — computed staleness flag, surfaced as a simple list

---

## PII / minors' data posture  *(resolves privacy-escalation gap)*

Phases 1–2 kept minors' data on one device. Phase 3 centralizes minors' identity data in Supabase — a materially different consent/retention/access posture.

- **Medical notes + emergency contacts (IDEA-005) stay device-local for the pilot — they do NOT sync to the backend.** Sync only roster identity + skill/observation data. This slashes both the privacy surface and the build scope. (Recommendation; confirm with Tim.)
- RLS confines all athlete data to team/group scope.
- **Never log PII** in backend logs (extends the global standard; observations reference athlete by id).
- **Open questions for Tim / NICA:** parental consent for centralizing minors' identity data; retention + hard-delete path; whether peer ride-group coaches should ever see another athlete's safety info (kept moot for the pilot by the local-only rule above).

---

## Proposed Phase-3 schema

New tables (Supabase Postgres; all UUID PKs; RLS on every table):

- `league(id, name)`
- `team(id, league_id, name)`
- `ride_group(id, team_id, name, lead_coach_id)`
- `person(id, team_id, ride_group_id, role, name, external_id, …)` — replaces the ad-hoc people/roles the app already uses client-side; `role ∈ {league_staff, head_coach, team_director, coach, athlete}`
- `auth_person(auth_user_id, person_id)` — links Supabase auth users to coach persons
- `observation` / `confirmed_level` — **unchanged shape** (already carry `team_id`/`coach_id`); add a denormalized `ride_group_id` for RLS speed

**Migration note:** existing *fields* need no migration, but Phase 3 **adds tables + a real DB** — correct the roadmap's "no schema migration" phrasing. Medical/emergency fields are intentionally **not** modeled server-side for the pilot.

---

## Environments & CI/CD  *(swim-coach pattern, adjusted to a true ITG/prod stack)*

swim-coach runs a single prod environment (`swim-coach/.github/workflows/deploy-backend.yml`: manual `workflow_dispatch`, WIF auth, Artifact Registry, Cloud Run `min-instances=0`, image tagged `:${sha}`+`:latest`). mtb-skills adds a real **ITG (staging) + prod** split:

- **Two Supabase projects** — `mtb-itg` and `mtb-prod` (free tier). App traffic via the **transaction pooler** (port 6543, prepared statements disabled); **direct** connection (5432) for migrations only.
- **Two Cloud Run services** — `mtb-api-itg`, `mtb-api-prod` (one GCP project, WIF auth, Artifact Registry, `min-instances=0` → ~$0 idle). `backend/Dockerfile` built with the repo root as context (mirrors swim-coach).
- **Frontend → GCS bucket per env** — `mtb-web-itg`, `mtb-web-prod` (the ROADMAP-noted shift off GitHub Pages). Each build bakes env-specific `VITE_SUPABASE_URL` / `VITE_GOOGLE_CLIENT_ID` / `VITE_BACKEND_URL`; the store-factory flag defaults **off** (client-only) so nothing changes for a coach until their team is enabled.
- **CI (`ci.yml`)** — extend the current unit+e2e matrix with a **`db` job** (spin up `postgres:16`, apply `supabase/migrations/*.sql`, **re-apply for idempotency**, run RLS/contract tests) and a **`backend` job** (FastAPI tests with externals mocked + placeholder secrets), matching swim-coach's job layout.
- **CD** — merge to `main` → **auto-deploy to ITG** (frontend GCS + backend Cloud Run). **Prod is a gated manual `workflow_dispatch` promote** (swim-coach's manual-prod discipline). Deploy pins the SHA tag for inspectable rollbacks. GCP creds via WIF secrets (`GCP_WORKLOAD_IDENTITY_PROVIDER` / `GCP_SERVICE_ACCOUNT` / `GCP_PROJECT_ID`).

---

## Build-phase layout (mapped to the 1–2 week, visibility-at-launch constraint)

**Launch-critical (must be prod-stable before any pilot team is switched on):**

- **3.0 Foundations & environments** — ITG/prod Supabase + Cloud Run + GCS; `backend/` FastAPI skeleton; initial migrations incl. RLS skeleton; Google OAuth configured; frontend env plumbing + store-factory flag (defaults off). *No user-visible change.*
- **3.1 AuthN + identity** — Google login; `auth_user → person` resolution (incl. shared-email hat); a coach round-trips *their own* data through the backend. Highest-risk piece, built first, verified in ITG.
- **3.2 Non-destructive sync + reconciliation** — store factory behind `storage.js`; push/pull; merge-key dedupe; offline-first + reversible fallback proven. Still single-coach visibility.
- **3.3 Team seed + cross-coach READ view** — HC team-level import seeds roster + `ride_group`; RLS-enforced cross-coach read. **This is the minimum that unblocks the coach's request → first pilot exposure once stable.**

**Post-launch (deferred so 3.3 can pilot first):**

- **3.4 HC dashboard** — ride-group moves (permanent + per-practice `ride_group_override_id`), per-skill progress-over-time view, computed falling-behind list.
- **3.5 Hardening & staged rollout** — load/auth/RLS audit, retention/deletion, magic-link provider, enable teams one at a time.

League-staff **dashboard** stays **Phase 5**; only `league_id` scaffolding lands now, for multi-tenant safety.

---

## Execution model (how the build runs)

Mirrors the swim-coach working pattern:

- **Opus orchestrates and verifies; Sonnet builds.** The orchestrator (Opus) decomposes each increment (3.0–3.3) into workstreams, dispatches **Sonnet** build subagents per workstream, then **Opus verifies** the result (reads the diff, runs tests, checks against the stability gates below) before integrating.
- **Every increment lands as a PR** — committed to a feature branch, CI green, **Andrew reviews and merges.** No auto-merge.
- **TDD throughout** (project standard): tests written first per increment; unit + e2e + the new `db`/RLS suites must pass before a PR is opened.

---

## Stability gates (a team is enabled in prod only after all pass)

1. Google OAuth login + `auth → person` resolution verified in **ITG** with test accounts.
2. RLS tests: a ride-group coach **cannot** read/write outside their group; HC can, across the team; cross-team isolation holds. (Run in CI's `db` job + in ITG.)
3. Sync round-trip: local silo → push → pull on a second device shows the same data; duplicate-athlete reconciliation produces **no** duplicates.
4. **Cutover rehearsal in ITG** on copied (non-prod) data; **rollback** (flag off → client-only local) verified.
5. Only then promote to prod and enable **one team at a time.**

---

## Cutover moments & fallback discipline

Cutovers are where risk concentrates — steady-state read/write is low-risk; the transitions are not. Each cutover below gets: a **pre-cutover snapshot**, a **rehearsal in ITG on copied data**, a **verified rollback**, and **one-unit-at-a-time** rollout. No cutover is performed without its rollback demonstrated first.

| Cutover moment | Increment | Risk | Fallback (rollback) |
|---|---|---|---|
| Store flag flip `local → db` for **one coach** | 3.2 | Sync writes to the wrong place / partial push | Flip flag → `local`; local data untouched (never deleted) |
| Roster **reconciliation** (local ids → canonical) | 3.2 | Duplicate or mis-mapped athletes | Reconciliation is additive (no deletes); keep the `id→canonical` map + pre-cutover local snapshot; revert = ignore the map |
| **Enable a team** (cross-coach visibility on) | 3.3 | A coach sees wrong scope / RLS hole | Disable team flag → every coach reverts to client-only local |
| **Prod promote** (ITG → prod deploy) | 3.0–3.5 | Bad image/migration reaches prod | SHA-pinned Cloud Run rollback; frontend redeploy prior GCS build; migrations forward-only + rehearsed |
| **Enable backend for a consented team** | 3.3+ | Consent/scope mismatch | Consent gates *enablement*, not the build; un-consented teams stay client-only |

The reversible per-team flag is the backbone: at every one of these points, "off" is a safe, tested state that returns the affected coach/team to exactly today's behavior on their own local data.

---

## Open questions

**Resolved with Andrew (2026-08) — not blocking the 3.0–3.3 build:**
1. **Shared PitZone email (coach = parent).** ✅ Login = coach persona; picker if an email maps to >1 coach persona (rare).
6. **Multi-team coaches.** ✅ Pilot assumes **one team per coach**; `auth_person` stays many-to-many so multi-team is an additive change later (no migration).
8. **Minors' PII / consent.** ✅ Medical/emergency stays device-local. Parental/NICA consent to centralize *identity* data gates **per-team enablement**, not the build — un-consented teams stay client-only. Retention + hard-delete path: define during 3.5.

**Deferred to the Tim session — all Phase 3.4 (post-launch), so Tim's availability does not block the pilot:**
2. **Staleness window** — how many practices/days without a level change triggers "falling behind"? Vary by skill or by current level?
3. **Ride-group-lead recommendation flow** — simple note/flag to HC/TD, or an explicit accept/reject request?
4. **Temporary move UX** — does the receiving coach confirm anything, or does the athlete just appear for that practice via the override?
5. **Progress view granularity** — recommend **per-skill**; confirm vs a composite trail-readiness trend.
7. **League staff onboarding** (Phase 5) — PitZone-export-driven, or separate provisioning?

1. **Shared PitZone email (coach = parent).** Proposed approach above (login = coach persona; picker if >1 coach persona) — validate it covers the real cases.
2. **Staleness window** — how many practices/days without a level change triggers "falling behind"? Vary by skill or by current level?
3. **Ride-group-lead recommendation flow** — simple note/flag to HC/TD, or an explicit accept/reject request?
4. **Temporary move UX** — does the receiving coach confirm anything, or does the athlete just appear for that practice via the override?
5. **Progress view granularity** — recommend **per-skill**; confirm vs a composite trail-readiness trend.
6. **Multi-team coaches** — can one coach belong to >1 team (traveling TD), or always exactly one?
7. **League staff onboarding** — PitZone-export-driven, or separate provisioning (they aren't in any single team's roster export)?
8. **Minors' PII / consent** — sign-off to centralize identity data; retention + delete path; medical stays device-local for pilot (confirm).

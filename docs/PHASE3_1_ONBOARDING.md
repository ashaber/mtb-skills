# Phase 3.1 — First-login onboarding (email → coach auto-link)

**Status:** built overnight (stacked on the 3.1 branch, which is PR #20 / still draft). Lands as its own **PR — not merged.** Answers "how does a coach get recognized on first login" — the gap that made the local-test seed require a hand-inserted `auth_person` row.

## The problem
On first Google sign-in, Supabase creates an `auth.users` row, but there is no `auth_person` linking that user's `sub` to a coach `person` — so `resolve_personas` returns empty and every request is 403. Something has to create that link. Design (per `PHASE3_TEAM_VISIBILITY_PLAN.md` + IDEA-020): **the coach's email is the pre-authorization** — a `person` row carrying that email means "this email may sign in as this coach."

## What this increment builds
1. **`person.email`** — new nullable column (migration `0005`). A coach `person` carries the email that authorizes login. Case-insensitive lookup index. (Athletes may have null email; family emails can repeat — NOT unique.)
2. **First-login auto-link (bootstrap)** — in `get_caller`: after a valid JWT, if `resolve_personas(sub)` is empty AND the JWT carries a verified `email`, attempt to link: find **coach-role** persons (`head_coach, team_director, coach, league_staff` — NEVER `athlete`, per the family-email rule) whose `email` matches (case-insensitive) and that aren't yet linked to this `sub`; insert the `auth_person` row(s); re-resolve. Still empty → 403 "not a recognized coach".
3. **Tests** — the link happens; only coach personas link (an athlete sharing the email is ignored); idempotent (no dup on re-login); no email in JWT → no link; unknown email → 403.

## ⚠️ Security boundary — the service-role connection
The `auth_person` write CANNOT go through `rls_connection` (RLS + grants deny `authenticated` any write to `auth_person`, by design — 0004). The bootstrap therefore uses a **new, deliberately RLS-bypassing `service_connection()`** (a plain connection as the pooled/owner role, no `SET ROLE authenticated`). This is the ONE legitimate bypass in the system and must stay tightly scoped:
- Used **only** by the onboarding bootstrap — nowhere else. (`rls_connection` remains the path for all coach data access.)
- It does exactly two things: read `person` rows by email (coach roles only), and insert `auth_person`. It never returns athlete/observation data to a caller.
- The email it matches on is the **verified** JWT `email` claim (trusted only because the signature was verified first).
Opus verifies this personally (like the RLS linchpin) — a leak here would defeat the whole RLS model.

## Explicitly deferred
- **HC roster management** (create/edit a `person` + email, assign ride-group; the way emails actually get into the DB at scale) → next increment / 3.3 (PitZone/Sheet import). For now emails are seeded manually or by that later endpoint.
- Any frontend onboarding UI.

## Verify (resume protocol if interrupted)
- `bash scripts/db_test.sh` (migrations 0001–0005 idempotent; RLS suites) · `pytest tests/api tests/backend` · `npm run test`. All green before the PR.
- Branch: `phase3/onboarding` off `phase3/3.1-auth-headstart`. Because the parent (#20) is squash-merge-pending, the final PR may re-show 3.1 commits until #20 merges — clean up then (branch off the new main + cherry-pick, as with #18).

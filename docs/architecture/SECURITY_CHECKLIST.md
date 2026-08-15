# Security & Architecture Review Checklist

A reusable checklist for a human or agent running a security pass on this
project — tailored to what this stack actually is, not a generic template.
Each item below carries its **last-verified status** so this doubles as an
audit trail, not just a list of things to remember to ask about. Re-run an
item and update its status whenever the relevant code changes; don't trust
a stale ✅ forever.

**This project's actual stack** (confirmed, not assumed):
- Frontend: vanilla JS PWA (ES modules, Vite, `vite-plugin-pwa`) — no
  React/Vue/Svelte, no JSX
- Backend: Python/FastAPI in Docker, deployed to **Cloud Run**
- Database/Auth: **Supabase** (Postgres + RLS + Supabase Auth/Google OAuth)
- Storage: **none** — no GCS (or any object storage) anywhere in the live
  system. Section 4 below is kept for when/if that changes, not deleted,
  but nothing in it applies today.

---

## 1. Supabase (Database & RLS)

- [x] **RLS enabled on every table.** Verified by diffing every `create
  table` against every `alter table ... enable row level security` across
  all of `supabase/migrations/*.sql` — **11 of 11 tables**, zero gaps.
  *(Last verified: 2026-08-14)*
- [x] **`SECURITY DEFINER` functions pin `search_path`.** All 6
  (`app_caller_person_ids`, `app_caller_ride_group_ids`,
  `app_caller_hc_team_ids`, `app_caller_league_ids`,
  `app_caller_own_team_ids`, `app_caller_league_team_ids`) have `set
  search_path = public, pg_temp`. *(Last verified: 2026-08-14)*
- [ ] **Permission revokes on `SECURITY DEFINER` functions.** Gap found:
  none of the 6 `create or replace function` statements in
  `supabase/migrations/0002_rls.sql` is followed by any `grant`/`revoke` —
  so each one sits on Postgres's implicit default (EXECUTE granted to
  `PUBLIC` at creation time), never explicitly scoped. Not currently
  exploitable — each function internally scopes by `auth.uid()`, so an
  anonymous caller executing one just gets an empty result, not a leak —
  but adding `revoke execute ... from public; grant execute ... to
  authenticated;` for each is real defense-in-depth, not done yet.
  *(Found: 2026-08-14)*
- [x] **No service-role key or `DATABASE_URL` in client bundle.** Checked
  every `VITE_*` env var read by `src/env.js` and set by
  `deploy-frontend.yml`: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`
  (anon key, not service role), `VITE_BACKEND_URL`, `VITE_GOOGLE_CLIENT_ID`
  — nothing else. `DATABASE_URL`/`SUPABASE_SERVICE_ROLE_KEY` only ever
  exist as GCP Secret Manager values injected into the **backend's**
  Cloud Run env, never built into the frontend. *(Last verified: 2026-08-14)*

## 2. PWA Frontend & Service Workers

- [x] **No sensitive data cached by the service worker.**
  `vite.config.js`'s `VitePWA({ workbox: { runtimeCaching: [] } })` — the
  service worker precaches only static build assets (`globPatterns:
  ['**/*.{js,css,html,ico,png,svg,json}']`); it does **not** intercept or
  cache any network request at runtime, so no API response and no auth
  token ever passes through the Cache API. *(Last verified: 2026-08-14)*
- [x] **XSS / DOM injection.** No framework here (vanilla JS, not React/
  Vue/Svelte), so this app's own `esc()` helper (`src/views.js`) is the
  entire escaping story — checked all 106 uses, and grepped every
  `${...person-or-text-field...}` interpolation of `name`/`notes`/
  `comment`/`email`/`external_id`/`tags` for one that skips it: zero
  found. Also checked for `eval(`/`document.write`/`new Function(`
  anywhere in `src/`: zero. *(Last verified: 2026-08-14 — re-run this one
  whenever a new view function is added; it's grep-based, not proven for
  all future code.)*
- [x] **Env variables don't leak server secrets into the client bundle.**
  Same check as the Supabase item above — `vite.config.js`'s test-mode
  `define` block only ever sets the same four `VITE_*` names to empty
  strings, nothing broader. *(Last verified: 2026-08-14)*
- [~] **Session token storage.** Supabase's JS client (`src/auth.js`'s
  `createClient()`) uses its default `persistSession: true` /
  `localStorage` — not overridden. This is standard for a browser SPA with
  no backend session proxy (which this app deliberately doesn't have —
  offline-first, static-hosted frontend) and isn't a realistic thing to
  "fix" without introducing a backend the architecture doesn't otherwise
  need. Noted as an accepted characteristic, not a gap. *(Last reviewed:
  2026-08-14)*

## 3. Docker & Google Cloud Run

- [x] **Non-root user.** `backend/Dockerfile`: `USER app` set before the
  final `WORKDIR`/`CMD`, base image `python:3.12-slim` (pinned to a minor
  version, not `:latest`). *(Spot-checked: 2026-08-14)*
- [ ] **Least-privilege IAM for the runtime service account.** **Real,
  already-flagged finding** (see `SECURITY.md`'s Open Items, Priority):
  both `mtb-api-itg` and `mtb-api-prod` run as the GCP **default compute
  service account**, which carries `roles/editor` on the whole project —
  confirmed via `gcloud run services describe ... --format=...
  serviceAccountName` and `gcloud projects get-iam-policy`. This is
  exactly what this checklist's own rule warns against ("never the default
  compute service account"). Not fixed yet.
- [ ] **Deploy service account scope.** `github-deployer` holds
  `run.admin`, `artifactregistry.writer`, `storage.admin`,
  `firebasehosting.admin`, `secretmanager.secretAccessor` — reasonable for
  a deploy identity in general, not yet audited line-by-line against what
  it strictly needs.
- Not re-run this pass (only spot-checked non-root/image-pinning above) —
  full section 3 evaluation still pending a dedicated pass.

## 4. Google Cloud Storage (GCS)

**Not applicable today** — confirmed via repo-wide grep
(`storage.googleapis`, `google-cloud-storage`, `gcs`) that no GCS bucket,
signed URL, or object-storage code exists anywhere in `backend/` or
`scripts/`. `IDEA-024` (engagement-report delivery) sketches a *future*
GCS + signed-URL flow that was explicitly put on hold — if that gets
built, this section becomes real and both of its rules (no public bucket
access, backend-generated short-lived signed URLs only) apply directly to
that design as already written. Kept here, not deleted, so it's not
forgotten when that day comes.

---

## Not yet run this pass

Sections 3 (full) and 4 (n/a today, revisit if GCS ever gets built) —
tracked as open items, not silently skipped. Re-run against this same
checklist rather than starting from scratch each time.

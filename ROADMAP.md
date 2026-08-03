# MTB Skills Assessment App — Roadmap

Phased build plan for a coach-facing skill assessment tool. Each phase is independently usable — coaches can run Phase 1 while Phase 2 is in progress.

---

## Phase 1 — Local HTML App

**Status:** ✅ Complete
**Goal:** A working tool any coach can open on any device. No server, no login, no network dependency.

### Features
- **Athlete roster** — add and manage athletes manually in-app
- **Session assessment** — select athlete → select skill → select level 1–5 → log observation
- **Observation history** — chronological log per athlete per skill
- **Confirm skill level** — coach explicitly confirms a level when the consistency gate is met (separate from raw observations). The consistency gate is a coach judgment call, not an algorithm: the rubric defines it as "consistent = earns the level; one good rep does not qualify." The app surfaces the observation history to support that judgment but never auto-promotes a level.
- **Trail readiness view** — given confirmed levels, show which trails the athlete is ready for per the rubric minimums
- **Data export** — full JSON download (backup + shareable with head coach)

### Tech
- Vanilla JS (ES modules), **Vite** as build tool — no framework
- `npm run dev` → localhost:5173 (hot reload during development)
- `npm run build` → `dist/` (static files deployed to Pages)
- `localStorage` for persistence
- **Vitest** for unit tests, **Playwright (Python)** for e2e tests
- Data model includes `team_id` and `coach_id` on all records for future-proofing

### Deployment
- GitHub Pages — GitHub Actions builds `dist/` on push to `main`, deploys to Pages
- Live at: https://ashaber.github.io/mtb-skills/
- `index.html` at repo root is the Vite entry point
- Updates ship automatically on merge to `main` via CI

### Offline
Fully offline by design — no network calls.

### Definition of Done
- [ x ] `index.html` at repo root, served by GitHub Pages via `dist/`
- [ x] Live and accessible at https://ashaber.github.io/mtb-skills/
- [ x] Opens and functions on Android (Chrome)
- [ ] Opens and functions on iOS (Safari)
- [ x] Athlete roster: add and manage athletes
- [ x] Session assessment: log observation (athlete → skill → level 1–5 → date)
- [ x] Observation history: chronological log per athlete per skill
- [ x] Confirm skill level: coach explicitly sets confirmed level
- [ x] Trail readiness: computed from confirmed levels, matches rubric minimums
- [ x] JSON export: full data download including log
- [ ] JSON export verified: re-imports cleanly with no data loss
- [ ] Data persists across page reloads (localStorage)
- [ ] Works with no network connection
- [ ] All records use UUIDs, carry `team_id` and `coach_id`
- [ ] Vitest unit tests pass (`npm run test`)
- [ ] Playwright e2e tests pass on Chromium and WebKit
- [ ] Manual verify on real Android (Chrome) and iOS (Safari)
- [ ] README.md updated, ROADMAP.md phase status updated
- [ ] Git tag applied: `v1.0`

---

## Phase 2 — PWA + Google Sheets Roster Import

**Goal:** App installs to home screen and works reliably offline; coaches can load their existing team roster from a Google Sheet instead of entering athletes manually.

Two independent milestones — neither requires a backend.

### Milestones (in order)

**2a — PWA: service worker + installability**
- Add `vite-plugin-pwa` to generate service worker and web manifest
- App installs to home screen on Android (Chrome) and iOS (Safari)
- Service worker caches all static assets and rubric data — app loads fully offline even after a browser restart or low-storage cache eviction
- Manifest: name, short name, icons (192×192, 512×512), display: standalone, theme color
- Test: install on real Android and iOS devices, airplane mode, re-open — zero network calls

**2b — Google Sheets CSV roster import**
- Head coaches typically manage team rosters in a Google Sheet (names, roles, categories)
- Coach shares their sheet with "anyone with link can view," pastes the link into Settings
- App extracts the sheet ID, fetches the Sheets CSV export endpoint (no OAuth needed for public-read sheets), parses to athlete records
- Imported athletes merge into the existing roster by name (no duplicates); existing observations and confirmed levels are preserved
- Offline: last-fetched roster cached in localStorage — import works once, then stays available
- No backend required — entirely client-side

### Not in Phase 2
Real-time roster distribution (head coach pushes, ride group coaches pull) requires a backend — that's Phase 3.

---

## Phase 3 — Supabase Multi-Tenant Backend (Team Visibility)

**Goal:** Head coach maintains one roster; ride group coaches authenticate and see their assigned group — and *each other's* ratings within the group. Eliminates manual roster entry on each device and closes the multi-coach visibility gap.

> **Full design:** `docs/PHASE3_TEAM_VISIBILITY_PLAN.md` (org/access model, AuthN/AuthZ, cutover, schema, environments, build phases, execution model, stability gates). This section is the summary.

### Problem solved
A team has one head coach and multiple ride group coaches. Today each coach's app is a `localStorage` silo — a real coach reached out: *"each coach has their roster with scores but I can't see them."* Phase 3 connects them, with server-enforced access control.

### Org & access model
`League → Team → Ride Group → coaches/athletes`. A ride-group coach sees all ratings in their group (collaborative); HC/TD see the whole team; league staff see all teams in their league (read-only — dashboard is Phase 5). Cross-team is denied.

### AuthN / AuthZ (critical path)
- **AuthN:** Supabase Auth — **Google OAuth first**, email magic link as a fast-follow. Verified email is the access-control key: an email present in the imported roster is authorized as that coach.
- **AuthZ:** Postgres **Row-Level Security**, server-enforced on every read/write (not just merge). Identity model separates `auth.users` (email) from `person` (role) so a shared family PitZone email doesn't collapse a coach and their child.

### Non-destructive, reversible cutover
- **Store factory behind `src/storage.js`** (`local` | `db`), flag-gated **per team**, defaulting off — mirrors swim-coach's `STORE_BACKEND` cutover. Local data is never deleted; rollback = flip the flag back to client-only local operation.
- Sync: observations append-only (union by id); ConfirmedLevel last-write-wins. Duplicate-athlete reconciliation uses the Phase 2b merge keys (`external_id` → name).

### Architecture & environments (true ITG/prod)
- **FastAPI** (Python 3.12-slim) on **Cloud Run** (scales to zero), image in **Artifact Registry**, deployed via **WIF** from CI — patterned on `swim-coach`, adjusted from its single-prod setup to **staging (ITG) + prod**: two Supabase projects, two Cloud Run services, a **GCS bucket per env** for the frontend (the shift off GitHub Pages).
- **CI** gains `db` (spin up `postgres:16`, apply `supabase/migrations/*.sql`, idempotency re-apply, RLS/contract tests) and `backend` jobs. **CD:** merge to `main` → auto-deploy to ITG; prod is a gated manual promote.

### Build-phase layout
- **3.0** foundations & environments · **3.1** AuthN + identity · **3.2** non-destructive sync + reconciliation · **3.3** team seed + cross-coach read view *(launch-critical — minimum that unblocks the coach's request)*
- **3.4** HC dashboard (moves, per-skill progress, falling-behind) · **3.5** hardening, retention/delete, magic link, staged rollout *(post-launch)*

### PII posture
Medical notes + emergency contacts (IDEA-005) **stay device-local for the pilot** — only roster identity + skill/observation data syncs. Never log PII in backend logs.

### Migration note
Existing *fields* need no migration, but Phase 3 **adds tables + a real DB** (`league`, `team`, `ride_group`, `person`, `auth_person`; `observation`/`confirmed_level` gain a denormalized `ride_group_id`).

---

## Phase 4 — Native Mobile App

**Goal:** App Store distribution and native UX. The break point from PWA is distribution — when a league coordinator needs to say "download MTB Skills from the App Store" in a coach training session, PWA becomes a distribution liability.

### Migration path

| Step | What | Why |
|---|---|---|
| 2c | PWA manifest + service worker | Reliable offline, home screen install on Android |
| 4a | Capacitor wrapper → App Store | Fastest path to iOS App Store reusing existing codebase |
| 4b | Evaluate: is PWA-in-shell sufficient? | Stay here if coaches are satisfied and no native APIs needed |
| 4c | React Native rewrite (optional) | Only if background sync, video processing, or native UX is a real complaint |

### Tech stack options

**Capacitor (Ionic)** — wraps the existing web app in a native shell with native API bridges. Closest migration from the current codebase: HTML/CSS/JS runs as-is, Capacitor adds native plugins for camera, notifications, etc. Tradeoff: the app runs in a WebView, which has a subtly different feel than a truly native app (see note below). Right choice for Step 4a.

**React Native (Expo)** — write once in TypeScript, compiles to truly native iOS and Android components (not a WebView). The existing JS business logic (storage, rubric, trail readiness) ports directly; only the UI layer is rewritten. Expo managed workflow handles Xcode/Android Studio setup and enables over-the-air content updates without App Store review. Right choice if 4b evaluation shows native UX is a real requirement.

**Flutter** — write once in Dart, renders its own UI (not native widgets). Best cross-platform consistency; steeper learning curve (new language). Not recommended unless the team already knows Dart.

### WebView feel vs. truly native

Capacitor runs the app inside a browser engine embedded in a native shell. The gap is subtle but real:

- **Scroll physics** — iOS has a distinctive momentum scroll with rubber-band bounce at the edges. WebView scroll feels slightly stiffer and doesn't always match the native spring curve. Coaches who use a lot of iOS apps will notice.
- **Tap response** — native controls have a ~16ms touch-to-visual-response. WebViews add a layer of JS event processing; on slower devices this shows up as a slight lag on button taps.
- **Animations** — CSS transitions run on the browser's compositor thread, which is good, but complex animated transitions (like the sheet slide-up) can stutter on mid-range Android devices under memory pressure in ways that native UIKit/Jetpack animations don't.
- **Text selection and context menus** — WebView text behaves like a webpage: long-press selects text and shows a web context menu instead of native iOS/Android behavior.
- **Keyboard handling** — the soft keyboard pushing the WebView viewport up can cause layout jumps that native forms handle more gracefully (this app already has this in the feedback modal on Android — D8).
- **What you don't lose** — all app logic, all rubric content, all data model code transfers unchanged. The gap is purely in feel, not in capability.

**For this app specifically:** coaches are using it in gloves, on trail, often on mid-range Android devices. The tap responsiveness and scroll physics difference is real in that context. Whether it's a dealbreaker depends on the user feedback at 4a — hence the evaluation step before committing to a React Native rewrite.

### Native features needed (not available in PWA)

- App Store distribution and discoverability
- Push notifications (practice reminders, coach alerts) — limited on iOS PWA
- Reliable background sync — PWA background sync is unreliable on iOS
- Video frame processing (moonshot) — browser video APIs are too slow for real-time analysis

### Offline storage

localStorage is replaced with SQLite (via Expo SQLite or Capacitor SQLite plugin). Same data model; the `storage.js` abstraction layer from Phase 1 is designed for this swap.

### Syncs to

Supabase backend (Phase 3).

---

## Phase 5 — League-Level Visibility + HubSpot Integration (optional)

**Goal:** League director visibility across all teams; automated roster sync from NICA registration data.

### Features
- League director dashboard: all teams, all athletes, cross-team readiness reporting
- Inter-rater reliability tooling between trained coaches
- NICA PitZone integration via HubSpot (replaces manual Google Sheets roster import from Phase 2b)

### NICA / HubSpot / PitZone integration

**Context (2026-06-26):** NICA is centralizing on HubSpot CRM. HubSpot has a 2-way API integration with PitZone (NICA's athlete/team registration platform). External app integrations go through HubSpot. HubSpot integration is estimated 1+ year away — Phase 2b (Google Sheets import) covers the near-term gap. Contact: Tony (NICA IT) — coordinate access before building.

**Opportunity:** If NICA exposes team/athlete roster data via HubSpot API, the app can pull pre-built rosters instead of requiring coaches to enter athletes manually. Coach opens app → team roster already populated from PitZone registration data. Replaces the Phase 2b Google Sheets import step.

**Data available via HubSpot API (likely):**
- Coaches and athletes as Contact records
- Teams as Company records
- League/region hierarchy
- Registration status, age group, category (from PitZone sync)

**Integration approach for Phase 5:**
- FastAPI backend authenticates to HubSpot via OAuth 2.0
- On team setup: pull roster from HubSpot, seed local Supabase records with `team_id` + `coach_id`
- Periodic sync or on-demand refresh (coaches may join/leave mid-season)
- Skill assessment data stays in Supabase — never written back to HubSpot (read-only integration)
- `team_id` and `coach_id` already on every record from Phase 1 — no schema migration needed

**Prerequisites before building:**
- Meeting with Tony (NICA IT) to confirm API access scope and auth method
- Determine if NICA offers a developer program or if this requires a formal partnership
- Confirm PitZone → HubSpot sync includes the fields needed (athlete name, category, team assignment)

### Architecture note
Monorepo: frontend in `src/`, backend in `backend/`. Split into separate repos later only if team size or deploy cadence requires it.

---

## Phase 1+ — Reference Video per Skill Level

**Collaborator:** Tim Curry (co-author of rubric, Assistant Professor of Physiology)

Tim and Andrew shot video of each skill demonstrated at each target level. Editing is partially complete; a second shoot is planned to refine. The feature adds a YouTube-linked reference clip to each rubric card so a coach can watch the skill performed correctly at a specific level.

- Each skill card gets an optional "watch example" link → opens a YouTube clip
- Clips are keyed by `skill + level` — stored in `rubric.js` alongside the rubric content
- No data model change required — this is rubric content, not athlete data
- Does not block Phase 1 — can ship as a rubric content update once clips are ready

## Moonshot — Automated Video Analysis

**Collaborator:** Tim Curry

- Tagged video clips attached to observations
- Automated technique detection (e.g., body position classification from video)
- Data model impact: observations gain an optional `video_url` field — no schema migration needed
- Does not block any earlier phase

---

## Skills Not Yet in Rubric Scope

**Climbing** — excluded from v1 rubric. Climbing is a discrete-technique toolbox rather than a linear step-accumulation progression. To be added as a separate module once the rubric is defined. When added, it extends the app without structural changes.

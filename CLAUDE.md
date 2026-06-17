# MTB Skills Assessment — Project Instructions

## App being built

A coach-facing skill assessment tool for NICA MTB coaches. See ROADMAP.md for phases.

**Tech stack:**
- **Frontend:** Vanilla JS (ES modules), Vite as build tool — no framework (no React/Vue)
- **Build:** `npm run build` → `dist/` → deployed as static files
- **Dev server:** `npm run dev` → localhost:5173 with hot reload
- **Backend (Phase 4):** Python FastAPI, Docker (python:3.12-slim), Cloud Run on GCP
- **Repo structure:** Monorepo — frontend in `src/`, backend in `backend/` when added
- **Offline-first throughout all phases** — practices are frequently out of cell service
- **No sequential IDs** — use UUIDs everywhere (multi-device merge safety)
- **Data model must not lock out multi-tenant** — all records carry `team_id` and `coach_id` from Phase 1

**Monorepo structure:**
```
mtb-skills/
  src/              ← Vite frontend source
    rubric.js       ← rubric data as ES module
    storage.js      ← data access abstraction
    log.js          ← in-app logger
  tests/
    unit/           ← Vitest unit tests (JS logic)
    e2e/            ← Playwright e2e tests (browser/UI)
  backend/          ← Phase 4: Python FastAPI (not yet)
  .github/
    workflows/      ← CI/CD pipelines
  dist/             ← Vite build output (gitignored)
  index.html        ← Vite entry point at repo root
  vite.config.js
  package.json
```

**Deployment:**
- **Phase 1–3:** GitHub Pages — GitHub Actions builds `dist/` on push to `main`, deploys to Pages
- **Phase 4 frontend:** GCS bucket or Firebase Hosting — same `dist/` output, different deploy target in workflow
- **Phase 4 backend:** Docker image → GCP Artifact Registry → Cloud Run (serverless, scales to zero)
- **Phase 2c:** Add `vite-plugin-pwa` for service worker + manifest generation
- Live URL: https://ashaber.github.io/mtb-skills/

**Definition of Done — Phase 1:**
- [ ] `index.html` exists at repo root and is the app entry point
- [ ] App is live at https://ashaber.github.io/mtb-skills/
- [ ] Opens and functions correctly on Android (Chrome)
- [ ] Opens and functions correctly on iOS (Safari)
- [ ] All Phase 1 features working:
  - [ ] Add and manage athletes (roster)
  - [ ] Log an observation (athlete → skill → level 1–5 → session date)
  - [ ] View observation history per athlete per skill
  - [ ] Confirm a skill level (separate from raw observations)
  - [ ] Trail readiness view computed from confirmed levels
  - [ ] JSON export (full data download, including log)
- [ ] Data persists across page reloads (localStorage)
- [ ] App works with no network connection
- [ ] No sequential IDs — all records use UUIDs
- [ ] All records carry `team_id` and `coach_id`
- [ ] Playwright tests pass: app loads, localStorage persists, offline mode works
- [ ] Playwright tests pass on Chromium and WebKit viewports
- [ ] Manual verify on real Android device (Chrome)
- [ ] Manual verify on real iOS device (Safari)
- [ ] README.md updated to reflect current feature status
- [ ] ROADMAP.md phase status updated (mark phase complete, note any scope changes)
- [ ] Phase tagged in git: `git tag v1.0` (increment per phase)
- [ ] JSON export verified: exported file re-imports cleanly with no data loss

**Key files:**
- `RUBRIC.md` — authoritative rubric content; card content is master. Do not duplicate here.
- `ROADMAP.md` — phased build plan. Do not duplicate here.
- `src/rubric.js` — rubric data as ES module; all views import from here
- `src/storage.js` — data access abstraction; swap this to change backend
- `src/log.js` — in-app logger; ring buffer to localStorage + console
- `src/main.js` — all UI views and event handlers (single-file app)
- `app/schema.md` — data model documentation
- `vite.config.js` — Vite configuration
- `package.json` — npm scripts: dev, build, test

**Documentation strategy:**
- All rubric content (`detail`, `failure_modes`, `when_breaks`) is bundled in `src/rubric.js` — fully offline, no network needed on trail
- Long-form supplemental docs (RUBRIC.md, changelog, release notes) live on GitHub Pages — linked from app Settings, not required for core use
- Video clips (Phase 1+) link to YouTube — acceptable network dependency since video requires connectivity anyway
- Never link to external docs for content a coach needs during a ride

---

## Current Sprint — UI/UX Polish (Phase 1b)

**Branch:** `phase1/ui-polish`
**Goal:** Elevate the app from functional to coach-ready. Fix placeholder gaps, add onboarding, add rubric education screen.

### 1. Onboarding flow (first-launch)
Detect first launch (`getCoach() === null`). Show a welcome screen before the blank roster:
- App name + one-line purpose ("Assess MTB skills. Know which trails your riders are ready for.")
- Three-step flow summary: Observe → Confirm → Trail Readiness
- Coach name input (required to proceed) — calls `saveCoach()`
- Optional team name — calls `saveTeamSettings({ teamName })`
- "Get started" → goes to roster
- Skip is not offered — coach name is required for `coach_id` on all records

**Acceptance criteria:**
- [ ] First launch shows onboarding, not empty roster
- [ ] Returning user (coach already set) goes directly to roster
- [ ] Coach name saved and visible in Settings after onboarding
- [ ] Vitest: `getCoach() === null` triggers onboarding state
- [ ] Playwright: first visit shows onboarding; after name entry, roster shown

### 2. Education screen — Digital field guide
New view: `'rubric'` state in `s.view`. Entry point: bottom nav or header button.

Layout mirrors the printed field cards:
- Skill selector tabs: Body Position | Braking | Cornering
- For each skill, 5 level cards stacked:
  - Level badge (colored circle) + trail rating + consistency gate
  - Failure modes list (from `rubric.js` `failure_modes`)
  - Expandable "Detail" section (from `rubric.js` `detail`) — collapsed by default
  - Video links: **do not show** — no content ready yet. No placeholder, no "coming soon" text. When `video_url` is added to a level in `rubric.js`, the link will appear automatically. Until then, render nothing.
- Back button returns to wherever the coach came from

**Data:** reads entirely from `src/rubric.js` — no storage changes, works offline.

**Acceptance criteria:**
- [ ] Education screen accessible from main nav
- [ ] All 3 skills, all 5 levels rendered with correct content from rubric.js
- [ ] Detail section expands/collapses per level
- [ ] Video placeholder shown (not broken link) when no URL set
- [ ] Playwright: education screen loads, all skill tabs work, expand/collapse works

### 3. Wire up storage stubs
`storage.js` has two implemented-but-unused functions. Connect them:

**Athlete photos** (`getPhoto`, `savePhoto`):
- Add photo display to athlete profile header (avatar circle)
- Tap avatar → file picker → saves as data-URL via `savePhoto()`
- Falls back to initials avatar if no photo set
- Note: data-URLs in localStorage are large — warn in log if photo > 200KB

**Team settings** (`getTeamSettings`, `saveTeamSettings`):
- Add "Team Name" field to Settings modal
- Display team name in roster header (replaces or subtitles "MTB Skills")
- Used in JSON export

**Acceptance criteria:**
- [ ] Athlete profile shows photo or initials avatar
- [ ] Tapping avatar opens file picker, saves photo, displays immediately
- [ ] Team name editable in Settings, shown in roster header
- [ ] Playwright: upload photo flow, team name persists across reload

### 4. Navigation — bottom nav bar
Currently no persistent navigation. Add a minimal bottom nav:
- **Roster** (people icon) — current home
- **Rubric** (book icon) — education screen
- **Settings** (gear icon) — currently only reachable from roster header

Active tab highlighted. Hidden when a modal is open.

**Acceptance criteria:**
- [ ] Bottom nav visible on roster, rubric, and settings views
- [ ] Active tab visually indicated
- [ ] Playwright: nav between all three sections

### 5. Deprecated meta tag
Fix issue noted in console:
- Replace `<meta name="apple-mobile-web-app-capable" content="yes">` with `<meta name="mobile-web-app-capable" content="yes">` in `index.html`
- Closes GitHub issue #3 (partially — the main.js 404 was resolved by deploy)

### Sprint DOD
- [ ] All 5 items above complete
- [ ] Vitest unit tests updated/added for any new logic
- [ ] Playwright e2e tests cover all new flows
- [ ] No bare `console.*` — all logging via `src/log.js`
- [ ] No dead code, no placeholder comments left in shipped code
- [ ] PR description references these items
- [ ] README updated if feature list changes
- [ ] Closes GitHub issues #3

---

## Next Sprint — People, Athlete Info, Practice Roster (Phase 1c)

**Branch:** `phase1/people-and-practice`
**Goal:** Expand roster from athletes-only to people (athletes + coaches). Add athlete info. Add practice roster with attendance.

### Schema migration: Athlete → Person

**This is a breaking schema change. Must be done first — all other items in this sprint depend on it.**

Rename the concept from `Athlete` to `Person`. Existing `mtb_athletes` localStorage key is preserved for backward compatibility — all reads default missing `role` to `'athlete'`.

```json
{
  "id":                        "uuid",
  "team_id":                   "uuid",
  "name":                      "string",
  "role":                      "athlete | coach",
  "grade":                     "integer | null",
  "season_year":               "integer",
  "medical_notes":             "string | null",
  "emergency_contact_name":    "string | null",
  "emergency_contact_phone":   "string | null"
}
```

**Migration rules:**
- Storage key stays `mtb_athletes` — no data loss for existing installs
- `getAthletes()` renamed to `getPeople()` — returns all roles by default, accepts optional `{ role }` filter
- All existing records missing `role` field default to `'athlete'` on read
- `saveAthlete()` renamed to `savePerson()` — accepts `role` field, defaults to `'athlete'`
- `deleteAthlete()` renamed to `deletePerson()`
- Export `schema_version` bumps 1 → 2
- `importAll()` migration shim: if `schema_version === 1`, map `athletes` array to people with `role: 'athlete'`
- `coach_id` on Observation and ConfirmedLevel still refers to the device Coach settings object — **not** a Person record. These are different: the *device's assessing coach* vs *a person being assessed*. Do not conflate.

**Acceptance criteria:**
- [ ] Existing localStorage data (schema v1) loads correctly after migration — no data loss
- [ ] New people saved with explicit `role` field
- [ ] Export includes `schema_version: 2`
- [ ] Import of v1 export migrates cleanly to v2
- [ ] Vitest: migration shim tested — v1 import produces correct v2 records

### Roster filter
Add filter control to roster header: **All · Athletes · Coaches**

- Filter state: `s.roster_filter = 'all' | 'athletes' | 'coaches'`
- Persisted in localStorage so it survives reload (`mtb_roster_filter`)
- "Add person" FAB respects filter context: if filter is 'coaches', new person defaults to `role: 'coach'`; if 'athletes', defaults to `role: 'athlete'`; if 'all', show role selector in add modal

**Acceptance criteria:**
- [ ] Filter chips visible on roster
- [ ] Filtering by athletes shows only `role: 'athlete'` records
- [ ] Filtering by coaches shows only `role: 'coach'` records
- [ ] Filter selection persists across reload
- [ ] Add modal sets correct default role based on active filter
- [ ] Playwright: filter toggle, add athlete, add coach, verify separation

### Athlete info
Add optional medical and emergency contact fields to Person. Surfaced via an info icon (ℹ) on the athlete/person profile — taps to a dedicated info modal.

**UX rules:**
- Info icon only shown if any info field is set — no empty modal clutter
- Edit pencil inside the info modal to update fields
- Privacy note in modal: "Stored on this device only. Included in JSON export."
- Fields: Medical notes (free text), Emergency contact name, Emergency contact phone
- All fields optional — blank = not stored

**Acceptance criteria:**
- [ ] Info icon appears on profile when any info field is set
- [ ] Info icon hidden when no fields set
- [ ] Info modal shows all set fields, edit opens form
- [ ] Privacy note visible in modal
- [ ] Info fields survive reload and export/import round-trip
- [ ] Playwright: add info, verify icon appears, verify persists across reload

### Practice roster
New entity and view for recording practice attendance.

**New entities:**
```json
// Practice
{
  "id":       "uuid",
  "team_id":  "uuid",
  "coach_id": "uuid",
  "date":     "YYYY-MM-DD",
  "notes":    "string | null"
}

// PracticeAttendance
{
  "id":          "uuid",
  "practice_id": "uuid",
  "person_id":   "uuid",
  "team_id":     "uuid",
  "status":      "attending | absent | temp_add",
  "name_override": "string | null"
}
```

`temp_add` status covers athletes added manually when a trading card wasn't received from their usual coach. `name_override` stores the name for temp adds who aren't in the permanent roster.

**New localStorage keys:**
- `mtb_practices` — Practice[]
- `mtb_attendance` — PracticeAttendance[]

**UX:**
- Practice roster accessible from bottom nav or roster header
- On open: shows today's practice (auto-created if none exists for today)
- Roster list with attending/absent toggle per person — attending sorted to top, absent below
- Filter mirrors main roster filter (athletes / coaches / all)
- "+ Temp add" button for riders not on permanent roster
- Tap a person row → their athlete profile (same as main roster)

**Acceptance criteria:**
- [ ] Practice view opens, creates today's practice if none exists
- [ ] Mark attending/absent persists across reload
- [ ] Attending sorted above absent
- [ ] Filter (athletes/coaches/all) works in practice view
- [ ] Temp add creates attendance record with `status: 'temp_add'`
- [ ] Vitest: practice and attendance storage functions
- [ ] Playwright: mark attendance, reload, verify state persists

### Sprint DOD
- [ ] All schema migration items complete and tested
- [ ] Roster filter working (all / athletes / coaches)
- [ ] Athlete info fields add/edit/display
- [ ] Practice roster with attendance and sorting
- [ ] Vitest coverage: migration shim, getPeople filters, practice/attendance storage
- [ ] Playwright coverage: filter, info modal, practice attendance flow
- [ ] `app/schema.md` updated to schema v2
- [ ] No bare `console.*` — all logging via `src/log.js`
- [ ] PR description references DOD items

**Assessment model:**
- Raw observations are immutable append-only: `{ athlete_id, skill, level_observed, session_date }`
- Confirmed level is separate: coach explicitly sets it when consistency gate is met
- Consistency gate is coach judgment — app surfaces history, never auto-promotes
- Trail readiness is always computed client-side from confirmed levels + `TRAIL_MINIMUMS` in `rubric.js`

---

## Build Guidelines

### Test-driven workflow
- Every module requires test cases before shipping
- Write tests first — confirm they fail — then code until passing
- Never skip tests to move faster
- All tests must pass before a feature is considered done

### Test tooling
**Vitest** — unit tests for JS logic (storage, rubric calculations, trail readiness)
- Lives in `tests/unit/`
- Run with `npm run test`
- Native ES module support — zero config with Vite
- Mocks `localStorage` cleanly

**Playwright (Python)** — e2e/UI tests for full browser flows
- Lives in `tests/e2e/`
- Run with `pytest tests/e2e/`
- Exit code 0 = all pass, non-zero = failure — safe for CI

### What to test (minimum per feature)
- App loads at root URL
- Feature renders and accepts input correctly
- localStorage persists across page reload (simulate by reloading the page context)
- App functions correctly with network set to offline (`context.set_offline(True)`)
- Mobile viewport: test at 390×844 (iPhone 14) and 412×915 (Android)

### Browsers to cover
- Chromium (Android Chrome proxy)
- WebKit (iOS Safari proxy)
- Real device test on Android and iOS before marking Phase DOD complete

---

## Branching and Release Standards

### Branch workflow
- All work happens on feature branches — never commit directly to `main`
- Branch naming: `phase1/feature-name` or `sprint1/feature-name`
- Merge to `main` via Pull Request only
- PR description must list which DOD items are being checked off
- Do not merge a PR with failing Playwright tests

### PR checklist (every PR)
- [ ] Vitest unit tests written and passing (`npm run test`)
- [ ] Playwright e2e tests passing on Chromium + WebKit (`pytest tests/e2e/`)
- [ ] No dead code or commented-out code
- [ ] `src/log.js` used for all logging — no bare `console.*` in app code
- [ ] DOD items addressed are noted in PR description

### Releases
- Tag `main` at the completion of each phase: `git tag v1.0`, `v2.0`, etc.
- Provides a clean rollback point before the next phase begins
- Update README.md and ROADMAP.md before tagging

---

## Logging

PWAs run in the browser — no stdout, no server. Use `app/log.js` for all logging.

### Pattern (`app/log.js`)
```javascript
const MAX_ENTRIES = 200;

const log = {
  info:  (msg, meta = {}) => _write('info',  msg, meta),
  warn:  (msg, meta = {}) => _write('warn',  msg, meta),
  error: (msg, meta = {}) => _write('error', msg, meta),
};

function _write(level, msg, meta) {
  console[level]?.(msg, meta);  // visible in DevTools during development

  // Persist to localStorage ring buffer (survives page reload)
  const entries = JSON.parse(localStorage.getItem('mtb_log') || '[]');
  entries.push({ level, msg, ...meta, ts: new Date().toISOString() });
  if (entries.length > MAX_ENTRIES) entries.splice(0, entries.length - MAX_ENTRIES);
  localStorage.setItem('mtb_log', JSON.stringify(entries));
}

export default log;
```

### Rules
- Import and use `log` from `app/log.js` everywhere — never use `console.*` directly in app code
- Log is included in JSON export so a coach can email it for field debugging
- Never log PII (athlete names should use IDs in log entries)
- Ring buffer — max 200 entries, oldest dropped first

### What to log
- App init: version, storage key counts
- Each user action: feature, athlete_id, skill, outcome
- Storage read/write errors with context
- Any caught exception: message + stack

---

## Debugging Tooling

### Desktop (development)
- **Chrome DevTools** — Application tab: localStorage, service worker, cache, manifest. Network tab: offline toggle. Console: all log output.

### Real Android
- **Chrome remote debugging** — plug in via USB, open `chrome://inspect` on desktop Chrome → full DevTools on the phone's live session

### Real iOS
- **Safari Web Inspector** — iPhone: Settings → Safari → Advanced → Web Inspector on. Mac: Safari → Develop → [your device]. Full DevTools on phone's Safari session.
- Requires a Mac for iOS remote debugging — no equivalent on Windows natively

### Service Worker (Phase 2c)
- Chrome DevTools → Application → Service Workers: register/unregister, force update, offline simulation
- `chrome://serviceworker-internals` for low-level state

### Playwright
- `page.on('console', ...)` — capture log output in tests
- `page.on('pageerror', ...)` — catch uncaught JS errors
- `--headed` flag to watch tests run in a real browser window
- `playwright show-trace` — timeline of every action, screenshot, network request

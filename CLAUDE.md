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
- `SPRINT_ARCHIVE.md` — completed sprint records with decisions and deferrals.
- `src/rubric.js` — rubric data as ES module; all views import from here
- `src/storage.js` — data access abstraction; swap this to change backend
- `src/log.js` — in-app logger; ring buffer to localStorage + console
- `src/ui.js` — pure visual helper functions (SVGs, level selector, trail readiness)
- `src/views.js` — HTML-string view functions; all return strings set to `#app.innerHTML`
- `src/main.js` — state machine, event delegation, draw()
- `app/schema.md` — data model documentation
- `vite.config.js` — Vite configuration
- `package.json` — npm scripts: `dev`, `build`, `test`, `test:e2e`, `test:all`
- `src/nav.js`         — history-aware nav stack; pushLayer / pushSheet / pop
- `src/components.css` — ship-ready CSS for tab bar, drill-in, sheet, attendance
**Documentation strategy:**
- All rubric content (`detail`, `failure_modes`, `when_breaks`) is bundled in `src/rubric.js` — fully offline, no network needed on trail
- Long-form supplemental docs (RUBRIC.md, changelog, release notes) live on GitHub Pages — linked from app Settings, not required for core use
- Video clips (Phase 1+) link to YouTube — acceptable network dependency since video requires connectivity anyway
- Never link to external docs for content a coach needs during a ride

---

## Navigation & flow system

The navigation, routing, and all view-transition code follows a three-tier model.
**Before touching any of it, read the spec:**

- `docs/NAV_FLOW_SPEC.md` — model, control map, motion CSS, `nav.js` skeleton, 7-step build order
- `src/components.css` — ready-to-ship CSS (tab bar, topbar, drill-in layer, sheet, attendance bar)

### The three tiers

| Tier | What | Renders into | Enter animation |
|---|---|---|---|
| **1 · Tabs** | Roster · Practice · Guide · Settings | `#app` | fade 180ms |
| **2 · Drill-in** | Rider / coach card | `#stack` via `nav.js pushLayer()` | slide from right 280ms |
| **3 · Sheet** | Rubric-from-card, all modals | `#scrim` + `#sheet` via `nav.js pushSheet()` | slide up 300ms |

### Hard rules

- `history.pushState` is managed exclusively by `src/nav.js` — never call it elsewhere
- The card topbar is always: `← back · context label · single ⋯ overflow` — no exceptions
- Rubric opened from a skill block → `pushSheet(() => viewRubric(s, { sheet: true }))`, opens at `s.rubricSkill`; the card stays mounted beneath
- Attendance is an in-place toggle on the roster (`s.taking_attendance`), not a separate view — enter it from the Practice tab
- Follow the 7-step implementation order in the spec; the app must stay runnable after each step

---

## Sprint 1e — Deferred UX (current branch: phase1/deferred-ux)

**Scope:** Single-click level recording, app QR sharing in Settings, About section. Fixes rider photo thumbnail display bug.

### Single-click level recording
- Tapping any level pill in the roster row expand panel immediately records an observation for that skill
- If the skill has no confirmed level yet, also auto-confirms at that level (first-observation shortcut)
- Flash toast confirms: "body position Lv 3 recorded"
- "Log Observation" / "Set Initial Levels" button removed from inline expand panel
- "Open full rider card →" button retained for history, trail readiness, and explicit confirm flow
- Full card view unchanged: draft → explicit "Update Confirmed" button

### Settings enhancements
- **QR code**: opens on Settings; QR encodes `https://ashaber.github.io/mtb-skills/` for easy app sharing to other devices
- **About section**: brief explanation of observe → confirm → trail ready flow; attribution to Tim Curry; offline note

### Bug fix: rider photo thumbnail
- `img.mono-photo` was invisible on roster due to `height:100%` not resolving in a `flex; align-items:center` button on iOS Safari
- Fix: added `overflow:hidden; padding:0` to `.mono-btn`; changed `.mono-photo` to explicit `50px×50px`
- `savePhoto` now catches `QuotaExceededError` and returns `false`; caller flashes "Photo too large"

---

## Sprint 1d — People & Practice Roster (merged: phase1/practice-roster)

**Scope (this PR):** Schema migration + roster filter + practice attendance.
**Deferred to next PR:** QR sharing, kill switch, swipe UX, single-click observation.

### Schema migration: Athlete → Person

Rename the concept from `Athlete` to `Person`. Storage key `mtb_athletes` preserved for backward compatibility.

**Person schema (v2):**
```json
{
  "id":       "uuid",
  "team_id":  "uuid",
  "name":     "string",
  "role":     "athlete | coach",
  "category": "5th | 6th | 7th | 8th | MS Advanced | Freshman | JV2 | JV1 | Varsity | null",
  "grade":    "integer | null",
  "level":    "integer | null"
}
```

- Athletes: `category` is the primary field (coach picks from dropdown). Grade is derived:
  - 5th→5, 6th→6, 7th→7, 8th→8, Freshman→9, JV2→10, JV1→11, Varsity→12, MS Advanced→null (7th or 8th, not defaulted)
- Coaches: `level` is NICA certification — 1 (sweep/front), 2 (full coach, can lead pod), 3 (can run a practice). `category` and `grade` are null.
- `getAthletes()` → `getPeople()`, optional `{ role }` filter
- `saveAthlete()` → `savePerson()`, defaults `role: 'athlete'`
- Export `schema_version` bumps 1 → 2; import shim maps v1 athletes with `role: 'athlete'`
- `coach_id` on Observation/ConfirmedLevel is the *device's assessing coach*, not a Person record — do not conflate

### Roster filter: All · Athletes · Coaches

- Filter chips at top of roster: All · Athletes · Coaches
- `s.roster_filter` persisted in localStorage
- "Add person" FAB defaults role based on active filter (Coaches filter → role=coach, Athletes → role=athlete, All → defaults athlete)
- Athlete rows show category (e.g. "JV1"); coach rows show NICA level (e.g. "L2")

### Practice roster & attendance

New `Practice` and `PracticeAttendance` entities stored in localStorage.

**Practice:**
```json
{ "id": "uuid", "team_id": "uuid", "coach_id": "uuid", "date": "YYYY-MM-DD" }
```

**PracticeAttendance:**
```json
{ "id": "uuid", "practice_id": "uuid", "person_id": "uuid", "status": "attending | absent", "ts": "ISO8601" }
```
### Additional small features
- Today's practice auto-created on app open (keyed by date — only one per day)
- **"Start Attendance" global button** enters attendance mode; tapping a person row toggles attending/absent
- Clicking "Start Attendance" again on same date resumes (supports late arrivals)
- After attendance session: attending riders sort to top, non-attending to bottom
- Can toggle back to absent (for mistakes or if rider is traded to different group)
- Coaches visible in the roster when filter is All or Coaches
- "Add person" during attendance mode → creates full Person record immediately (same flow as normal add)
- **Export attendance**: downloads JSON list of attending people (name, role, category/level) for the current practice date

**Assessment model (unchanged):**
- Raw observations are immutable append-only
- Confirmed level is separate — coach judgment, not auto-promoted
- Trail readiness computed client-side from confirmed levels + `TRAIL_MINIMUMS`

### Deferred to phase1/deferred-ux
- App sharing: QR code in Settings ✅ shipped
- About section in Settings ✅ shipped
- Single-click level recording ✅ shipped
- Swipe left to open full athlete card; swipe right to return to roster (deferred — complex gesture, deprioritized)
- Kill switch (dropped — no clear use case defined)

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
- Run with `npm run test:e2e` (uses `.venv/bin/pytest` — no pyenv activation needed)
- `.venv` at project root: Python 3.11.9, recreate with `tests/e2e/requirements.txt` + `playwright install chromium`
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
- Do not delete a branch until CI passes on `main` after the merge — the branch is the rollback point if CI catches a regression post-merge

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

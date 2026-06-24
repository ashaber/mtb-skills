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

## Conference Sprint — Feedback & Engagement (branch: phase1/conference-feedback)

**Goal:** Collect structured feedback and usage data at NICA national conference. Three deliverables: (1) About page additions + standalone `public/about.html`, (2) practice closing reflection flow, (3) feedback/engagement tracking activated by `?feedback=true` URL param.

**Source reference:** Port feedback/engagement from `https://github.com/HealthProf/mtb_skill_concept` — `prototype/feedback.jsx` and `setup/google-apps-script.js`. Logic is complete; rewrite from React JSX to vanilla JS DOM.

---

### Deliverable 1 — About page

**In-app About section** (Settings tab, already exists from Sprint 1e) gets these additions:
- "Learn more →" link that opens `public/about.html` in a new tab
- Contact CTA: "Want this for your whole team or league? Reach out — andrewshaber@gmail.com"

**In-app About section** copy (Settings tab — keep short, sell the concept):

```
MTB Skills Assessment

Ask a mountain bike coach the skill level of the riders in their group.
The answer is almost universally: "They're really fast." That's answering
the wrong question.

This rubric gives coaches a shared language for skill — three foundational
skills (body position, braking, cornering) across five levels defined by
what breaks, when it breaks, and at what threshold. Skills are not binary.
A rider corners at Level 1 seated and looking down; at Level 5 at speed on
black-plus terrain with near-zero failure. The rubric measures the full
progression.

This app puts the rubric to work at practice: log observations, confirm
levels when athletes demonstrate consistency, and know which trails each
rider is ready for. Works fully offline. No login required.

Rubric by Andrew Shaber, Renee Kline & Tim Curry.
Want this for your team or league? andrewshaber@gmail.com

Learn more →     [opens public/about.html in new tab]

© 2026 Andrew Shaber, Renee Kline & Tim Curry
```

**Extended about page (`public/about.html`):**
- Lives at `public/about.html` — Vite copies `public/` to `dist/` verbatim, no build change needed
- Served at `https://ashaber.github.io/mtb-skills/about.html`
- Editable on GitHub.com (pencil → commit → deploys in ~60s, no terminal needed) — suitable for live FAQ updates at conference from a phone
- Standalone `<style>` block — no dependency on app bundle or Vite
- Linked from in-app About section via `<a href="https://ashaber.github.io/mtb-skills/about.html" target="_blank">Learn more →</a>`

**Content sections and narrative brief for each:**

1. **Why this exists** — Origin story: Andrew Shaber, Renee Kline, and Tim Curry co-founded the Boise mountain bike team and kept encountering the same problem: ask a coach the skill level of their riders and the answer is almost universally "they're really fast." The consequence is real — a coach picks up an unfamiliar rider, assumes competence, and discovers the gap in the middle of a difficult trail. NICA's instructor training uses a 1–5 scale for individual skills with no objective measures behind the numbers. Measuring skills in isolation (especially in a parking lot at the start of the season) is not a strong indicator of trail readiness. This rubric is the attempt to fix that.

2. **What makes this rubric different** — Skill is not binary. The rubric measures the full progression within each skill. Cornering at Level 1: seated, steering with handlebars, eyes fixed on the ground ahead. Cornering at Level 5: speed, black-plus terrain with roots and rocks, full low/look/lean/counter/rotate/pressure control, failures rare and self-corrected. Three skills — body position, braking, cornering — across five levels defined by two parallel progressions: (a) environment and consistency (controlled → sometimes → most of the time → always → bombproof), and (b) skill accumulation (each level adds specific teaching points; the rubric describes what *breaks*, when it breaks, at what threshold). Body position is the foundation for both braking and cornering — skills build on each other.

3. **Motor learning alignment** — The progression reflects the Fitts and Posner stages of motor learning used in NICA coach training. Levels 1–2: cognitive stage — movements conscious and inconsistent. Level 3: associative — becoming reliable but degrading under pressure. Level 4: largely autonomous — foundational movements require no conscious attention, freeing the rider for terrain and tactics. Level 5: fully autonomous, applied on the most demanding terrain. Note on OTB curriculum: NICA's OTB 101/201/301 teaches the positive — what to do. This rubric is the complementary tool, describing failure modes, because error detection and correction requires knowing what breakdown looks like. Different purposes, same progression.

4. **Trail readiness** — Confirmed skill levels map to trail difficulty. The app shows which trails a rider is genuinely ready for — not which trails they've survived. That distinction matters when building a practice route or deciding if a rider is ready to move up.

5. **The app** — Brief: puts the rubric to work at practice. Log observations while you ride. Confirm a level when a rider demonstrates it consistently — not on one good rep. See trail readiness at a glance. Fully offline. No login.

6. **FAQ** — Stub with 2–3 starter questions; add more entries at conference via GitHub.com mobile edit (pencil icon → edit → commit).

7. **Team / league CTA** — "The assessment system is designed to scale — from a single ride pod to a full league. If you're interested in bringing structured skill assessment to your program, reach out: andrewshaber@gmail.com"

8. **Copyright** — `© 2026 Andrew Shaber, Renee Kline & Tim Curry` — no "All rights reserved" (don't discourage coaches sharing/printing the rubric; the notice establishes authorship and deters commercial misuse).

### Deliverable 4 - IDEA-013, IDEA-014
Implement these two ideas.

### Defects - D7
Resolve D7 defect list

---

### Deliverable 2 — Practice Reflection (complete - merged from Sprint 1f)

**Scope:** End-of-practice closing flow — reflection notes, mood rating, and incident log recorded against the practice record.

**Data model:** Three new optional fields on `Practice` entity:

```json
{
  "id":         "uuid",
  "team_id":    "uuid",
  "coach_id":   "uuid",
  "date":       "YYYY-MM-DD",
  "status":     "active | ended",
  "reflection": "string | null",
  "mood":       "1 | 2 | 3 | 4 | 5 | null",
  "incidents":  "string | null"
}
```

- `mood` scale: 1 = 😞 2 = 🙁 3 = 😐 4 = 🙂 5 = 😊 — stored as integer, rendered as emoji
- All three fields optional — closing reflection never blocks ending a practice
- Export includes all three; import shim sets to `null` if absent (backward compatible)

**UX:** "End Practice" on the Practice tab opens a Tier 3 sheet with:
1. **How was practice?** — 5-button mood selector, tap to select/deselect
2. **Reflection** — textarea, placeholder: "What went well? What would you change?"
3. **Issues or incidents** — textarea, placeholder: "Any incidents, injuries, or safety concerns to note"
4. **Save & close** — writes fields to practice record, sets `status: 'ended'`, dismisses sheet
5. **Skip** — ends practice without saving reflection (fields remain null)

Saved reflection viewable by tapping "View / edit reflection" on ended practice card.

---

### Deliverable 3 — Feedback & Engagement tracking

**Activation:**
```javascript
const FEEDBACK_MODE = new URLSearchParams(location.search).has('feedback');
```
All feedback UI initializes only when `FEEDBACK_MODE === true`. Normal app is completely unaffected.

**QR code in Settings:** The existing Settings QR (shipped Sprint 1e, uses `qrcode` npm package) adds a second QR labeled "Conference feedback mode" pointing to `https://ashaber.github.io/mtb-skills/?feedback=true`. No package change needed.

### New file: `src/feedback.js`

Self-contained ES module. Exports one function: `initFeedback()`. Called from `main.js` boot only when `FEEDBACK_MODE` is true.

**1. Engagement tracker** (port from `_eng` in feedback.jsx)
- `sessionId` = `'sess_' + Date.now()`
- `record(type, props)` — appends to in-memory event array, flushes at 15 events
- `flush()` — POSTs to Sheets or queues to localStorage if offline/URL not set
- Auto-flush: `setInterval(flush, 60000)` + `window.addEventListener('beforeunload', flush)`
- Offline queue: store as `mtb_pending_<timestamp>` localStorage keys
- Expose `window.MTB_TRACK = trackEvent` so `main.js` can call it for page views and actions

**2. Session start overlay** (shown once on first feedback-mode load per browser session)
- Fields: Name (optional), NICA League (optional), Team (optional), Role (Coach / Athlete — required)
- Persisted to `sessionStorage` — survives page reload within tab, cleared on tab close
- "Start exploring →" dismisses and shows app normally; button disabled until role selected

**3. Feedback button + modal** (port from FeedbackButton + FeedbackModal in feedback.jsx)
- Floating button: bottom-left, `💬 Feedback` label, z-index above all app chrome
- On click: capture screenshot via `html2canvas` (dynamic import — ~620KB lazy chunk, only loads on first modal open in feedback mode, zero impact on normal users), graceful fallback to blank canvas if it fails
- Modal contains:
  - Page label (current view, read from `window._mtbState.tab`)
  - Drawing canvas with pen + circle tools, color picker, undo, clear
  - Text comment input
  - Submit (disabled until comment or drawing present); Cancel with discard confirm if content exists
- On submit: POST to Sheets or queue if offline; show "✓ Feedback sent!", auto-close after 1.6s

**4. Page identity**
`main.js` sets `window._mtbState = s` after each `draw()` call. `feedback.js` reads `window._mtbState.tab` to label the current page at screenshot time.

`main.js` calls `window.MTB_TRACK?.('page_view', { page: s.tab })` after each `draw()` when `FEEDBACK_MODE` is true.

### Google Apps Script backend

Copy `setup/google-apps-script.js` from Tim's repo verbatim. Handles both `feedback` and `engagement` payload types, saves images to Drive, creates sheets on first run.

**Setup steps (one-time, in `setup/README.md`):**
1. Create Google Sheet → Extensions → Apps Script → paste script → set `SHEET_ID`
2. Deploy as web app (Execute as: Me, Access: Anyone)
3. Set URL as `window.MTB_SHEETS_URL` via `<script>` tag in `index.html` before conference (or `localStorage.setItem('mtb_sheets_url', '...')` in DevTools)

Sheet columns — Feedback: Timestamp, Date, Page, Role, User Name, NICA League, Team, Comment, Has Drawing, Drawing URL, Screenshot URL
Sheet columns — Engagement: Timestamp, Session ID, Session Start, Duration(s), User Name, NICA League, Team, Event Count, Events JSON

### Offline safety
- All Sheets POSTs use `fetch(...).catch(() => queue())` — never throws, never blocks
- **Feedback and engagement never block any app operation** — all async, all silent on failure

---

### Sprint DOD
- [ ] `public/about.html` created; Settings About section has "Learn more →" link and contact CTA
- [ ] `Practice` schema updated with `reflection`, `mood`, `incidents` fields
- [ ] `savePractice()` in `storage.js` handles partial update (merge, not overwrite)
- [ ] End Practice opens reflection sheet; Save & close writes fields + sets status ended; Skip ends without saving
- [ ] Reflection viewable/editable from ended practice card
- [ ] JSON export includes reflection fields; import backward-compatible
- [ ] `src/feedback.js` created; `initFeedback()` only called when `?feedback=true` present
- [ ] Normal app URL has zero feedback code loaded or executed
- [ ] Session overlay shown on first feedback-mode load; role (Coach/Athlete) required
- [ ] Floating `💬 Feedback` button visible on all views in feedback mode
- [ ] Screenshot captured (or graceful fallback), drawing canvas works (pen + circle)
- [ ] Submit posts to Sheets or queues offline — never blocks app
- [ ] Engagement events tracked: `page_view`, `add_person`, `log_obs`, `confirm_level`, `export`
- [ ] `setup/google-apps-script.js` copied; `setup/README.md` documents Sheets setup steps
- [ ] Settings shows second QR for `?feedback=true` URL
- [ ] Vitest: savePractice merge, mood range, export/import round-trip
- [ ] Playwright: reflection flow persists; feedback mode shows overlay; normal URL shows no feedback UI

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
- [ ] Playwright e2e tests passing on Chromium + WebKit (`npm run test:e2e` — runs all of `tests/e2e/`, same as CI)
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

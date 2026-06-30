# MTB Skills Assessment — Project Instructions

## App being built

A coach-facing skill assessment tool for NICA MTB coaches. See ROADMAP.md for phases.

**Tech stack:**
- **Frontend:** Vanilla JS (ES modules), Vite as build tool — no framework (no React/Vue)
- **Build:** `npm run build` → `dist/` → deployed as static files
- **Dev server:** `npm run dev` → localhost:5173 with hot reload
- **Backend (Phase 3):** Python FastAPI, Docker (python:3.12-slim), Cloud Run on GCP + Supabase
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
  backend/          ← Phase 3: Python FastAPI (not yet)
  .github/
    workflows/      ← CI/CD pipelines
  dist/             ← Vite build output (gitignored)
  index.html        ← Vite entry point at repo root
  vite.config.js
  package.json
```

**Deployment:**
- **Phase 1–2:** GitHub Pages — GitHub Actions builds `dist/` on push to `main`, deploys to Pages
- **Phase 2a:** Add `vite-plugin-pwa` for service worker + manifest generation (installable PWA, offline pre-cache)
- **Phase 3 frontend:** GCS bucket or Firebase Hosting — same `dist/` output, different deploy target in workflow
- **Phase 3 backend:** Docker image → GCP Artifact Registry → Cloud Run (serverless, scales to zero) + Supabase managed PostgreSQL
- Live URL: https://ashaber.github.io/mtb-skills/

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
- **Phase 2a (IDEA-018):** Move rubric text content to `public/rubric.json` (GitHub-editable without a build); `src/rubric.js` retains only structural constants (`SKILL_IDS`, `TRAIL_MINIMUMS`). Service worker pre-caches `rubric.json` so offline behavior is preserved. Fall back to bundled defaults if fetch fails.
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

## Phase 2 — PWA + Google Sheets Roster Import (branch: phase2/sheets)

**Goal:** Two independent deliverables, both client-side (no backend required).

- **2a — PWA:** ✅ Complete (PR #15, 2026-06-30). App installs to home screen; service worker pre-caches all assets and rubric content for reliable offline use. IDEA-018 (rubric JSON) shipped with 2a.
- **2b — Google Sheets roster import:** Head coach pastes a share link to their team Google Sheet; app fetches the roster CSV and merges it into local storage. No OAuth, no backend — works with any sheet set to "anyone with link can view."

---

### Deliverable 2b — Google Sheets roster import

**UX:** Settings tab → "Import roster from Google Sheet" section
1. Coach pastes a Google Sheets share URL into a text input
2. App extracts the sheet ID from the URL
3. App fetches `https://docs.google.com/spreadsheets/d/{id}/export?format=csv`
4. Parses CSV → athlete records; expected columns: Name (required), Role (athlete/coach, default: athlete), optional: Grade, Category
5. Merge strategy: match existing roster entries by name (case-insensitive); existing observations and confirmed levels are preserved; new names are added
6. Shows import summary: "12 athletes imported, 3 already existed, 1 skipped (missing name)"
7. Last-fetched roster cached in `localStorage` — import survives offline re-open

**No OAuth required:** Works with any sheet shared as "anyone with link can view." Coach sets this once on their Google Sheet.

**Error states:**
- URL not a Google Sheets link → inline error: "Paste a Google Sheets share link (sheets.google.com/...)"
- Sheet not public → fetch returns 401 → "This sheet isn't publicly shared. In Google Sheets: Share → Anyone with link → Viewer."
- CSV parse failure → "Couldn't read the sheet. Make sure row 1 has column headers and the sheet has a Name column."

**Column mapping:**
| CSV header (case-insensitive) | Field |
|---|---|
| Name, Athlete, Rider | `name` (required) |
| Role, Type | `role` ("athlete" / "coach") |
| Grade, Year | `meta.grade` |
| Category, Cat | `meta.category` |

**Test targets:**
- Import from a public sheet → athletes appear on roster
- Re-import same sheet → no duplicates; existing observations preserved
- Import with sheet set to private → user sees actionable error
- Offline after prior import → cached roster still present

---

### Phase 2 Definition of Done

**2a — complete:**
- [x] App installable from Chrome (Android) and Safari (iOS) — "Add to Home Screen" works
- [x] Service worker pre-caches all app assets and `public/rubric.json`
- [x] App loads fully offline after first install — no network calls on open
- [x] `public/rubric.json` contains all rubric text content; `src/rubric.js` has structural constants only
- [x] Wording edit in `rubric.json` on GitHub.com deploys without a build
- [x] Lighthouse PWA audit passes
- [x] Real-device test: Android install + offline; iOS install + offline
- [x] Playwright: offline load, install prompt (`tests/e2e/test_pwa.py`)

**2b — remaining:**
- [ ] Settings: Google Sheets URL input; import parses and merges roster
- [ ] Import shows summary (added / existing / skipped counts)
- [ ] Re-import preserves existing observations and confirmed levels
- [ ] Private sheet shows actionable error; malformed URL shows inline validation
- [ ] Vitest: CSV parser, merge logic
- [ ] Playwright: import flow, error states

### Current open defects on branch `phase2/sheets`

All items tracked in `DEFECTS.md`. Address opportunistically during Phase 2b:

1. **D22** — Scan hint: mention camera portrait/face-blur mode as possible blocker (`src/views.js:984`)
2. **D24** — Analytics: `page_view` fires on every `draw()` call — move tracking into `switchTab()` only
3. **D25** — Settings: show git commit hash alongside version to distinguish deployments
4. **D12** — Pinch-to-zoom on Guide page (deferred to IDEA-015 guide redesign)

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
- Branch naming: `phase2/feature-name`, `phase3/feature-name`, etc.
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

PWAs run in the browser — no stdout, no server. Use `src/log.js` for all logging. See file for implementation.

### Rules
- Import and use `log` from `src/log.js` everywhere — never use `console.*` directly in app code
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

### Service Worker (Phase 2a)
- Chrome DevTools → Application → Service Workers: register/unregister, force update, offline simulation
- `chrome://serviceworker-internals` for low-level state

### Playwright
- `page.on('console', ...)` — capture log output in tests
- `page.on('pageerror', ...)` — catch uncaught JS errors
- `--headed` flag to watch tests run in a real browser window
- `playwright show-trace` — timeline of every action, screenshot, network request

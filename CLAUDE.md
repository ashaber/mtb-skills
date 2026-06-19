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

**Documentation strategy:**
- All rubric content (`detail`, `failure_modes`, `when_breaks`) is bundled in `src/rubric.js` — fully offline, no network needed on trail
- Long-form supplemental docs (RUBRIC.md, changelog, release notes) live on GitHub Pages — linked from app Settings, not required for core use
- Video clips (Phase 1+) link to YouTube — acceptable network dependency since video requires connectivity anyway
- Never link to external docs for content a coach needs during a ride

---

## Current Sprint — Athlete Trading Card + Trail Readiness Matrix (Phase 1c)

**Branch:** `phase1/trading-and-readiness`
**Goal:** Let coaches hand off athletes to another riding group without paper. Surface which specific skill is blocking each trail tier.

**Deferred from Phase 1b:**
- Onboarding flow (first-launch welcome + coach name prompt)
- Bottom nav bar (persistent navigation between Roster / Rubric / Settings)

**Deferred to Phase 1d:**
- Athlete → Person schema migration (coaches as roster members)
- Practice roster / attendance
- Roster filter (All · Athletes · Coaches)

---

### 1. Athlete info fields (prerequisite for trading card)

Extend the athlete record with optional safety fields. These exist independently of trading — a coach may want them on the card view for reference during a ride — but they are the payload that makes a traded athlete card immediately safe to work with.

**Schema additions** (no migration needed — new optional fields on existing records):
```js
medical_notes:             string | null   // "Epi pen, insulin"
emergency_contact_name:    string | null
emergency_contact_phone:   string | null
```

**UX on athlete card:**
- Info section appears below Coach Notes when any field is set — no section shown if all blank
- Tap "Edit safety info" → modal with 3 fields + privacy note: *"Stored on this device only. Included in trading card and JSON export."*
- No icon in roster row — full card only (no clutter in compact view)

**Acceptance criteria:**
- [ ] Fields saved to localStorage on athlete record
- [ ] Info section visible on card only when at least one field is set
- [ ] Edit modal pre-fills current values, saves on confirm
- [ ] Fields survive reload and export/import round-trip
- [ ] Vitest: athlete record with/without info fields serializes and deserializes cleanly
- [ ] Playwright: add info, reload, verify fields present on card

---

### 2. Athlete trading card (QR export + import)

A coach taps "Share" on an athlete's card → QR code modal appears → another coach scans it on their device → athlete is added to their roster with confirmed skill levels and safety info already populated. No network. Works on trail.

**QR payload** (JSON, base64-encoded):
```json
{
  "v": 1,
  "name": "string",
  "grade": "integer | null",
  "medical_notes": "string | null",
  "emergency_contact_name": "string | null",
  "emergency_contact_phone": "string | null",
  "confirmed_levels": {
    "body_position": 1-5 | null,
    "braking": 1-5 | null,
    "cornering": 1-5 | null
  },
  "source_athlete_id": "uuid"
}
```

- No athlete photo — too large for QR
- No raw observations — receiving coach only needs confirmed state
- `source_athlete_id` enables merge detection on import (same athlete, different device)

**Export UX:**
- "Share card" button on athlete card → modal with QR code rendered inline (no external service)
- QR sized for phone-to-phone scan at arm's length (~260px, high error correction)
- Modal shows athlete name, skill levels, and safety info summary below QR so coach can visually verify before sharing
- Use `qrcode` npm package (pure JS, no server call, offline-safe) — or `qrcode-generator`

**Import UX:**
- "Scan card" button in roster header → camera opens via `getUserMedia`
- Parse QR → show preview card (name, levels, safety info) before committing
- Preview has two actions: **Add to roster** and **Cancel**
- `source_athlete_id` match → show merge prompt: "This athlete may already be on your roster as [name]. Add as new or update existing?" — never silently overwrite
- No `source_athlete_id` match → add directly as new athlete
- Use `jsQR` for camera decode (pure JS, offline-safe)

**Acceptance criteria:**
- [ ] "Share card" button on athlete card generates QR code modal
- [ ] QR payload includes name, grade, medical info, confirmed levels, source_athlete_id
- [ ] QR is scannable by another device (test phone-to-phone)
- [ ] "Scan card" button opens camera
- [ ] Scanned QR shows preview before adding to roster
- [ ] New athlete added with correct fields populated
- [ ] `source_athlete_id` UUID collision shows merge prompt, does not silently overwrite
- [ ] Entire flow works offline (no network calls)
- [ ] Vitest: QR payload encode/decode round-trip, merge detection logic
- [ ] Playwright: share modal opens with QR; import preview shown before add

---

### 3. Trail readiness matrix — bottleneck skill display

**Current state:** The trail-ready band shows 4 trail symbols (green/blue/black/double-black) at full opacity if the rider is ready, dimmed if not. A coach can see which trails a rider is ready for, but not *why* they're blocked from the next tier.

**Minimums (authoritative values in `TRAIL_MINIMUMS` in `rubric.js`):**

| Trail | BP | BRK | CRN |
|---|---|---|---|
| Green ● | 2 | 1 | 1 |
| Blue ■ | 2 | 2 | 2 |
| Black ◆ | 3 | 3 | 3 |
| Dbl Black ◆◆ | 5 | 4 | 5 |

**The problem:** A rider with BP:1, BRK:3, CRN:2 is blocked from green circle by Body Position alone — but the band just shows the green symbol dimmed. The coach has to cross-reference rubric minimums manually.

**Target behavior:** For each trail tier the rider is NOT yet ready for, show the specific skill(s) below minimum. Minimums are in `TRAIL_MINIMUMS` in `rubric.js`.

**Display spec for the trail-ready band (athlete card):**
```
TRAIL READY
🟢 ✓   🔵 BRK   ◆ BP · BRK   ◆◆ BP · BRK · CRN
```
- Ready tiers: trail symbol at full color, checkmark
- Blocked tiers: trail symbol dimmed, then abbreviated skill names in red for each skill below minimum
- Abbreviations: `BP` `BRK` `CRN`
- Only show skills that are actually below minimum for that tier — not all three

**Roster row (compact):** Keep the existing 4 trail symbols (opacity-based). The bottleneck detail only appears on the full athlete card where there's room. Do not add text to the compact roster row.

**`readyRowHTML()` in `src/ui.js`** needs a new variant or a `detail=true` flag for the expanded card view.

**Acceptance criteria:**
- [ ] Athlete card trail band shows blocked skill abbreviations per blocked tier
- [ ] Only skills below minimum for that specific tier are shown (not all failing skills)
- [ ] Ready tiers show ✓, no skill names
- [ ] Roster row trail marks unchanged (compact, no text)
- [ ] Display correct when rider has 0 confirmed levels (all tiers blocked, show all skills)
- [ ] Display correct when rider is ready for all tiers (all show ✓)
- [ ] Vitest: bottleneck computation for each trail tier across varied level combinations

---

### Sprint DOD
- [ ] Athlete info fields: save, display, edit, persist
- [ ] Trading card QR export: correct payload, renders in modal, scannable
- [ ] Trading card QR import: camera scan, preview, add to roster, merge prompt on UUID collision
- [ ] Trail readiness matrix: blocked skill names shown per tier on athlete card
- [ ] All flows work offline
- [ ] Vitest: QR round-trip, merge detection, bottleneck computation
- [ ] Playwright: info fields flow, share modal, import preview, trail readiness band
- [ ] No bare `console.*` — all logging via `src/log.js`
- [ ] PR description references DOD items

---

## Deferred — Phase 1d: People, Practice Roster

### Schema migration: Athlete → Person

Rename the concept from `Athlete` to `Person`. Storage key `mtb_athletes` preserved for backward compatibility.

```json
{
  "id":       "uuid",
  "team_id":  "uuid",
  "name":     "string",
  "role":     "athlete | coach",
  "grade":    "integer | null"
}
```

- `getAthletes()` → `getPeople()`, optional `{ role }` filter
- `saveAthlete()` → `savePerson()`, defaults `role: 'athlete'`
- Export `schema_version` bumps 1 → 2; import shim maps v1 athletes with `role: 'athlete'`
- `coach_id` on Observation/ConfirmedLevel is the *device's assessing coach*, not a Person record — do not conflate

### Roster filter: All · Athletes · Coaches

- `s.roster_filter` persisted in localStorage
- "Add person" FAB defaults role based on active filter

### Practice roster

New `Practice` and `PracticeAttendance` entities. Today's practice auto-created on open. Attending/absent toggle. Temp add for riders without a trading card. Coaches visible when filter includes coaches.

**Assessment model (unchanged):**
- Raw observations are immutable append-only
- Confirmed level is separate — coach judgment, not auto-promoted
- Trail readiness computed client-side from confirmed levels + `TRAIL_MINIMUMS`

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

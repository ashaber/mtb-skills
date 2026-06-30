# Sprint Archive — MTB Skills Assessment

Completed sprints, preserved for reference. Do not edit past entries.

---

## Phase 1a — Core App (merged as Phase 1)

**Merged:** 2026-06-04 (PR #2)
**Branch:** `phase-1-local-html-app`

Built the foundational single-page app: Vite + Vitest build pipeline, vanilla JS ES modules, localStorage persistence, athlete roster, session observation logging, skill level confirmation, trail readiness computed from confirmed levels, JSON export/import, Playwright e2e test suite, GitHub Actions CI/CD, deployment to GitHub Pages.

---

## Phase 1b — Design Update + Education Screen (Field Guide)

**Merged:** 2026-06-19 (PR #5)
**Branch:** `feature/education`

### What was built

**Design update (Claude Design, PR #5):**
- Full visual redesign: `src/ui.js` extracted as pure helper module, `src/views.js` extracted with all HTML view functions, `src/storage.js` extended with photo and team settings stubs
- Inline accordion on roster rows (expand to set levels without navigating to full card)
- Full rider card view replacing the old separate athlete/skill views
- Score chips per skill on roster rows
- Trail readiness row on roster cards

**Education screen / Field Guide:**
- `viewRubric()` with 4-tab layout: Body Position | Braking | Cornering | Guide
- Dimension table rows per level card (matching printed field card format) — replaced expand/collapse detail
- Guide tab: trail selection minimums, assessment rules, real example, score notation, reassessment cadence, coach notes (Fitts & Posner, calibration, common errors, interdependencies, 3 Key Essentials)
- `TRAIL_GUIDE` and `COACH_NOTES` exported from `src/rubric.js`
- `calibration_note`, `notes[]`, and `dimensions[]` added per skill in `src/rubric.js`
- Content sourced from `MTB_Field_Cards_v2.0.docx` and `MTB_Skills_Assessment_v2.0.docx`

**Athlete card redesign:**
- Two-column rubric row per skill: WHEN IT BREAKS | WHAT BREAKS — ANY OF:
- Shows only the selected level's content; level selector updates content in place
- Trail readiness moved to full-width band above skill assessment
- "Full rubric in Field Guide →" link pre-selects correct skill tab in field guide
- Trail difficulty marks removed from level selector buttons (numbers only)

**Test infrastructure:**
- `npm run test:e2e` — runs Playwright via `.venv` (Python 3.11.9), no pyenv activation needed
- `npm run test:all` — Vitest + Playwright in sequence
- `tests/e2e/requirements.txt` documents Python dependencies
- `expand_row` test helper made idempotent (auto-expand on add was toggling closed)

### What was deferred
- Onboarding flow (first-launch welcome + coach name prompt)
- Bottom nav bar (persistent navigation)
- `apple-mobile-web-app-capable` → `mobile-web-app-capable` meta tag fix

---

## Phase 1e — Deferred UX (merged: phase1/deferred-ux)

**Branch:** `phase1/deferred-ux`
**Verified:** Android Chrome (real device). iOS deferred — no test device available.

### What was built

**Single-click level recording:**
- Tapping any level pill in the roster row expand panel immediately records an observation for that skill
- If the skill has no confirmed level yet, auto-confirms at that level (first-observation shortcut)
- Flash toast confirms: "body position Lv 3 recorded"
- "Log Observation" / "Set Initial Levels" button removed from inline expand panel
- "Open full rider card →" retained for history, trail readiness, and explicit confirm flow
- Full card view unchanged: draft → explicit "Update Confirmed" button

**Settings enhancements:**
- QR code on Settings page encodes `https://ashaber.github.io/mtb-skills/` for easy app sharing to other devices
- About section: observe → confirm → trail ready flow explanation, Tim Curry attribution, offline note

**Bug fix: rider photo thumbnail (iOS Safari):**
- `img.mono-photo` was invisible on roster — `height:100%` did not resolve in a `flex; align-items:center` button on iOS Safari
- Fix: added `overflow:hidden; padding:0` to `.mono-btn`; changed `.mono-photo` to explicit `50px×50px`
- `savePhoto` now catches `QuotaExceededError` and returns `false`; caller flashes "Photo too large"

**Coach card fixes:**
- Multiple UX fixes to the coach view: edit modal, coach skill scoring, grade + category sync

### What was deferred
- iOS Safari real device verification (no test device)
- Swipe left to open full athlete card / swipe right to return to roster (complex gesture, deprioritized)

---

## Phase 1c — Athlete Trading Card + Trail Readiness Matrix (merged: phase1/trading-and-readiness)

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
- small <!> triangle with exclamation icon in roster row
- full card shows med detail in expand collapse at top of full card.

**Acceptance criteria:**
- [x] Fields saved to localStorage on athlete record
- [x] Info section visible on card only when at least one field is set
- [x] Edit modal pre-fills current values, saves on confirm
- [x] Fields survive reload and export/import round-trip
- [ ] Vitest: athlete record with/without info fields serializes and deserializes cleanly
- [x] Playwright: add info, reload, verify fields present on card
- [x] extra info icon on roster compact view 

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
- [x] "Share card" button on athlete card generates QR code modal
- [x] QR payload includes name, grade, medical info, confirmed levels, source_athlete_id
- [ ] QR is scannable by another device (test phone-to-phone)
- [x] "Scan card" button opens camera
- [x] Scanned QR shows preview before adding to roster
- [x] New athlete added with correct fields populated
- [x] `source_athlete_id` UUID collision shows merge prompt, does not silently overwrite
- [x] Entire flow works offline (no network calls)
- [x] Vitest: QR payload encode/decode round-trip, merge detection logic
- [x] Playwright: share modal opens with QR; import preview shown before add

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
- [x] Athlete card trail band shows blocked skill abbreviations per blocked tier
- [x] Only skills below minimum for that specific tier are shown (not all failing skills)
- [x] Ready tiers show ✓, no skill names
- [x] Roster row trail marks unchanged (compact, no text)
- [x] Display correct when rider has 0 confirmed levels (all tiers blocked, show all skills)
- [x] Display correct when rider is ready for all tiers (all show ✓)
- [x] Vitest: bottleneck computation for each trail tier across varied level combinations

---

### Sprint DOD
- [x] Athlete info fields: save, display, edit, persist
- [x] Trading card QR export: correct payload, renders in modal, scannable
- [ ] Trading card QR export: verified scannable phone-to-phone (requires real device)
- [x] Trading card QR import: camera scan, preview, add to roster, merge prompt on UUID collision
- [x] Trail readiness matrix: blocked skill names shown per tier on athlete card
- [x] All flows work offline
- [x] Vitest: QR round-trip, merge detection, bottleneck computation
- [x] Playwright: info fields flow, share modal, import preview, trail readiness band
- [x] No bare `console.*` — all logging via `src/log.js`
- [ ] PR description references DOD items

---

## Sprint 1d — People & Practice Roster

**Merged:** 2026-06-21 (PR #7)
**Branch:** `phase1/practice-roster`

Schema migration Athlete → Person (v2 schema, role field, backward-compat storage key). Roster filter chips (All · Athletes · Coaches). Practice and PracticeAttendance entities in localStorage. Attendance mode on roster (toggle per row, attending sorts to top, export JSON). Coach records with NICA level. Today's practice auto-created on open. "Start Attendance" global button.

**Deferred to 1e:** QR sharing, single-click observation, swipe gestures, kill switch (dropped).

---

## Sprint 1e — Deferred UX

**Merged:** 2026-06-22 (PR #8)
**Branch:** `phase1/deferred-ux`

Single-click level recording from roster inline expand (tap pill → immediate observation + auto-confirm if first). Settings QR code (encodes app URL). About section in Settings (observe → confirm → trail ready flow, Tim Curry attribution, offline note, contact CTA). Rider photo thumbnail bug fixed (iOS Safari height:100% issue). savePhoto QuotaExceededError handling.

**QR code shipped:** `qrcode` npm package, generates dataURL, rendered in Settings. URL updated to `?feedback=true` variant in Conference Sprint.

---

## Phase 2 — Three-Tier Navigation UX Rebuild + Defect Fixes

**Merged:** 2026-06-22 (PR #9 + PR #10)
**Branch:** `phase2/ux-rebuild` → `phase2/defect-fixes`

Three-tier nav system (Tabs → Drill-in layers → Sheets), `src/nav.js` pushLayer/pushSheet/pop, `src/components.css` ship-ready CSS, drill-in rider card, rubric sheet from card, all modals as sheets. Swipe right to pop drill-in layer.

Defect fixes (PR #10): removed FAB (D1/D2), stripped wrong buttons from roster header (D3), practice flow rebuilt as coach-initiated with explicit Start/End/Reopen states and practice history (D4), swipe right gesture implemented (D5). +Add rendered as btn-primary. Demo mode toggle (multiple practices per day). e2e test suite aligned with CI (`tests/e2e/` full run).

---

## Phase 2 — Conference Sprint: About Page, Feedback System, IDEA-013/014, D7–D16

**Merged:** 2026-06-24 (PR #13, PR #14)
**Branch:** `phase2/about-ideas-d7`

**Goal:** Ship the app for use at NICA national conference (June 2026). Collect structured feedback and usage data. Expand the about page. Implement IDEA-013 and IDEA-014. Resolve D7–D16 defect list.

**About page (`public/about.html`):**
Expanded with full step-by-step "Using the app" guide: first-time setup, logging observations, confirming levels, running a practice (Start → Attendance → Observe → End with reflection), sharing athlete cards via QR, exporting data. FAQ section with links. Settings tab: "Learn more →" link to about.html, contact CTA (andrewshaber@gmail.com).

**IDEA-013 — Full rider card level preview** *(complete)*
Tap a level number on the rider card to see its description without logging an observation. Level pill is a view control first, log-observation second.

**IDEA-014 — Feedback mode toggle in Settings** *(complete)*
Feedback mode moved from URL-param only (`?feedback=true`) to a toggleable setting in the Settings tab. Unintrusive — always available without a special URL.

**Defects resolved (D7–D16):**
- **D7:** Settings → about link added; screenshot scoped to active view on rubric/guide page (was capturing full page); swipe-down handle on rubric overlay fixed
- **D8:** Screenshot captured before modal DOM exists; drawing canvas DPI corrected; feedback modal footer `position:sticky` prevents overlap on Android
- **D9:** Drawing upload errors logged to Feedback sheet Error column; `_saveImageSafe()` returns `{url, error}` tuple instead of silently writing filename
- **D10:** Optional Email field added to feedback session overlay; Email column added to Feedback sheet
- **D11:** Rider card scroll position saved/restored around `innerHTML` assignment — level pill tap no longer jumps to top
- **D13:** Feedback overlay pre-filled from coach profile (`getCoach()`) on init — no double-entry for coaches who set up Settings
- **D14:** Rider card QR always visible inline below athlete name; regenerates after level confirmation; no tap required
- **D15:** Camera permission error includes browser-specific recovery guidance (lock icon → Camera → Allow)
- **D16:** Inline QR size increased from `width:120` to `width:200, margin:2`; CSS display 68→160px — scannable from normal hand distance

**Deferred:**
- **D12:** Pinch-to-zoom on Guide page — native browser zoom shifts tab bar off screen; scoping zoom to guide text only requires a custom pinch handler. Deferred to IDEA-015 (guide page redesign), which may address readability through layout and font size instead.

**Tests added:**
- `tests/e2e/test_ideas_d7.py` — D11 scroll restore, D16 QR size, IDEA-013 level preview, IDEA-014 feedback toggle
- `tests/unit/ui.test.js` — scoreChip rendering, level selector variants
- WebKit skip on swipe test (Touch constructor not available in WebKit `evaluate`)

**Ideas captured during sprint** (in IDEAS.md):
- IDEA-017: First-use onboarding — coach adds themselves on first open, eliminates Settings-first dependency
- IDEA-018: Separate rubric content from code (`public/rubric.json`) — GitHub-editable wording without a build
- IDEA-019: Localization/translation strategy — per-language JSON files as natural extension of IDEA-018

---

## Phase 2a — PWA: Service Worker, Manifest, Rubric JSON Separation

**Merged:** 2026-06-30 (PR #15)
**Branch:** `phase2/pwa`
**Version:** `0.2.2`

**Goal:** App installs to home screen and works reliably offline. Rubric content separated from code for GitHub-editable wording without a build (IDEA-018).

**PWA (`vite-plugin-pwa` + Workbox):**
- Web manifest: name, short_name, display:standalone, theme_color `#d94626`, icons 192×192 and 512×512 PNG
- SVG icon: burnt-orange rounded square, white mountain silhouette (`public/icon.svg` + generated PNGs via `scripts/gen-icons.js`)
- Service worker: pre-caches all JS/CSS bundles, `index.html`, `public/rubric.json`, `public/about.html`, icons; navigation fallback to cached `index.html`
- App installs to home screen on Android (Chrome) and iOS (Safari); verified on real device; loads fully offline after first install

**IDEA-018 — Rubric content/code separation:**
- All text content moved from `src/rubric.js` to `public/rubric.json` (descriptions, levels, failure modes, calibration notes, scoring rules, trail guide, coach notes)
- `src/rubric.js` retains only: `SKILL_IDS`, `TRAIL_MINIMUMS`, `TRAIL_LABELS`, `LV`, `trailReadiness()`
- Fallback bundled in `src/rubric-default.js` if fetch fails
- Service worker pre-caches `rubric.json` — offline safe from first install; GitHub pencil-edit → commit → auto-deploy (~60s), no build or terminal needed

**Defects fixed (D17–D23):**
- **D17a:** QR code generates at `160 × devicePixelRatio` px — readable on high-DPR screens
- **D17b:** Attendance highlight: `background: rgba(22,163,74,0.08)` on attending/present rows
- **D17c:** First-launch onboarding sheet — coach self-add on first open (name required, team optional)
- **D17d:** `allow_multi_practice` defaults to `true`
- **D17e:** Settings about section renamed "Feedback"; dismissible via `mtb_feedback_dismissed` localStorage flag
- **D17f:** `public/about.html` relative URL fix — no more hardcoded GitHub Pages hostname
- **D18:** Google Fonts `<link>` removed; system font stack applied — eliminates render-blocking and offline failure
- **D19:** In-app install prompt in Settings (Android: native dialog via `beforeinstallprompt`; iOS: Share sheet instructions)
- **D20:** App version wired from `package.json` via Vite `define(__APP_VERSION__)`; displays `v0.2.2` in Settings About
- **D21:** Scan button present on empty roster state
- **D23:** Expanded card scroll-into-view fix; practice date uses local timezone; attendee highlight clears when practice ends

**Tests added:**
- `tests/e2e/test_pwa.py` — SW registration, offline load, rubric JSON content, install prompt presence
- `tests/unit/rubric-content.test.js` — fetch + merge + fallback logic
- `tests/unit/storage.test.js` — multi-practice default, practice date
- Conftest: pre-seed coach profile before each test fixture to bypass onboarding sheet; WebKit plain-HTTP module-import error filtered in teardown

**Open defects carried forward to Phase 2b:**
- D12: Pinch-to-zoom on Guide page (deferred to IDEA-015 guide redesign)
- D22: Scan hint — mention camera portrait/face-blur mode as possible blocker
- D24: Analytics `page_view` fires on every `draw()` call, not just tab switches
- D25: Git commit hash alongside version in Settings

---
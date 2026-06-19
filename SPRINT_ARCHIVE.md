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

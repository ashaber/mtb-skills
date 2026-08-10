# Accessibility Audit — WCAG 2.2 Level AA (Section 508)

**Date:** 2026-08-09
**Branch:** `content/wcag-508-audit`
**Scope:** `src/views.js`, `src/ui.js`, `src/nav.js`, `src/main.js` (event handlers touched by fixes), `src/components.css`, `index.html`.
**Method:** manual read-through of every view function, every SVG/HTML helper, the nav stack, and the computed CSS custom properties, evaluated against WCAG 2.2 Level AA success criteria. Contrast ratios computed via the WCAG relative-luminance formula against the actual hex values in `index.html`'s `:root`, not estimated.

## Summary

| | Count |
|---|---|
| Findings fixed (code changes applied) | 21 |
| Findings flagged — need Andrew's decision, not applied | 6 |
| Explicitly out of scope (per task brief) | 1 (nav.js focus-trap/inert — see below) |

All 21 fixes are mechanical: missing ARIA attributes/states, missing accessible names, missing form-label associations, two CSS custom-property value changes for contrast, a handful of `min-height` touch-target bumps, a `<div>`→`<main>`/`<th>` tag swap, and a `<meta viewport>` change. No layout was restructured, no tier-1/2/3 navigation model changes were made, and `IDEAS.md` / `public/rubric.json` were not touched.

**Tests:** `npm run test` — 304/304 passing. `npm run test:e2e` — 295/296 passing, 1 pre-existing skip (unrelated to this work). Added `tests/e2e/test_accessibility.py` (22 new tests, both Chromium and WebKit) covering every fix that has DOM-observable behavior: `lang`, zoom-not-disabled, `<main>` landmark, close-button labels, toast live-region, and `aria-pressed`/`aria-expanded` state on every toggle-style control touched.

---

## Fixed findings

### Color contrast (1.4.3 Contrast Minimum, Level AA)

| # | SC | Severity | Location | Issue | Fix |
|---|---|---|---|---|---|
| 1 | 1.4.3 | High | `index.html` `:root { --dim }` | `#8d877a` on `--surface`/`--bg` = **3.57:1** (white) / 3.19:1 (bg) — below 4.5:1. `--dim` is used as real body/label text throughout (`.row-grade`, `.card-grade`, `.settings-about`, `.tl-date`, `.practice-meta`, `.medical-label`, `.contact-role`, etc.), not just decoratively. | Darkened to `#6b6558` — **5.79:1** on white, **5.17:1** on `--bg`. One CSS custom-property value change; no layout/structure change. Still clearly a lighter "secondary" gray relative to `--ink` (17.2:1). |
| 2 | 1.4.3 | High | `index.html` `:root { --accent }` | `#d94626` on `--bg` = 3.87:1, on white = 4.33:1 — below 4.5:1 for small bold text (`.hdr-kicker`, 10px/700) and for white button text (`.btn-primary`, 16px/700, which also needs 4.5:1 since it's under the ~18.66px-bold "large text" threshold). | Darkened to `#c33a1e` — **4.75:1** on `--bg`, **5.32:1** on white. Same hue family, one custom-property value change. |

### Missing/incorrect ARIA (4.1.2 Name, Role, Value)

| # | SC | Severity | Location | Issue | Fix |
|---|---|---|---|---|---|
| 3 | 4.1.2 | High | `src/views.js` — 11 instances (`modalAddPerson`, `modalEditPerson`, `modalSafetyInfo`, `modalReconcile`, `modalAssignGroup`, `modalShareCard`, `modalScanCard`, `modalReflection`, `modalOnboarding` n/a (no close btn), `modalImportPreview`, `modalRosterImport`, and the rubric sheet head) | Every sheet/modal close button is `<button data-m="close">✕</button>` — no accessible name; a screen reader announces "button" or reads the raw glyph. | Added `aria-label="Close"` to all 11 instances (mechanical string replace). |
| 4 | 4.1.2 | Medium | `src/views.js:143,148-150,728` (`viewRoster`, `viewEmpty`) | Roster/role filter chips and ride-group filter chips convey selected state only via a CSS class (`.filter-chip--active`); no programmatically-determinable state. | Added `aria-pressed="${active}"` to all filter-chip buttons. |
| 5 | 4.1.2 | Medium | `src/views.js` `modalAddPerson`/`modalEditPerson` — `.role-tab` (Athlete/Coach) and `.coach-lv-btn` (L1/L2/L3) | Same as above — toggle-selection buttons with only a visual `--active` class. | Added `aria-pressed`, synced on toggle in `src/main.js`'s `role-tab` and `coach-level-btn` click handlers. |
| 6 | 4.1.2 | Medium | `src/views.js` `modalReflection` — `.mood-btn` (😞🙁😐🙂😊) | Same pattern; additionally the emoji-only buttons had no text alternative at all. | Added `aria-pressed` (synced in `main.js`'s `mood-select` handler) and `aria-label` ("Bad"/"Rough"/"Okay"/"Good"/"Great"). |
| 7 | 4.1.2 | Medium | `src/ui.js` `levelSelectorHTML` (`.lv-seg`, used on both the roster-row accordion and the full rider card) | Same pattern for the 1–5 level selector. | Added `aria-pressed` + `aria-label="Level N"` per segment, and `role="group" aria-label="Level"` on the wrapper. State is derived from `draftLevel` at render time, so it stays correct through the app's existing full-re-render pattern — no extra JS state sync needed. |
| 8 | 4.1.2 | Medium | `src/views.js:654` (`viewCard`'s overflow "⋯" menu) | Trigger button had no `aria-haspopup`/`aria-expanded`; the menu `<div>` had no `role="menu"`, items had no `role="menuitem"`. | Added `aria-haspopup="menu" aria-expanded="false"` on the trigger, `role="menu"` on `#overflow-menu`, `role="menuitem"` on each item; `aria-expanded` is now toggled in `src/main.js`'s `toggle-overflow` handler and the outside-click-closes handler. |
| 9 | 4.1.3 (Status Messages) | High | `src/main.js` `flash()` (the toast) | Toast text (e.g. "Settings saved", "body position confirmed at Lv 3") is set via `textContent` with no live region — screen reader users get no announcement of these transient confirmations at all. | Added `role="status"` + `aria-live="polite"` when the toast element is created. |
| 10 | 1.3.1 | Medium | `src/views.js:919-926` (`rc-trail-mins` table, Field Guide → Trail Selection) | Header row had no `scope`; the first header cell was entirely empty (no text, no hidden label) — a screen reader in table-navigation mode announces blank/unassociated headers for every data cell. | Added `scope="col"` to all four `<th>`, a `.sr-only` "Trail" label in the empty corner cell, and changed the row-label `<td class="rc-trail-name">` to `<th scope="row">` (with a matching CSS selector update so padding/border aren't lost). |
| 11 | 1.1.1 / 4.1.2 | Medium | `src/ui.js` `readyRowHTML` / `readyRowDetailHTML` (trail-readiness marks, used on every roster row and rider card) | Only accessible name was the `title` attribute — unreliable on mobile screen readers (no hover state on a touch UI to trigger it), and the "detail" variant's only visible content for the ready state was a bare "✓" glyph. | Added `aria-label` mirroring/extending the `title` text (e.g. "Green ready", "Black: blocked by BP, BRK"); marked the inner decorative SVG/glyphs `aria-hidden="true"` so the label isn't announced twice. |
| 12 | 1.1.1 | Low | `src/ui.js` `trailMarkSVG`, `ICON_FAIL_DECREASE`, `ICON_TERRAIN_INCREASE`, `ICON_SKILL_INCREASE` | Decorative SVGs with no accessible name and no `aria-hidden` — in a couple of AT/browser combinations these get announced as an unlabeled "graphic". All are always rendered next to real text that already conveys the same information (trail label via the new `aria-label` above; progression icons sit next to "Adds"/"Fewer failures"/"Terrain" + the item text itself). | Added `aria-hidden="true" focusable="false"` to all four. |
| 13 | 1.1.1 | Low | `src/ui.js` `postureSVG` | Had `aria-label="Level N posture"` but no `role="img"`, and didn't say *which* skill. | Added `role="img"`; label now reads "Body position posture at level 3" etc. |
| 14 | 1.1.1 | Low | `src/ui.js` `trendSVG` (the sparkline on each skill block) | No accessible name at all; unlike the progression icons, the sparkline's actual shape (the historical up/down pattern) isn't fully restated in the adjacent text summary, so `aria-hidden` would have dropped real information. | Added `role="img"` + `aria-label="Observation trend, oldest to newest: 2 → 3 → 3 → 4"` (built from the same data already being plotted). |

### Missing form-label association (1.3.1 / 3.3.2)

| # | SC | Severity | Location | Issue | Fix |
|---|---|---|---|---|---|
| 15 | 1.3.1 | Medium | `src/views.js:1139` (`modalReconcile`, "Add as a new athlete" ride-group `<select>`, shown when a coach has >1 ride group) | `<select id="reconcile-add-group">` with no associated `<label>` — only a visual section heading `<span>` above it (not `for`-linked, and shared across a variable set of possible controls). | Added a visually-hidden `<label class="fl sr-only" for="reconcile-add-group">Ride group</label>` right before the select. |
| 16 | 1.3.1 | Medium | `src/views.js:1172` (`modalReconcile`, "Match to an existing athlete" `<select>`) | Same issue — no associated label. | Added `<label class="fl sr-only" for="reconcile-match-select">Choose an athlete to match</label>`. |

### Focus visibility (2.4.7 Focus Visible / 2.4.11 Focus Not Obscured)

| # | SC | Severity | Location | Issue | Fix |
|---|---|---|---|---|---|
| 17 | 2.4.7 | Medium | `index.html` (global) | No explicit `:focus-visible` styling anywhere except `.fi`/`.notes-area` (which swap to a border-color change). Everything else relies on the browser's default outline — which, for buttons inside `.row-card`, `.overflow-menu`, `.mono-btn`, etc. (all `overflow: hidden`), gets **visually clipped** at the rounded corners/edges since a default outline paints outside the border box. | Added a global `:focus-visible { outline: none; box-shadow: inset 0 0 0 3px var(--accent); }`. An inset box-shadow is always painted *inside* the element's own box, so it can never be clipped by an ancestor's `overflow: hidden`. `--accent` (now 5.3:1/4.75:1, see above) also clears the 3:1 non-text contrast minimum against `--surface`/`--bg`. Purely a focus-state rule — no effect on default appearance. |

### Touch target size (2.5.8 Target Size Minimum, new in WCAG 2.2)

| # | SC | Severity | Location | Issue | Fix |
|---|---|---|---|---|---|
| 18 | 2.5.8 | Low | `index.html` `.filter-chip` | Computed height ≈ 23px (11px font + 6+6px padding) — 1px under 24px. | `min-height: 24px; box-sizing: border-box`. |
| 19 | 2.5.8 | Low | `index.html` `.sb-prog-more`, `.sb-guide-link`, `.safety-edit-link`, `.rc-reference-link` | Each is a standalone block-level "→ more info" link-button with only top padding (or none) — computed heights 13–22px. | Added bottom padding + `min-height: 24px` to each. |
| 20 | 2.5.8 | Low | `src/components.css` `.local-only-badge` | ≈20px tall (10px font + 5+5px padding). | `min-height: 24px; box-sizing: border-box`. |
| 21 | 2.5.8 | Low | `src/views.js:542` (Settings → Feedback → "Don't show", inline-styled button) | ≈16px tall (`padding: 2px 0`). | Bumped inline style to `padding:6px 0; min-height:24px; box-sizing:border-box`. |

### Other

| # | SC | Severity | Location | Issue | Fix |
|---|---|---|---|---|---|
| 22 | 1.4.4 Resize Text | High | `index.html:5` | `<meta name="viewport" content="...user-scalable=no">` disables pinch-to-zoom outright — a direct, well-known WCAG 1.4.4 failure, and specifically relevant here (IDEA-016 already tracks that coaches without reading glasses need larger text; disabling zoom is the opposite direction). | Removed `user-scalable=no`. |
| 23 | 1.3.1 Landmarks | Medium | `index.html:445` | No `<main>` landmark — the only landmark region on the page was `<nav id="tabbar">`. A screen-reader user has no way to jump to primary content. | Changed `<div id="app">` to `<main id="app">`. Pure tag swap; `#app` is targeted by ID everywhere in CSS/JS, so this has zero visual/behavioral effect. |

---

## Flagged findings — need Andrew's decision, not applied

These all involve a judgment call beyond a mechanical fix, per the task brief, so I documented them here instead of changing code.

### F1. Drill-in layer / sheet: background content isn't inert, no focus trap or focus move (Severity: **High**)
**SC:** 2.4.3 Focus Order, 4.1.2 Name/Role/Value, 1.3.2 Meaningful Sequence.
**Where:** `src/nav.js` `_mountLayer`/`_mountSheet`/`_unmountLayer`/`_unmountSheet`.

When a rider card (tier 2) or a sheet (tier 3) opens, the content underneath is only visually covered (`transform: translateX(-18%)` for the app behind a layer; a layer stays fully in the DOM and tab order behind a sheet). Nothing marks the obscured content `inert` or `aria-hidden`, so a keyboard/screen-reader user can `Tab` into — and screen readers can browse into — controls that are invisible or fully covered. Focus also isn't moved into the newly-opened layer/sheet on open, or restored to the triggering element on close (Escape-to-close already exists and works, at `src/main.js:1205`).

I did **not** implement this because `src/nav.js` is explicitly governed by `docs/NAV_FLOW_SPEC.md` and the task brief calls the tier 1/2/3 model out of scope for restructuring — and this fix, however standard, is behavioral JS in exactly that file, not a static markup change. As a partial, purely-static mitigation I added `role="dialog" aria-modal="true"` to the static `#sheet` element in `index.html` (see fix #17-adjacent item above — this doesn't touch `nav.js`).

**Recommended fix** (for a follow-up, scoped PR against `nav.js`): a small `_syncInert()` helper called from `pushLayer`/`pushSheet`/`pop`/`clearStack` that sets/removes the `inert` attribute on `#app` (whenever a layer or sheet is open), `#stack` (whenever a sheet is on top of it), and `#tabbar` (whenever a sheet is topmost — sheets visually cover the tab bar per the existing z-index stack; layers don't). Pair with moving focus to the new layer/sheet root (`tabindex="-1"` + `.focus()`) on open and restoring `document.activeElement` on close. This is a well-established, testable pattern (Playwright can assert the `inert` attribute and `document.activeElement`) — I'm flagging it rather than guessing at the right owner-list of "what stays interactive while a layer is open" (e.g., is the tab bar *supposed* to stay tappable while a card is open, per its z-index sitting above the layer? That's a product decision, not a mechanical one).

### F2. ARIA tabs pattern is incomplete/inconsistent in two places (Severity: **Medium**)
**SC:** 4.1.2 Name, Role, Value (ARIA required-children / required-owner violations).
**Where:** `index.html:449` bottom tab bar (`<nav id="tabbar" role="tablist">`, children via `src/main.js:116` already have `role="tab" aria-selected`), and `src/views.js:775` (`.rubric-tabs` — `role="tablist"` wrapper whose `.rubric-tab` children have neither `role="tab"` nor `aria-selected`).

Two issues, and they cut in opposite directions:
- The bottom tab bar's children *do* have `role="tab"`/`aria-selected` correctly, but there's no `role="tabpanel"` content association and no roving-tabindex keyboard pattern, so it's an incomplete implementation of the ARIA Tabs pattern. It's also arguably the wrong pattern for a persistent bottom nav — using `role="tablist"` on a `<nav>` overrides that element's implicit "navigation" landmark role, so a screen-reader user loses landmark-based navigation to the one primary nav control the app has.
- The Field-Guide's `.rubric-tabs` claims `role="tablist"` but its `<button>` children have no `role="tab"` at all — an ARIA required-children violation (a `tablist` with no valid `tab` children).

I didn't touch either: extending the questionable pattern to the second instance isn't actually "safe" (it'd propagate an incomplete pattern rather than fix it), and reworking the first requires a product call — full ARIA Tabs pattern (add `tabpanel` roles + roving tabindex) vs. drop `role="tablist"`/`role="tab"` in favor of a plain `<nav>` landmark with `aria-current="page"` on the active tab (the more common pattern for bottom app nav, and it restores the landmark). Flagging for your call rather than picking one.

### F3. Level-color badges (score chips, timeline dots) fail text contrast for two of five levels (Severity: **Medium**)
**SC:** 1.4.3 Contrast Minimum.
**Where:** `src/ui.js` `LV` constant (`{1:'#dc2626', 2:'#ea580c', 3:'#2563eb', 4:'#16a34a', 5:'#7c3aed'}`), consumed by `scoreChip()` (`.score-chip`, 16px/700 white digit) and the observation-timeline dot (`.tl-lv`, 15px/700 white digit).

Computed contrast of white text against each level fill:

| Level | Color | Contrast (white text) | 4.5:1 (small text)? |
|---|---|---|---|
| 1 | `#dc2626` | 4.83:1 | ✅ |
| 2 | `#ea580c` | **3.56:1** | ❌ |
| 3 | `#2563eb` | 5.07:1 | ✅ |
| 4 | `#16a34a` | **3.30:1** | ❌ |
| 5 | `#7c3aed` | 5.70:1 | ✅ |

Levels 2 and 4 fail at the sizes used in `.score-chip`/`.tl-lv`. (The larger `.rc-badge` in the Field Guide, 22px/800, clears the "large text" 3:1 threshold at both 3.56 and 3.30, so that one instance is fine as-is.)

I didn't auto-fix this because (a) `LV` is a JS object literal in `src/ui.js`, not a CSS custom property — outside the category the task brief explicitly sanctioned for unattended contrast fixes — and (b) these five colors are a semantic system (coaches read "green = level 4" etc. across score chips, the trend sparkline, and rubric badges), so changing two of the five is a product/brand call, not a mechanical one. Options for your decision: darken L2/L4 specifically (e.g. `#c2410c` / `#15803d`, both clear 4.5:1), or keep the fills as-is and switch just the *digit* color to `--ink` for those two levels only, or add a thin dark stroke/text-shadow to the digit.

### F4. Card view / rubric sheet: heading hierarchy starts below `<h1>` (Severity: **Low**)
**SC:** 1.3.1 Info and Relationships / 2.4.6 Headings and Labels.
**Where:** `src/views.js` `viewCard()` (starts at `<h2 class="card-name">`, no `<h1>` in that DOM subtree) and `viewRubric(s, {sheet:true})` (the "FIELD GUIDE" sheet title is a styled `<div class="sheet-title">`, not a heading at all, followed directly by `<h2>`/`<h3>` content).

This is a consequence of the three-tier nav model: the rider card (tier 2) and sheet (tier 3) are rendered into separate containers (`#stack`, `#sheet`) *while `#app`'s own `<h1>` stays mounted underneath* — so the full-document heading order is technically intact (`<h1>Roster</h1>` → `<h2>Rider Name</h2>` → …), just split across sibling containers rather than living inside the visible "page." Whether that's sufficient, or whether each layer/sheet should carry its own `<h1>` (which would mean two `<h1>`s coexisting in the DOM while a card is open), is a call about the nav model's document structure — flagging rather than picking a side, especially since `docs/NAV_FLOW_SPEC.md` governs this territory.

### F5. QR scan modal: camera video feed has no text alternative (Severity: **Low, informational**)
**SC:** 1.1.1 Non-text Content.
**Where:** `src/views.js` `modalScanCard()` — `<video id="scan-video">`.

A live camera feed used for QR scanning inherently can't have meaningful alt text — this is a known, accepted limitation of camera-based scan UIs, not something fixable in markup. The modal already has an instructional `<p class="scan-hint">` explaining what to do, which is the right mitigation for this pattern. Noting it for completeness only; no action needed.

### F6. Mood-emoji preview line has no text fallback for the emoji itself (Severity: **Low**)
**SC:** 1.1.1 Non-text Content.
**Where:** `src/views.js` `_practiceCardToday()`'s `notesPreview` (mood emoji prepended to the reflection-text preview on the Practice tab) and the ended-practice `moodEmoji` line.

Unlike the fixed `modalReflection` mood buttons (finding #6 above, now labeled), these two spots render the raw mood emoji character inline with no accessible name of its own. Low impact — the surrounding text (reflection excerpt, "Practice complete · N attended") carries the actual information — but flagging since it's the same underlying pattern (5-mood emoji scale) fixed elsewhere in the same file. Left unfixed because injecting a text label into an inline preview string is a small content/wording call I'd rather you confirm (e.g. "🙂 (Good)" vs. an `aria-label`-only approach) than guess at silently.

---

## What was already good (no action needed)

- Every interactive control in the app is a real `<button>` (not a `<div onclick>`), so keyboard operability (Enter/Space activation, native focusability) is correct by default throughout `src/views.js`.
- Form `<label for>` / `<input id>` association is correct everywhere except the two `modalReconcile` selects fixed above (findings #15–16) — that's a strong baseline across ~25 form fields.
- `Escape` already closes the top of the nav stack (`src/main.js:1205`), and the scrim/grip both close the sheet on tap/swipe.
- `<details>`/`<summary>` (safety-info panel, "How to progress" expander) are native elements — inherently keyboard-operable and correctly announce expanded/collapsed state with no ARIA needed.
- `disabled` is always paired correctly with its visual `.btn-disabled` state (e.g. "Update Confirmed" on the rider card) — no fake-disabled buttons that are still clickable.
- All `<img>` tags already had reasonable `alt` text (athlete photos use the athlete's name, QR codes are labeled "Athlete/App QR code").

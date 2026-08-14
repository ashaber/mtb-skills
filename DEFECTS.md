# Phase 2 Defects — confirmed on mobile (2026-06-22)

Observed on live deploy after PR #9 merged. Fixing in branch `phase2/defect-fixes`.

---

## D1 — FAB "+Add" button hidden behind tab bar

**Status:** Fixed  
**Symptom:** The floating action button (FAB) at the bottom of the roster is mostly
obscured by the tab bar.  
**Root cause:** Copilot added a FAB to `viewRoster` that overlaps with the fixed tab
bar — no bottom clearance.  
**Fix:** Remove the FAB entirely. The spec (`docs/NAV_FLOW_SPEC.md`) places `+Add`
in the roster top-bar as a header action, not a FAB. The top-bar button was already
present and correct.

---

## D2 — "+ Add" button duplicated (top bar and FAB)

**Status:** Fixed (same change as D1 — removing FAB resolves both)  
**Symptom:** Two separate "+ Add" buttons appear: one in the roster header (`hdr-actions`)
and one as a floating action button at the bottom.  
**Root cause:** Same as D1 — Copilot added a redundant FAB.

---

## D3 — Roster top bar shows wrong buttons

**Status:** Fixed  
**Symptom:** Roster header shows `[scan QR] [book/settings icon] [+Add] [Start Attendance]`.  
**Expected per spec:** `[scan QR] [+Add]` only (see `docs/NAV_FLOW_SPEC.md`, "Where today's
controls move").  
**Root cause:** Copilot added `[open-settings]` (book icon) and `[start-attendance]` directly
to the roster header, duplicating controls that now live in their canonical tabs (Settings tab,
Practice tab).  
**Fix:** Remove book icon and Start Attendance from roster header. Settings is a first-class
tab. Start Attendance belongs on the Practice tab (already present there).

---

## D4 — Practice tab flow is unclear / wrong state shown

**Status:** Fixed  
**Symptom:** The Practice tab always shows "Start Attendance" even when a practice is already
in progress. The desired flow is:

```
Start Practice → Take Attendance → Run Practice (assess riders) → End Practice → Export
```

Coach should be able to move between Roster (for quick observations) and Practice tab
(for overall status) while a practice is running.

**Current behavior:**
- A `today_practice` record is auto-created on app open (one per day).
- "Start Attendance" switches the **Roster** view into attendance-check mode.
- Once attendance is taken, the Practice tab shows count + export button.
- No distinct "practice is running" vs "practice is over" state exists.

**Questions for Andrew:**
1. Should "Start Practice" be an explicit button (currently the practice auto-starts on app
   open — is that the right behavior or should it be coach-initiated)?
   Answer: coach initiated.  There is already a "start attendance", maybe it is just a navigation link?  Practices only happen 2 to 4 days per week, don't record a practice on non-practice days.
2. When attendance mode is active, should the Practice tab show a live attendance list
   with the toggle buttons (instead of routing the coach back to the Roster for toggling)?
   Answer: current behavior is correct.  More features will add to practice tab.  
3. What triggers "End Practice"? Is this just the export, or a separate explicit button
   that closes the practice session?
   Answer: should be an end practice.  Coach finalizes entering observations, records notes and reflections comments (roadmap feature)
4. Should historical practices (past days) be viewable in the Practice tab, or is it
   always just today?
   Answer: historical practices should be viewable.  (within reason for local app)
5. Does "Run Practice / note skills" mean the existing observation flow (tap level pill
   in roster row) is sufficient, or do you want a practice-scoped observation list?
   Answer: sufficient

---

## D5 — Swipe gestures not working

**Status:** Fixed  
**Symptom:** Swiping right on an open rider card does not return to roster. Swiping left
on an expanded roster row does not open the full card.  
**Root cause:** No touch event handlers exist in the codebase — this was listed as
"deferred" in sprint 1d/CLAUDE.md. Phase 2 built the layer/sheet infrastructure that
makes gestures possible but did not implement the gesture detection.  
**Fix:** Implement horizontal swipe detection on `document.body`:
- Swipe right (>60px, <40% vertical drift) while a drill-in layer is open → `pop()` +
  `draw()` (return to roster)
- Swipe left (>60px) on a `.row-body` while the row is NOT already expanded → same as
  tapping the row body (expand/open card). Deferred to next sprint — the "swipe left
  to open full card" is a secondary gesture with collision risk against horizontal scroll.
  The right-swipe back is higher value and lower risk; shipping that first.


## D6 — Conference sprint defects

**Status:** Fixed

- **QR:** Single QR only, points to `?feedback=true`. Removed plain app URL QR.
- **About text:** Reauthored to "Developed with Tim Curry for NICA MTB coaches. Works fully offline — no account required."
- **Attendance mode collapse:** All expanded roster rows collapse when entering attendance mode (`s.expandedId = null` on `start-attendance` and `start-new-practice`).
- **Practice tab clarity:** Active practice card now shows "● IN SESSION" badge; button is "Take Attendance" on first take, "Update Attendance" after. "Practice Notes" button lets coaches record reflection mid-practice without ending. Stale active practices from previous days are auto-ended on app boot.
- **Practice export:** Attendance export now includes `reflection`, `mood`, `incidents` fields. Renamed to `practice-report-{date}.json`.
- **Feedback UX:** No overlay on app load. Feedback button appears immediately. On first modal open, name/league/role fields are shown inline; role required to submit.
- **setup/README.md:** Added "Where to find feedback responses" section explaining the Google Sheet tabs and Drive folder.

## D7 conference feedback round 2

**Status:** Fixed (PR #13, 2026-06-24)
- missing link in settings -> about to the long form about page (defined in claude.md)
- screen shot for feedback on rubric page shows whole page.  Needs to be the in-focus screen page so user can see to draw on it.
- full rubric in field guide opens rubric overlay. It has a swipe away handle on top that doesn't function (swipe down should clear it).  


## D11 — Rider card scrolls to top when tapping a level pill

**Status:** Fixed
**Symptom:** On the full rider card, tapping a level pill to view detail causes the page to jump to the top. Expected behavior: scroll position stays fixed at the top of the visible screen; only the detail content below shifts as the selected level changes.
**Root cause:** Likely `draw()` is re-rendering the entire card via `innerHTML`, which resets scroll position to 0. Fix: either (a) update only the level detail section in-place without a full redraw, or (b) capture `scrollTop` before the redraw and restore it immediately after.
**Fix preference:** Option (b) is lower risk — save `el.scrollTop` before `innerHTML` assignment, restore after. Option (a) is cleaner long-term but requires the detail panel to be a stable DOM node updated independently of the card redraw.
**Also affects:** "Confirm level" button on the rider card triggers the same scroll-to-top behavior — same root cause, same fix.

---

## D16 — Athlete card QR code won't scan — likely scaled incorrectly

**Status:** Fixed
**Symptom:** QR code displayed on the full rider card cannot be scanned by another device.
**Likely cause:** QR rendered too small, or the SVG/canvas element is scaled down via CSS without the underlying QR module size being adjusted — resulting in modules too small to reliably scan, or aliasing artifacts that confuse scanners.
**Diagnosis:** The share modal QR (3-dot menu) scans correctly and is ~2× the size of the inline card QR. Same library, same content — pure size difference. The inline QR is too small to scan reliably.
**Fix:** Increased inline QR generation from `width:120` to `width:200, margin:2`, and CSS display size from 68×68px to 160×160px.

---

## D15 — Camera permission error message doesn't guide recovery

**Status:** Fixed
**Symptom:** When camera permission is blocked, app shows "Camera permission denied. Allow camera access and try again." — but the browser won't re-prompt automatically, so the user has no idea how to actually re-enable it.
**Fix:** Improve the error message to include browser-specific guidance: "Camera access is blocked. To re-enable: tap the lock icon in your browser's address bar → Camera → Allow, then try again."

---

## D14 — Rider card QR code hidden behind share button instead of always visible

**Status:** Fixed
**Symptom:** On the full rider card, the QR code is not visible by default — it appears behind or under a share button rather than being displayed inline.
**Expected:** QR code always visible on the rider card, positioned below the rider's name and to the right of their photo — no tap required to reveal it.
**Layout target:** Photo left, name above QR right — QR sized to fit that column without a button wrapper around it.
**Fix:** QR is now pre-generated on card open and rendered inline below the rider's name. Regenerates after level confirmation. Share card item in the ⋯ menu is preserved for the transfer-to-another-device flow.

---

## D9 — Drawing upload fails silently, saves filename instead of Drive URL

**Status:** Fixed
**Source:** Feedback sheet row 5 (2026-06-23T23:24, guide page, "Many words")
**Symptom:** Drawing URL column contains `drawing_1782257055283.png` — a local filename — instead of a Google Drive link. Screenshot URL on the same row uploaded successfully. Drawing data never reached Drive.
**Root cause:** The drawing upload path in `setup/google-apps-script.js` likely fails when the base64 payload is malformed or exceeds a size limit, and the fallback writes the intended filename rather than an empty/error value — making it look like it succeeded.
**Fix:** Added `_saveImageSafe()` that returns `{url, error}` tuple; drawing errors now logged in a new Error column in the Feedback sheet. Added Email column (D10) at the same time.

---

## D12 — Enhancement: enable pinch-to-zoom on Guide page

**Type:** Enhancement
**Source:** IDEA-016 — coaches on trail without reading glasses
**Request:** Allow pinch-to-zoom on the Guide page only. Current viewport meta tag likely has `user-scalable=no` which blocks native browser zoom across the entire app.
**Approach:** Check `index.html` viewport meta tag. If `user-scalable=no` is set, evaluate whether removing it breaks any fixed-position UI (tab bar, sheets, modals) on other pages. If zoom on other pages causes layout issues, scope the fix to the Guide page only via a JS workaround that temporarily re-enables zoom on Guide tab entry and disables it on exit.
**Acceptance:** Coach can pinch-zoom rubric text on the Guide page. Tab bar and other fixed elements remain stable.
**Status:** Deferred — native browser zoom moves nav/buttons off screen. Scoping zoom to guide text only requires a custom pinch handler or iframe, both non-trivial. Revisit with IDEA-015 guide page redesign which may address readability through layout and font size instead.

---

## D13 — Enhancement: pre-fill feedback overlay from coach profile

**Status:** Fixed
**Type:** Enhancement
**Source:** Pre-conference review
**Symptom:** Coach who has already set up their profile (name, team) in app Settings is asked the same questions again in the feedback session overlay — double entry.
**Fix:** On feedback overlay init, read coach profile from storage (`getCoach()`) and pre-fill Name and Team fields. League would still need manual entry as it's not a current profile field. Role defaults to Coach if a coach profile exists.
**Note:** Low priority — doesn't block conference use. Nice cleanup once D8 drawing/layout bugs are resolved.

---

## D10 — Enhancement: add optional email field to feedback session overlay

**Status:** Fixed
**Type:** Enhancement
**Source:** Pre-conference review
**Request:** Add an optional Email field to the session start overlay in `src/feedback.js`, after the Name field. Allows coaches who want a follow-up to leave contact info. Most will skip it — that's fine.
**Scope:** Session overlay UI + pass email through to Feedback sheet (new Email column after User Name). Engagement sheet does not need it.
**Note:** The partial-fix description in a prior revision was based on the deployed version. The local code uses named `getElementById` lookups (`fb-email` → email, `fb-league` → league, `fb-team` → team) — no positional indexing bug.

---

## D8 RC1 Conference Feedback

**Status:** Fixed
- **Screenshot includes modal:** Fixed — screenshot captured before modal DOM is created.
- **Drawing not full width / touch offset:** Fixed — canvas dpr approach applied.
- **Coordinates offset on Android:** Fixed.
- **Submit button overlap:** Fixed — footer moved inside the scroll div with `position:sticky; bottom:0`. Footer now sticks to the bottom of the visible scroll viewport regardless of content height or keyboard state. No longer relies on flex child layout which failed on some Android Chrome versions.

## D19 — Enhancement: in-app install prompt

**Status:** Open  
**Type:** Enhancement  
**Source:** Phase 2a device testing (2026-06-28)  
**Symptom:** No visible install affordance in the app. Coaches must discover "Add to Home Screen" via the browser's three-dot menu — non-obvious, especially on iOS where it's buried in the Share sheet.  
**Fix:** Add "Install App" button in Settings tab, near the share QR code.  
- **Android/Chrome:** listen for `beforeinstallprompt` event; suppress browser mini-infobar; show "Install App" button that calls `deferredPrompt.prompt()`. Hide button after install or if event never fires (already installed).  
- **iOS/Safari:** no API available. Show collapsible instruction block: "Tap **Share** → **Add to Home Screen**." Detect iOS via `navigator.userAgent` to show the right variant.  
**Acceptance:** Coach on Android can tap "Install App" in Settings and gets the native install dialog. Coach on iOS sees clear instructions next to the share QR.

---

## D17 - enhancements and defects from PWA phase 2a build

**Status:** Fixed (commit a9a525f, 2026-06-28)

### D17a — QR code on full rider card is corrupt on high-DPR devices

**Symptom:** Inline QR on the full athlete card renders corrupted/unreadable on real devices.  
**Root cause:** QR generated at `width: 200` canvas px (`main.js:135`) but displayed at `160×160px` CSS (`index.html:130`, `.card-hero-qr`). On a 3× DPR device the browser needs 480 physical pixels but upscales a 200px source 2.4×, causing blurry/corrupt QR cells.  
**Fix:** In `_generateCardQR()` in `main.js`, generate at display size × DPR: `width: Math.round(160 * Math.min(window.devicePixelRatio || 1, 3))`. CSS display stays `160×160px`.  
**Fallback:** If DPR-aware approach still doesn't scan, remove the inline QR and replace with a "Share / Trade" button that opens the existing `modalShareCard` — that QR already works. Keep `⋯` menu share item as-is.

### D17b — Attendance highlight not visible enough

**Symptom:** Attending riders barely distinguishable from absent in roster view.  
**Current CSS:**  
- Normal view attending: `.row-card--attending { border-color: rgba(22,163,74,0.3) }` in `index.html:325` — 30% green tint only  
- Attendance-mode present: `.row-card--present { box-shadow: inset 3px 0 0 var(--l4) }` in `components.css` — 3px left accent  
**Fix:** Add background tint to both:  
- `.row-card--attending`: add `background: rgba(22,163,74,0.08)`  
- `.row-card--present`: increase to `box-shadow: inset 4px 0 0 #16a34a` and add `background: rgba(22,163,74,0.08)`

### D17c — Blank starting page: coach self-add on first launch

**See IDEA-017 in IDEAS.md for full spec.** Trigger: `getCoach()` returns null AND `getPeople().length === 0`. Show onboarding sheet (name required, team optional). On submit: create coach profile + add coach as Coach roster entry. Never shown again after first setup.

### D17d — Default "Allow multiple practices" to enabled

**Symptom:** Setting `allow_multi_practice` defaults to false; coaches shouldn't need to change this.  
**Fix:** In `getTeamSettings()` in `storage.js`, change the destructuring default from `false` to `true`: `const { allow_multi_practice: multiPrac = true } = getTeamSettings()`.

### D17e — About page: remove "conference" label, make dismissible

**Symptom:** About section in Settings is labeled "conference" which is context-specific. Should be generic feedback. Should have a way to remove/dismiss it.  
**Fix:** Rename label in `views.js` Settings view from "conference" to "Feedback". Add a dismiss option (small "×" or "Don't show again" link) that sets a localStorage flag; once dismissed, the section hides. Flag key: `mtb_feedback_dismissed`.

### D17f — Long about page hard-coded to GitHub Pages URL

**Symptom:** `public/about.html` links back to `ashaber.github.io/mtb-skills` — breaks when accessed from Vercel preview or any non-GH-Pages deploy.  
**Fix:** In `about.html`, replace the hardcoded URL with a relative link (`./` or `index.html`) so it resolves correctly from any host.

---

## D18 — Google Fonts render-blocking + offline failure

**Status:** Fixed (commit a9a525f, 2026-06-28)  
**Type:** Defect — offline reliability + performance  
**Source:** Lighthouse PWA audit (2026-06-28), phase2/pwa Vercel preview  
**Symptom:** `index.html` loads `fonts.googleapis.com/css2?family=Barlow...` as a synchronous `<link>` stylesheet. Lighthouse reports 833ms render-blocking delay. On airplane mode, the font CDN is unreachable — app falls back to the browser default font, visual appearance breaks.  
**Impact:** Directly violates Phase 2a offline DOD: "App loads fully offline after first install — no network calls on open."  
**Fix:** Remove the Google Fonts `<link>` from `index.html`. Update CSS `font-family` declarations to the system font stack: `-apple-system, 'Segoe UI', Helvetica, Arial, sans-serif`. System fonts are pre-loaded on every target device — zero network calls, zero render-blocking, identical perceived quality on Android and iOS.  
**Related:** D12 (pinch-to-zoom) — both are viewport/font readability issues on the Guide page. When D12 is revisited with IDEA-015, evaluate font size at the same time.  
**Acceptance:** Lighthouse render-blocking resources audit: no external font entries. Airplane mode after install: app opens with correct typography, no fallback font visible.


## D21 — Scan button absent on empty roster

**Status:** Fixed  
**Type:** Defect  
**Source:** Coach feedback, 2026-06-25 — "Scan doesn't show if roster is empty"  
**Symptom:** When the roster has no entries, the app renders `viewEmpty()` instead of `viewRoster()`. The scan QR button lives in the roster header and is therefore not present on the empty state view. A coach receiving a trading card from another coach would start with an empty roster — they need scan to work *before* adding anyone.  
**Fix:** Add a scan button to `viewEmpty()` in `src/views.js`, or ensure the empty state view includes the same roster header with the scan action. The scan action is `data-a="open-scan"` on the roster topbar.  
**Acceptance:** Coach with empty roster can tap Scan and import a trading card from another device.

---

## D22 — Scan hint: mention camera mode as a possible blocker

**Status:** Fixed  
**Type:** Minor enhancement  
**Source:** Coach feedback, 2026-06-28 — "figured out camera was configured to blur anything that is not my face which is why it wouldn't scan QR code"  
**Symptom:** The scan modal hint says "Point camera at a QR code from another coach's device." If the camera is in portrait/face-blur mode (common Samsung default), the QR code is blurred out and won't scan. Coach has no idea why.  
**Fix:** Updated `views.js:1273` hint text to: "Point camera at a QR code from another coach's device. If scan isn't working, check that your camera app isn't set to portrait or face-blur mode."  
**File:** `src/views.js:984`, `.scan-hint` element.

---

## D20 — App version visible in Settings

**Status:** Fixed  
**Type:** Enhancement  
**Source:** Device testing (2026-06-28) — installed PWA has no way to confirm which build is running

### Versioning scheme

Format: `major.minor.patch`

| Segment | Meaning | When to increment |
|---|---|---|
| **major** | Product generation | 0 = pre-backend (Phases 1–2); 1 = Phase 3 backend launch |
| **minor** | Phase | Phase 1 → 0.1.x; Phase 2 → 0.2.x; Phase 3 → 1.0.x |
| **patch** | Build/defect iteration within phase | Each defect PR or sprint build |

Approximate version history:
- `0.1.0` — Phase 1 complete (local HTML app)
- `0.2.0` — Phase 2 initial build (conference sprint)
- `0.2.1` — Phase 2 defect fixes (PR #13)
- `0.2.2` — Phase 2a PWA build (current branch)
- `1.0.0` — Phase 3 launch (Supabase backend)

### Implementation

**Step 1 — Wire version from `package.json` into the build:**  
In `vite.config.js`, add to `defineConfig`:
```js
define: {
  __APP_VERSION__: JSON.stringify(process.env.npm_package_version),
}
```
Vite replaces `__APP_VERSION__` at build time with the `version` field from `package.json`.

**Step 2 — Update `package.json` version** to `0.2.2` (current PWA build).

**Step 3 — Display in Settings view:**  
In `src/views.js` Settings section, add version string near the bottom of the About section:
```html
<p class="settings-about" style="color:var(--dim);font-size:11px">v${__APP_VERSION__}</p>
```

**Step 4 — Bump patch version on each defect PR** going forward. Minor version bumps on phase completion.

### Acceptance
- Settings page shows `v0.2.2` (or current version)
- After a new build is deployed and the installed PWA updates, the version number changes — coach can verify they're on the latest without needing DevTools

## D25 — Settings: show git commit hash alongside version to distinguish deployments

**Status:** Fixed — doc was stale, not re-checked when the fix landed.
`src/views.js` renders `v${__APP_VERSION__} · ${__GIT_SHA__} · ${envLabel(BACKEND_URL)}`; `vite.config.js` defines `__GIT_SHA__` from CI's `GIT_SHA` env var (falls back to `'dev'` locally).

---

## D24 — Analytics: `page_view` fires on every `draw()` call, not just tab switches

**Status:** Fixed — doc was stale, not re-checked when the fix landed.
`src/main.js`'s `switchTab()` (the sole function that changes `s.tab`) fires `MTB_TRACK('page_view', ...)`; `draw()` no longer tracks page views on every redraw.

---

## D23 — Roster: expanded card visibility, practice date, attendee highlight

**Status:** Fixed

- **Expanded card scrolls into view** — after toggle-expand and draft-level, `scrollIntoView({ block: 'nearest' })` fires in the next animation frame, overriding the draw() scroll-to-top before paint.
- **Practice date was UTC** — `today()` in both `main.js` and `storage.js` now uses local date methods (`getFullYear/Month/Date`) instead of `toISOString().slice(0,10)`. Same fix applied to `viewPractice` in `views.js`.
- **Attendee highlight clears after practice ends** — `attendingIds` set in `viewRoster` is now empty when `practice.status === 'ended'`.

---

## D26 — Multi-team coach: no way to view one team at a time

**Status:** Fixed
**Type:** Defect (data isolation)
**Source:** Backend design review of `backend/app/identity.py` — `MultiplePersonasError` was defined but never raised; real prod data confirmed the case is live (`andrew@idahomtb.org`: 1 `coach` persona on an Idaho team + 3 `team_director` personas on 3 Oregon teams).
**Symptom:** `person` is per-team, so a coach with duties on more than one team (a traveling Team Director, or one head coach running several schools' programs) gets one `person` row per team, all linked to the same Supabase auth user via `auth_person`. `GET /api/me` returned the full persona list unfiltered; `GET /api/roster` and the observations/confirmed-levels/practices/attendance GET endpoints ran with **no `team_id` filter in the SQL at all** — Postgres RLS alone decided which rows came back, and RLS ORs together every team the caller has any persona on. A multi-persona coach's roster view silently showed every reachable team's people **merged into one flat list**, with no way to tell who was on which team and no way to view one team at a time. `src/main.js` compounded this by silently picking one "primary" persona (`head_coach`/`team_director`, else `personas[0]`) for `getCoach()`/`saveCoach()`, discarding the rest.
**Root cause:** No client- or server-side team scoping was ever built for the `personas.length > 1` case — the pilot's one-team-per-coach assumption held in practice until real usage (the Idaho/Oregon example above) broke it.
**Fix:**
- **Backend** (`backend/app/routes.py`): `GET /api/me` now includes `team_name` per persona (a lookup against `team`, RLS-scoped). `GET /api/roster`, `/api/observations`, `/api/confirmed-levels`, `/api/practices`, `/api/attendance` gain an optional `team_id` query param, validated against the caller's OWN persona team_ids only (`_resolve_scope_team_id` — mirrors `import_roster`'s existing "which of the caller's own teams" check); a team_id outside that allowlist 403s. Omitted, behavior is byte-for-byte unchanged (single-persona callers see no difference at all).
- **Frontend** (`src/sync.js`, `src/main.js`, `src/views.js`, `src/storage.js`, `src/reconcile.js`): `syncNow()` resolves identity FIRST — a single persona auto-selects (no behavior change); a caller with >1 persona and no prior selection short-circuits (`needsTeamSelection`, pulls nothing, never merges) until the coach picks one via a Tier-3 sheet (`modalTeamSwitcher`, `docs/NAV_FLOW_SPEC.md`'s existing sheet pattern). The choice persists in `localStorage` (`getActivePersonaId`/`saveActivePersonaId`) and scopes every subsequent pull via `?team_id=`. Settings gains a "Switch team" row (only ever shown for >1 cached persona) to re-open the picker later; switching teams clears cached roster/observations/practices/attendance first (`clearLocalRosterData`) so the previous team's records don't linger merged in with the newly-selected one.
**Acceptance:** Single-persona coach: no picker, no UI change, `GET /api/roster` etc. called with no `team_id` param, exactly as before. Multi-persona coach: picker appears before any roster renders; selecting a team scopes roster/observations/confirmed-levels/practices/attendance to that team only; Settings shows the active team + a "Switch team" control; switching teams re-scopes cleanly with no cross-team leakage.
---

## D27 — Rider card: remove inline QR, keep Share card in ⋯ menu

**Status:** Fixed
**Source:** Andrew, 2026-08-10 — with Phase 3 backend/sync in place, device-to-device QR trading (the reason D14 added the always-visible inline QR) is no longer the primary path; the inline QR was cluttering the card for a feature that will see little use going forward.
**Fix:** Removed the inline `card-hero-qr` image from `viewCard` (`src/views.js`) and its supporting generator (`_generateCardQR`, `s.cardQR` state) from `src/main.js`. "Share card" in the card's ⋯ overflow menu is unchanged — it generates its own QR on demand via `modalShareCard`, same as before.
**Supersedes:** D14 (added the always-visible inline QR), D16/D17a (fixed its scan reliability/corruption) — those fixes are moot now that the inline QR is gone; left in place above as history, not reverted.

---

## D28 — Field Guide "Full written reference" link opens raw Markdown, not rendered HTML

**Status:** Open
**Source:** Andrew, 2026-08-10 — reported as "FAQ page is rendering as raw MD rather than rendered html (settings -> learn more)."
**Symptom:** The actual Settings → "Learn more" link goes to `about.html`, which renders correctly (hand-authored HTML, real FAQ section). The bug is one level deeper: the Field Guide's "Full written reference →" link (`src/views.js`) opens `public/rubric-reference.md` directly (`target="_blank"`) — the browser displays it as plain text since the app has no Markdown-rendering dependency anywhere (`package.json` has none).
**Compounding issue:** `public/rubric-reference.md` is still a literal placeholder ("PLACEHOLDER — to be filled in from the source document") — the content itself isn't finished yet either.
**Fix:** Convert `rubric-reference.md` to a hand-authored `rubric-reference.html`, matching the existing `about.html` pattern (still GitHub-editable without a build, no new dependency). Update the link in `src/views.js`. Content authoring (filling the placeholder from Tim's source doc) is separate, non-code work.

---

## D29 — `syncNow()`'s `Promise.all` discards all successfully-pulled data if any one endpoint fails

**Status:** Open (real, but NOT the cause of the team-switcher report below — see D30 for the actual bug)
**Source:** Found while investigating Andrew's "can't select team" report, 2026-08-14 — an initial hypothesis (prod's then-missing `practice`/`attendance` tables causing the switcher's post-select `runSync()` to fail) that turned out not to be the actual cause, but is a real, separate resilience gap worth keeping.
**Detail:** `src/sync.js`'s `syncNow()` fetches roster/observations/confirmed-levels/practices/attendance via a single `Promise.all([...])` (`src/sync.js:156-162`) — `Promise.all` is all-or-nothing, so ANY one endpoint failing (a future migration gap, a transient 500, etc.) throws away roster/observations/confirmed-levels that had already succeeded in the same pull, rather than degrading gracefully.
**Fix (not yet built):** swap the pull's `Promise.all` for `Promise.allSettled`, save whatever DID succeed, and only report the ones that failed in `result.error`.

---

## D30 — Team switcher "Switch" button silently no-ops: `saveCachedIdentity` referenced but never imported in `main.js`

**Status:** Fixed
**Source:** Andrew, 2026-08-14 — "attempted to switch andrew@idahomtb.org to centennial team. button click doesn't work and can't select the team," reproduced via in-app feedback ("selected team, clicked button. dialog remained visible and when closed, shows no team selected") and confirmed via browser console screenshot: `Uncaught (in promise) ReferenceError: saveCachedIdentity is not defined`.
**Root cause:** `selectPersona()` (`src/main.js`) calls `saveCachedIdentity(personas)` — a real, exported function in `src/storage.js` — but `src/main.js`'s import block never imports it (only `getCachedIdentity` was imported, not its `save` counterpart). The `ReferenceError` threw synchronously mid-function, AFTER `clearLocalRosterData()` had already wiped the cached identity/active-persona keys (the D26 "switching teams" branch) but BEFORE `saveActivePersonaId()` could run to restore them and BEFORE `closeModal()`/`flash()` — exactly matching both symptoms: the sheet never closed (the crash skipped `closeModal()`), and once manually closed, Settings showed "No team selected yet" (the wipe completed, the restore never did).
**Why existing tests didn't catch it:** no unit or e2e test exercises `selectPersona()`'s actual button-click path end to end — the e2e team-switcher suite (`tests/e2e/test_team_switcher.py`) only covers UI-visibility cases (signed out, stale cached identity) since the real switch flow needs a live authenticated multi-persona backend session, out of scope for the current (unauthenticated, local-storage-only) e2e harness. This project also has no ESLint configured, which would have caught an undefined-reference at lint/build time regardless of test coverage — worth a future IDEA.
**Fix:** added `saveCachedIdentity` to `src/main.js`'s import from `src/storage.js`. One-line fix, `npm run build` + full Vitest suite both clean.
**Related, fixed alongside:** `resolve_personas()` (`backend/app/identity.py`) ordered personas by `p.name` with no tiebreaker — with all 4 of Andrew's rows literally named "Andrew Shaber," Postgres doesn't guarantee stable ordering between calls. Added `p.id` as a secondary sort key. Not the cause of this bug, but a related correctness fix found during the same investigation.

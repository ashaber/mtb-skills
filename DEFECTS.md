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
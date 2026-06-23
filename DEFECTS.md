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
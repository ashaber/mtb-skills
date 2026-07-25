# Manual Test Plan — MTB Skills Assessment

Covers what automated tests (Vitest + Playwright) cannot: real-device install, camera, service worker behavior, and content deploy roundtrips.

**Automated tests run first.** Only run this plan after `npm run test:all` passes.

---

## Tier 1 — Every Build (smoke, ~3 min)

Run against the Vercel preview URL after any push to the branch.

- [ ] App opens at deploy URL — no white screen, no console errors
- [ ] Version number in Settings → About matches the expected `package.json` version
- [ ] Roster tab loads; "+ Add" button visible
- [ ] Add an athlete → athlete appears in roster
- [ ] Guide tab loads; all 3 skill cards visible (Body Position, Braking, Cornering)
- [ ] Rubric card tap opens detail — level descriptions readable (confirms rubric.json loaded, not blank)
- [ ] Settings tab loads; team name field present

---

## Tier 2 — Every PR to `main` (full regression, ~15 min)

Run in browser (Chromium) against the Vercel preview URL. Covers all app flows.

### Roster
- [ ] Add athlete (name, grade, category) → appears on roster with correct meta
- [ ] Add coach (role: coach) → appears with coach styling
- [ ] Expand roster row → level chips and caret visible
- [ ] Open full athlete card → name, photo placeholder, skill blocks, QR visible
- [ ] Log observation: tap level pill → observation recorded, count increments
- [ ] Confirm level → confirmed level updates on card and roster chip
- [ ] Trail readiness band updates after level confirmation

### Practice
- [ ] Start Practice → practice card shows "IN SESSION"
- [ ] Take Attendance → roster enters attendance mode, toggle buttons visible
- [ ] Mark 2–3 athletes attending → green highlight on their rows
- [ ] Exit attendance mode → attending athletes show subtle green highlight in normal view
- [ ] End Practice → practice moves to history, no longer "IN SESSION"
- [ ] Export attendance → JSON downloads with correct athlete list

### Guide
- [ ] All 3 skills render with title, level pills, detail text
- [ ] Tap full rubric → rubric sheet slides up; all levels visible
- [ ] Swipe down on rubric sheet → sheet closes
- [ ] Rubric content is from `rubric.json` (not fallback): open Network tab → confirm `rubric.json` 200 response on page load

### Settings
- [ ] Coach name and team name save and persist after page reload
- [ ] Export data → JSON downloads; file contains roster and observations
- [ ] Feedback section visible; dismiss works (once D17e is fixed)
- [ ] App version displayed

### QR / Scan
- [ ] Open full athlete card → QR code renders and is scannable by another device
- [ ] Share modal (⋯ menu) → QR renders and is scannable
- [ ] Scan button visible on empty roster (D21)

### Offline
- [ ] Serve app once in browser → enable DevTools offline → reload → app loads from cache
- [ ] Rubric content visible offline (served from SW cache, not network)
- [ ] Log an observation while offline → observation saved to localStorage

---

## Tier 3 — Real Device (every phase completion)

Cannot be automated. Requires physical Android and iOS devices.

### Android (Chrome)
- [ ] Open Vercel preview URL in Chrome
- [ ] Three-dot menu → "Add to Home Screen" → installs as standalone app
- [ ] Open from home screen → no browser chrome, full-screen app
- [ ] Enable airplane mode → open from home screen → app loads fully
- [ ] Navigate to Guide → rubric content visible (served from SW cache)
- [ ] Log an observation in airplane mode → saves successfully
- [ ] Re-enable network → app continues normally

### iOS (Safari)
- [ ] Open Vercel preview URL in Safari
- [ ] Share button → "Add to Home Screen" → installs
- [ ] Open from home screen → full-screen standalone
- [ ] Airplane mode → open → app loads fully
- [ ] Guide rubric content visible offline

### PWA Update Propagation
- [ ] With app installed, deploy a new build (bump version in package.json)
- [ ] Fully close the installed app (remove from recent apps)
- [ ] Reopen from home screen → new version number visible in Settings
- [ ] Confirms SW `autoUpdate` is working

---

## Tier 4 — Phase 2a Acceptance (one-time, before merge to `main`)

Run once to sign off Phase 2a DOD. Most items only need to pass once per phase.

### rubric.json GitHub edit roundtrip
1. Open `public/rubric.json` on GitHub.com (pencil icon), edit one word in a level description
2. Commit directly to `phase2/pwa` branch
3. Wait ~2 min for Vercel to redeploy
4. Open Vercel preview URL in a **regular browser tab** (not the installed app — avoids SW cache)
5. Navigate to Guide → confirm the edited word appears
6. Revert the edit (repeat commit) to restore original content
- [ ] Edit deployed without a build step — confirms IDEA-018 / Phase 2a DOD item

### Lighthouse PWA audit
- [ ] Run Lighthouse in Chrome DevTools (incognito, no extensions) → Best Practices: 100
- [ ] No manifest errors in console
- [ ] Performance ≥ 85, no render-blocking resources from external domains (D18)

### Installability
- [ ] Chrome install prompt or three-dot "Add to Home Screen" works — app installs
- [ ] Installed app has correct icon (192×192 and 512×512), name "MTB Skills", no browser chrome

---

## Tier 5 — Phase 2b Acceptance (Google Sheets import)

Once 2b is built.

- [ ] Paste valid public Google Sheets URL → import runs → athletes appear on roster
- [ ] Re-import same sheet → no duplicates; existing observations preserved
- [ ] Import summary shows added / existing / skipped counts
- [ ] Private sheet → error: "This sheet isn't publicly shared…" with fix instructions
- [ ] Non-Sheets URL → inline validation error before fetch attempt
- [ ] Offline after prior import → cached roster still present

---

## Notes

- **rubric.json cache vs. deploy:** When testing the GitHub edit roundtrip, always use a regular browser tab, not the installed PWA. The installed app serves rubric.json from the SW cache until the SW updates on a cold open.
- **Extension noise in Lighthouse:** Run Lighthouse in incognito to exclude extension JS (Bitwarden, etc.) from performance metrics.
- **Offline toggle in DevTools vs. airplane mode:** DevTools offline is sufficient for Tier 2 regression. Real airplane mode is required for Tier 3 — the SW behaves differently on real hardware under genuine network loss.
- **iOS remote debugging:** Requires a Mac. iPhone: Settings → Safari → Advanced → Web Inspector on. Mac: Safari → Develop → [device name].

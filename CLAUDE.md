# MTB Skills Assessment — Project Instructions

## App being built

A coach-facing skill assessment tool for NICA MTB coaches. See ROADMAP.md for phases.

**Tech constraints:**
- Phase 1: Vanilla HTML/CSS/JS, ES modules, no build step, localStorage only
- Offline-first throughout all phases — practices are frequently out of cell service
- No sequential IDs — use UUIDs everywhere (multi-device merge safety)
- Data model must not lock out multi-tenant: all records carry `team_id` and `coach_id` from Phase 1

**Deployment:**
- Static hosting via GitHub Pages — deploys from `main` branch, root (`/`)
- Live URL: https://ashaber.github.io/mtb-skills/
- `index.html` must live at repo root
- Updates ship on git push to main — no build step, no manual deploy
- Phase 2c adds service worker for PWA install (home screen icon, offline)
- Phase 4 backend deploys separately (Railway/Render/Fly.io); frontend deploy unchanged

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
  - [ ] JSON export (full data download)
- [ ] Data persists across page reloads (localStorage)
- [ ] App works with no network connection
- [ ] No sequential IDs — all records use UUIDs
- [ ] All records carry `team_id` and `coach_id`

**Key files:**
- `RUBRIC.md` — authoritative rubric content; card content is master
- `app/rubric.js` — rubric data as ES module; all views import from here
- `app/storage.js` — data access abstraction; swap this to change backend
- `app/schema.md` — data model documentation

**Assessment model:**
- Raw observations are immutable append-only: `{ athlete_id, skill, level_observed, session_date }`
- Confirmed level is separate: coach explicitly sets it when consistency gate is met
- Trail readiness is always computed client-side from confirmed levels + `TRAIL_MINIMUMS` in `rubric.js`

---

# MTB Skills Assessment — Rubric Data
Master content source. Card content is authoritative. Reference doc and app derive from this.
Last updated: v2.0, May 2026

---

## Scoring Rules
- Consistent = earns the level. One good rep does not qualify.
- Any single item on the failure list = level not met.
- Speed or trail complexity can trigger any failure mode.
- Assess under real trail conditions whenever possible.
- Assess at start of every season — skills regress in off-season.

---

## Scale

| Level | Trail Rating | Consistency Gate |
|-------|-------------|-----------------|
| 1 | Paved / no rating | Breaks on anything beyond flat |
| 2 | Green ● — Easy | Breaks with distraction or challenge |
| 3 | Blue ■ — More Difficult | Breaks when over-challenged |
| 4 | Black ◆ — Very Difficult | Breaks only at extreme consequence |
| 5 | Dbl Black ◆◆ | Essentially does not break |

Level 5 = Beyond NICA trail scope. NICA riders ride white, green, blue, and black trails.

---

## Skill 1: Body Position

**Foundation for Braking and Cornering.**
Three accumulated steps: (1) standing ready appropriate to terrain, (2) BBS S/S and F/B, (3) pumping / pressure control.

Weight shifts at Levels 1–2 are unintentional failures.
At Levels 4–5, intentional F/B pressure control is correct execution — loading for features.
Foundation for front wheel lifts (OTB-201) and wheelies/manuals (OTB-301).

### Card Content (master)

| Level | When it breaks | What breaks — any of: |
|-------|---------------|----------------------|
| 1 | Breaks on anything beyond flat | Seated or knees pinch saddle · rigid · looks at front wheel · no ready · 3 Key Essentials absent |
| 2 | Breaks with distraction or challenge | Standing but rigid · weight shifts fwd or back · BBS absent · loses ready with distraction |
| 3 | Breaks when over-challenged | BBS breaks under pressure · pressure control only emerging on features · 3 Key Essentials reliable |
| 4 | Breaks only at extreme consequence | BBS always · pressure control consistent · intentional loading for features · largely autonomous |
| 5 | Essentially does not break | Full tactical pressure control any terrain · Beyond NICA trail scope |

### Reference Doc Detail (by level)

**Level 1:**
Knees pinch saddle or seated rather than standing ready. Rigid on bike — no BBS possible. Looks at front wheel. 3 Key Essentials absent or inconsistent: no deep bend in elbows and knees, elbows not wide, weight not in feet.

**Level 2:**
Standing but rigid. Weight shifts forward or back unintentionally — from habit, misunderstanding, or fear (independent failures, both directions appear at this level). Does not reliably adjust tall/low ready to terrain. BBS S/S and F/B absent or minimal. 3 Key Essentials fail with distraction or challenge.

**Level 3:**
Standing ready appropriate to terrain most of the time. Tall/low selection mostly correct. 3 Key Essentials reliable. BBS S/S and F/B present most of the time. Pressure control emerging — intentional F/B loading beginning to appear on features, inconsistent. Reverts to stiff or close vision only when significantly over-challenged.

**Level 4:**
Always adjusts tall/low ready appropriately to terrain steepness and features. 3 Key Essentials automatic. BBS S/S and F/B always present. Intentional F/B loading for features — lunge on roll-down, step-up. Pressure control consistent. Foundation for front wheel lifts (OTB-201). Largely autonomous — no conscious attention required.

**Level 5:**
Low ready automatic under all conditions. Full pumping / pressure control automatic across all features and terrain. Foundation for wheelies and manuals (OTB-301). Fully autonomous — tactical application. Beyond NICA trail scope.

### Diagnostic Notes

**Fitts and Posner stages:**
- Levels 1–2: Cognitive — conscious, inconsistent, fails under distraction
- Level 3: Associative — reliable but breaks under pressure
- Level 4: Largely autonomous — attention freed for terrain and tactics
- Level 5: Fully autonomous — tactical application

---

## Skill 2: Braking

**Builds on standing ready position.**
Three accumulated steps: (1) both brakes with modulation, (2) bracing leg and hips back, (3) timing for corners and trail braking.

Grabbing brakes rather than squeezing is the most fundamental Level 1 failure.

**Gary Test** (reference doc only, not on card): An unexpected obstacle placed in rider's path. Coach observes both brakes, heel drop, bracing leg, ready position maintained. Tests whether correct braking survives surprise. Level 4 requires passing consistently on trail.

### Card Content (master)

| Level | When it breaks | What breaks — any of: |
|-------|---------------|----------------------|
| 1 | Breaks on anything beyond flat | Rear brake only · 2-3 fingers · grabs and skids · afraid to brake hard · brakes in corners |
| 2 | Breaks in unexpected stops | Yanks rear under surprise · skids · body shifts forward · brakes in corners when scared |
| 3 | Breaks at extreme surprise | Rarely skids · bracing leg lost at extreme surprise · hips back and down: learning, not yet reliable |
| 4 | Breaks only at extreme consequence | Never skids · hips back and down automatic · always braces leg · brakes before corners · correct braking when surprised |
| 5 | Essentially does not break | Full tactical braking · precise modulation + timing · front/rear intentional · Beyond NICA trail scope |

### Reference Doc Detail (by level)

**Level 1:**
Rear brake only or heavily rear-biased. Two or three fingers on levers — no modulation possible. Grabs brakes resulting in skid. Afraid to brake hard — limited ability to slow down. Brakes in corners as default behavior.

**Level 2:**
Even front/rear braking under perfect conditions. Unexpected stop yanks rear only — skids. Upper body shifts forward compounding the skid. Bracing leg present in controlled expected stops, lost in unexpected scenarios. Brakes in corners as panic response to speed or consequence.

**Level 3:**
Good modulation — rarely skids. Powerful braking, short stopping distance. Bracing leg consistent except most extreme surprise stops. Hips back and down introduced — learning the movement, present sometimes in normal stops, not yet reliable under pressure or surprise. Maintains body position enabling transition to cornering.

**Level 4:**
Never skids. Both brakes always consistent. Braking always solid on any terrain — planned and emergency stops. Hips back and down automatic. Always braces leg including emergency situations. Brakes before corners consistently. Correct braking maintained in unexpected stops — passes Gary Test on trail.

**Level 5:**
All foundational braking always correct. Precise modulation, timing, and intentional front/rear pressure for any conditions. Carries speed to last second before corner — brakes hard to precise entry speed — releases front first, trails rear to settle suspension. Holds rear brake through steep corners to manage speed. Senses traction loss on slippery surfaces and modulates in real time. Times braking to high-traction zones. Foundation for nose wheelies and other advanced brake-based skills. Beyond NICA trail scope.

### Diagnostic Notes

**Panic pattern at lower levels:** braking in corner, weight back, squeezes bike and steers to compensate. Higher level = higher panic threshold.

**Fitts and Posner stages:**
- Levels 1–2: Cognitive — braking requires conscious effort, fails under surprise
- Level 3: Associative — reliable in planned stops, inconsistent under surprise
- Level 4: Largely autonomous — correct braking maintained even when surprised
- Level 5: Fully autonomous — tactical speed management, not technique execution

---

## Skill 3: Cornering

**Most extensive step progression.**
Sequence accumulates:
- Level 2: BBS S/S lean + maintains ready
- Level 3: Low-Look-Lean (OTB-101) + hip rotation/counterbalance (OTB-201 movement)
- Level 4: Full sequence consistent
- Level 5: Pumping / pressure control through apex (OTB-301)

OTB-201 movements assessed on execution — not whether rider has attended OTB-201 training.

### Card Content (master)

| Level | When it breaks | What breaks — any of: |
|-------|---------------|----------------------|
| 1 | Breaks on anything beyond flat | Steers all corners · no lean or leans outside · seated · no ready · pedals uneven |
| 2 | Breaks at faster or unpredictable corners | Body-bike locked same lean · knees squeezed · steers under pressure · eyes on threat · weight off |
| 3 | Breaks at higher speed or consequence | BBS lean breaks under pressure · hip rotation only in ideal conditions · ready erodes · weight shifts |
| 4 | Breaks only at extreme consequence | Hip rotation breaks at extreme consequence · pressure control only on consistent banked corners · largely autonomous |
| 5 | Essentially does not break | Full sequence any terrain · pumps the apex · Beyond NICA trail scope |

### Reference Doc Detail (by level)

**Level 1:**
Setup: Pedals uneven or inside pedal down. Seated — no ready position.
Lean: No bike lean or leans to outside. Steers through all corners.
Eyes: On front tire or threat — increases perceived speed, triggers panic.
Panic: Present at low threshold.

**Level 2:**
Setup: Outside or inside pedal down. Seated or tall ready entering corner.
Lean: Body and bike locked same lean — knees squeezed, no BBS S/S. May lean to outside. Steers rather than leans, especially under speed.
Eyes: On front tire or threat rather than through exit.
Weight: Too far forward or back — from misunderstanding, habit, or fear. Both directions appear at this level.
Panic: Braking in corner, weight back, squeezes bike and steers to compensate.

**Level 3:**
Setup: Pedals level on entry most of the time. Low ready present but erodes mid-corner — gets tall or weight shifts.
Lean: BBS S/S lean consistent — correct direction, knees wide, elbows hinge, seat shifts toward inside thigh. Lean limited to OTB-101 range.
Hip: Hip rotation and counterbalance present under ideal conditions only — produces visibly greater lean than BBS alone. Absent under pressure.
Eyes: Through exit most of the time. Reverts under pressure.
Weight: Generally centered. Loses fore/aft balance under pressure.
Panic: Same pattern as Level 2 but higher threshold. Normal trail riding usually clean.

**Level 4:**
Setup: Level pedals consistent. Low ready maintained through arc always.
Lean: BBS S/S consistent. Lean angle appropriate to speed and corner.
Hip: Hip rotation and counterbalance always consistent on blue/black terrain.
Eyes: Through exit consistently. Rarely reverts.
Weight: Stable through arc. Pressure control present under ideal conditions — consistent banked corners.
Panic: Rare. Not present in normal trail riding. Recovers quickly.

**Level 5:**
Full sequence consistent under any conditions — rocky, off-camber, loose, rutted, drop exits.
Pumps the apex: dynamic pressure load through corner peak maximises traction. Applied to mid-corner features (roots, rolls, drops). Momentum-dependent — cannot be held statically.
Panic essentially absent. Beyond NICA trail scope.

### Diagnostic Notes

**Level 2 — body-bike separated lean:**
Correct BBS S/S lean produces two observable proofs:
1. Inside elbow straightens, outside elbow bends to acute angle (windshield-wiper / scarecrow arms)
2. Seat shifts toward or touches inside thigh
Seat-to-thigh contact limits lean at Level 2. At Level 3, hip rotation drives past this point.
Regress to BBS S/S drill (wide knees, windshield-wiper arms) if lean direction wrong or body-bike locked.

**Level 2 gate cue field validation note:**
"Body-bike separated lean" as Level 2 gate is flagged for field validation. Confirming whether ready position holds through lean at this level requires observation across multiple coached sessions.

**Key Level 2→3 observable:**
Not just greater consistency — Level 3 produces visibly greater lean angle due to hip rotation. The seat-to-thigh contact that was the Level 2 proof point becomes the starting position for Level 3 movement.

**Panic pattern:**
Weight back, braking in corner, squeezing bike and steering — common at all levels below threshold. Eyes on threat or front tire amplify panic by increasing perceived speed.

**Fitts and Posner stages:**
- Levels 1–2: Cognitive — steers consciously, BBS S/S requires deliberate effort
- Level 3: Associative — BBS and Low-Look-Lean present but break under pressure
- Level 4: Largely autonomous — full sequence requires no conscious thought, rider focuses on line choice and speed
- Level 5: Fully autonomous — tactical pumping

---

## Trail Selection Minimums

Floors not ceilings. Higher-rated riders can ride lower-rated trails.
Ratings reflect hardest feature — match minimum to that feature, not just the rating.
Short sections can be speed-managed or walked.

| Trail | Body Position | Braking | Cornering |
|-------|--------------|---------|-----------|
| Green ● | 2 | 2 | 1 |
| Blue ■ | 3 | 2 | 2 |
| Black ◆ | 3 | 3 | 3 |
| ◆◆ | 4 | 4 | 4 |

**Feature-driven assessment examples:**
- Blue trail with berms and jump features: minimum BP 3 (cannot be stiff on features), Cornering 2
- Black trail with steep, loose, high-speed corners into water bars: minimum BP 4, Braking 3, Cornering 3

---

## Skills Not Yet in Scope

**Climbing** — excluded from v1. Climbing is a toolbox of discrete techniques (front wheel lift, hip shift, seated/crouched/standing climb, gear anticipation, dismount) rather than a linear step-accumulation progression. To be added as a separate module once rubric and progression are defined.

---

## Terminology Reference

| Term | Definition |
|------|-----------|
| BBS | Bike-Body Separation — OTB term |
| BBS S/S | Bike-Body Separation Side-to-Side |
| BBS F/B | Bike-Body Separation Forward-and-Back |
| 3 Key Essentials | Level pedals · finger on brake lever · head up |
| Heavy feet / light hands | Weight in feet not hands — OTB term |
| Windshield-wiper / scarecrow arms | OTB cue for BBS S/S elbow hinge |
| Low-Look-Lean | OTB-101 cornering sequence |
| Pumping / pressure control | Dynamic tire loading — NOT static "weighted" |
| Pump the apex | Dynamic load through corner peak, momentum-dependent |
| Gary Test | Unexpected obstacle in path — braking form under surprise. Reference doc only, not on cards. |
| Beyond NICA trail scope | Level 5 label — rider CAN achieve, NICA events don't use these trails |

# Ideas — MTB Skills Assessment App

Raw brainstorm capture. No phase commitment. Promote to GitHub issue when ready to discuss seriously.

---

## 2026-06-06

### IDEA-001 Trail Network & Ride Plan Checker
Coach builds a local trail network — a list of trails with name, rating (green/blue/black/double black), and required skill minimums (Body Position, Braking, Cornering — same scale as rubric). Trails also carry a **seasonal condition adjustment**: e.g. loose and dry = effectively harder, raise minimums by 1. Coach loads a ride plan (ordered list of trails for a practice or race day) and the app flags any athletes who are below the required skill level for any trail on the plan.

**Details worth capturing:**
- Trail minimums follow the same BP/Bk/Cn format as the rubric (e.g. 3-3-2)
- Seasonal adjustment is a modifier on the minimum, not the trail rating itself
- Conditions examples: loose/dry (+1), wet roots (+1 Braking), hardpack (no adjustment)
- Ride plan = ordered trail list; app shows per-athlete pass/fail per trail
- In a later phase, Head Coach / Team Director sets or approves trail minimums (not individual coaches)
- Could integrate with the Phase 4 multi-tenant backend — league-wide trail library, team-specific adjustments

**Open questions:**
- Who maintains the trail list? (coach-entered in Phase 1, HC/TD in later phase)
- Is the trail library per-team or shared across the league?
- Does the app need to know trail order / sequence, or just flag any trail on the plan?

---

### IDEA-002 App sharing and promotion
- Add a QR code in app settings pointing to github pages url
- consider a kill switch.  Allow the app to be shared but need a way to prevent it from being used fully for free or copied/reverse engineered
- add an about section in settings below share qr.  Describe how the app is used for a practice and a brief roadmap of what is coming.  Highlight that while useful for a ride pod to track practice, it is more about the skill tracking
- Will used for promotion of app and skills assessment at NICA national conference next week.

### IDEA-003 Swipe motions and single click entries
- simplify opening full athlete card.  Once expanded on roster, swipe left opens full card.  On full card, swipe right goes back to roster with athlete collapsed
- on roster, clicking a level records observation without a button click. remove record observation button.  Will result in inability to record observation of multiple skills as a single entry but we're not using the data that way.


### IDEA-004 Athlete Trading *(complete — Phase 1c)*
Allow two coaches to exchange athletes.  E.g., athlete moves up to a higher skill/faster group, or moves down on a rest day.  Could be a QR code encoding athlete detail to load on other coaches roster.

### IDEA-005 Athlete Info *(complete — Phase 1c)*
Any special medical requirements like Epi pen or insulin.  Parent contact info for emergencies.  When an athlete is traded (see above) would include athlete info so a new coach working with athlete has necessary info.  Make an info icon but limit

### IDEA-006 practice roster
show athletes from roster, record attendance for the practice.  Allow temporary adds when unable to receive trading card from normal coach.  Allow sorting on the roster, including show attending riders on top and non-attending on off the bottom.  Also, allow coaches on roster.  Level 3 coach should be evaluating Level 1 and 2 coaches.1

### IDEA-007 Onboarding Screen
First-launch experience for brand new users. Set expectations before they hit the blank roster: what the app does, how the assessment flow works (observe → confirm → trail readiness), and a prompt to set up their coach profile and team. Reduces confusion for coaches who receive the URL cold with no context.

### IDEA-008 Education Screen — Digital Field Guide + Rubric *(shipped — Phase 1b)*
In-app rubric reference. Digital version of the field card layout (skill → level → when it breaks → what breaks). Each card links to the long-form reference detail for coaches who want more context. Also the entry point to skill-level video clips (Phase 1+). Keeps the rubric accessible during a ride without paper cards.
- Card view matches the printed field card format for familiarity
- "More detail" tap expands or links to full reference doc level
- Video link per level when clips are available (Phase 1+)
- No data model impact — reads from `src/rubric.js` only

### IDEA-009 Video Reference per Skill Level *(promoted to ROADMAP.md Phase 1+)*
YouTube-linked clips per skill/level on rubric cards. Tim's existing video assets are the source.

### IDEA-010 Monetization Path *(noted in ROADMAP.md)*
- BICP (for-profit skills org) as alternative to NICA if app becomes commercializable.  
- Better plan, make practice app sellable to teams and leagues


### IDEA-011 Practice tracking feature set.  
Use case:  The ride group uses app to track practice. Once connected to the google doc backend, 
head coach can enter practice plan.  The practice plan includes practice venue (a trailhead or a park).
Each ride group lead may be assigned a set of trails to ride and even a specific route.  Each venue
should have an emergency action plan listing where to exit, if cell service is available, hazards to 
avoid. Nearest shelter.  Bathroom location.  Ride plan can also include practice focus - skills, etiquette etc.
Practice process:
1. HC loads practice plan to google doc
2. ride group lead's app sync's the practice plan
3. before practice, ride group lead checks plan, ready to ask questions
3.5 if ride route contains sections above groups trail readiness, lead can request change or can plan for safe handling like walking a section or coaching skills required for that section
3.7 review feedback from prior practice and be ready to adapt - e.g., SA ask to work on a specific skill
4. at practice, ride group lead's group joins up.  Lead opens attendance mode and records attendees
4.5 if any swaps are required (rider moves up or down), trade rider cards between ride group leads
5. during practice, ride group lead coaches skills, observes riding and records skill levels
6. at end of practice when reflecting on the experience with student athletes, record notes.
7. record attendance in google docs backend where HC/TD can access it


### Later in roadmap: record SOAP notes, incidents and other details

### IDEA-012 App Feedback
- Allow users to give really simple 5 star
- provide freeform text feedback
- take specific rubric feedback:  Adjust skills, keywords or level boundaries
- track usage.  Report back if app is 1. shared 2. used - opened and interacted 

### IDEA-013 full rider page - allow viewing other level descriptions and not set observation *(complete — phase2/about-ideas-d7)*
The full rider page is the first documentation.  Make it easy to see what level 2 or 3 is in the short format. Maybe just make the full rider page
work so that you click on a level number and see its description.  Then, must click log observation.  This takes away the quick log but is why you would open full rider page.

### IDEA-016 — Accessibility: larger fonts for coaches without readers on trail

Coaches frequently ride without reading glasses. Two options to evaluate:

1. **Increase base font size globally** — audit current font sizes across all views; increase body text from current size to ~16–17px minimum. Simple, benefits all users, no new UI needed. Risk: may feel cramped on dense views like the rider card skill list.

2. **Pinch-to-zoom on Guide page** — remove `user-scalable=no` from the viewport meta tag (or scope zoom permission to the Guide page only). Allows coaches to pinch-zoom the rubric text without affecting the rest of the app. Native browser behavior, zero implementation cost if the meta tag is the only blocker. Risk: zoom on other pages (roster, rider card) may break fixed-position elements like the tab bar.

**Recommendation when building:** Try option 1 first — a global font bump is the right long-term fix. Option 2 is a quick win specifically for the Guide page if font size alone isn't enough for dense rubric detail text.

---

### IDEA-015 — Guide page: structured rubric with progression coaching

Redesign the Guide page to take advantage of the full screen rather than replicating the small field card format.

**Header:** Replace the current generic header with a brief explanation of the three rubric dimensions — failure modes, skill progression, and terrain — so a coach new to the rubric understands the structure before reading any level.

**Level sections:** Each level gets a distinct expandable section organized into three clearly labeled parts:
- **Failure modes** — what breaks and when
- **Skill progression** — what teaching points are accumulated at this level vs. the previous
- **Terrain** — where this level is demonstrated reliably

**Progression guidance (expandable sub-section):** Under each level, a collapsible "How to progress to the next level" block — drills, coaching cues, and conditions that develop the skills needed to advance. This is where game/activity recommendations live: specific games or exercises that build the target movements.

**Relationship to Tim's athlete view:** This progression guidance closely mirrors what an athlete-facing view would show. Content should be authored with both audiences in mind — coach language for this view, athlete language for the future athlete app. Coordinate with Tim on content before authoring.

**Authoring note:** Requires careful content work — rubric.js currently has `detail`, `failure_modes`, and `when_breaks` fields but no progression coaching or game recommendations. New fields needed: `progression_drills` and `recommended_games` per level per skill.

---

### IDEA-014 Feedback mode *(complete — phase2/about-ideas-d7)*
Default feedback mode to on.  Add a toggle in settings page.  It is unintrusive so just keep it active.

---

### IDEA-018 — Separate rubric content from code (public/rubric.json)

**Problem:** Rubric content lives in `src/rubric.js` as an ES module. Any wording change — "word X would resonate better with coaches than word Y" — goes through the full code pipeline: edit JS, PR, CI, build, deploy. This is unnecessary friction for pure content edits, and it creates risk (content edit accidentally breaks a JS import).

**Goal:** Rubric wording should be editable on GitHub.com (pencil → commit → auto-deploy in ~60s), the same as `public/about.html` already is. No terminal, no build required.

**Recommended approach: `public/rubric.json`**

Move rubric content fields (`detail`, `failure_modes`, `when_breaks`, level descriptions) to `public/rubric.json`. Vite copies `public/` verbatim to `dist/`, so the file is served at `/rubric.json`. The app fetches it at startup instead of importing from JS.

`src/rubric.js` retains only the structural constants that the code depends on: `SKILL_IDS`, `TRAIL_MINIMUMS`, `TRAIL_LABELS` — things that have code implications if changed. Pure text content moves to JSON.

**The offline complication:** Currently the rubric is bundled, so it works offline on first load with no prior visit. A runtime fetch requires a prior online visit to cache it. This resolves cleanly when the Phase 2c service worker lands — the service worker pre-caches `rubric.json` at install time, fully restoring offline behavior. In the gap (Phase 1 → Phase 2c), the app can fall back to a bundled default if the fetch fails.

**Scope boundary:** This idea covers content fields only. Structural changes — adding new fields like `progression_drills` or `recommended_games`, or adding icon metadata — still go through the code pipeline because they require view changes. The split makes that boundary explicit: if you're only changing words, touch only JSON. If you're changing structure, touch JS.

**Related:** [[IDEA-015]] (Guide page redesign) will need new rubric fields; design those fields in JSON from the start.

---

### IDEA-019 — Localization and translation strategy

**Context:** If the app expands beyond English-speaking NICA programs, rubric content needs translation. The rubric is technical and nuanced — motor learning terminology, failure mode descriptions — so machine translation alone won't be sufficient; it needs native-speaker coach review per language.

**Option A: Per-language JSON files**
```
public/rubric.en.json
public/rubric.es.json
public/rubric.fr.json
```
App detects `navigator.language` or coach preference, fetches the matching file. Simple, fully offline-compatible with service worker pre-cache. GitHub-editable per language. Recommended for Phase 1–3.

**Option B: Single file with language keys**
```json
{ "body_position": { "en": "...", "es": "..." } }
```
Simpler to keep in sync but file grows proportionally with every language added. Likely to perform poorly at 5+ languages — the entire multi-language rubric loads even when only one is needed.

**Option C: DB backend (Phase 4+)**
FastAPI endpoint serves rubric content by language: `GET /rubric?lang=es`. Content managed in Supabase, editable via admin UI without GitHub access. Required if non-technical translators (coaches in other countries) need to contribute or review content. Overkill until there's a real translation partner.

**Recommendation:** Start with Option A (`rubric.{lang}.json`) when the first translation is needed — it's the natural extension of [[IDEA-018]]. Move to Option C only if a league partnership (e.g. NICA Canada, a Spanish-speaking league) needs non-GitHub editorial access.

**Globalization note:** Language and locale are separate concerns. `rubric.es.json` covers Spanish wording; country-specific trail rating systems (not all countries use green/blue/black/double-black) would require locale variants (`rubric.es-MX.json`). Don't over-engineer this until there's a concrete non-US use case.

**Prerequisite:** [[IDEA-018]] (content/code separation) should ship first — localization on top of a bundled JS module is much harder than localization on top of a JSON fetch.

---

### IDEA-017 — First-use onboarding: coach adds themselves on first open

**Problem:** New users land on an empty roster with no guidance. Engagement data shows them bouncing between Roster and Practice tabs without taking any action — the empty state doesn't tell them what to do first. The natural first step (add yourself) is hidden behind the + Add button with no prompt.

**Insight:** The coach is simultaneously two things in the data model — the Settings profile (name, team, used to tag observations) and a Coach entry on the roster. Right now these are set up independently, requiring the user to visit Settings before the roster is useful. New users have no reason to go to Settings first.

**Proposed flow:** On first launch (no roster entries, no coach profile set), show a simple onboarding prompt instead of the empty roster:

> "Welcome — let's get started. What's your name?"
> [Name field] [Team field (optional)]
> [Get started →]

On submit:
- Create the coach profile in Settings (name, team)
- Add the coach as a Coach entry on the roster (same name/team, role: coach)
- Dismiss onboarding and show the roster with the coach already listed

**Key decisions:**
- Trigger condition: `getCoach()` returns null AND roster is empty — never shown again after first setup
- Sheet or inline? A Tier 3 sheet on first load is appropriate — same pattern as the practice reflection sheet
- Name is required to proceed; team is optional (can be set in Settings later)
- Role is always Coach for this flow — athletes are added manually afterward
- Photo can be added later from the coach's roster card

**Why this helps:** Removes the Settings-first dependency. Coach sees their own card immediately, which also demonstrates the roster UI and makes the + Add flow for athletes obvious by example.



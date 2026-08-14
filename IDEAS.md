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

**Addendum (2026-08-10):** Practice plan should be written by HC/TD and distributed to ride-group leads — needs a workout-level field, recommended nutrition, and a scheduled-practice time/date, on top of the venue/EAP fields already specced above.

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

**Coach feedback (2026-06-25):** "Each level needs what is changing. Decreasing fear errors, increased skill, increased trail difficulty. Show with color icons, red down arrow, green up arrow. Expand out; how to improve." — This directly validates the level-section approach and adds a specific visual requirement: directional delta indicators (↑/↓ with color) on each level showing what improves relative to the previous level. Red down-arrow = what failures decrease, green up-arrow = what capability increases. This is a concrete UI pattern to design to when IDEA-015 is built.

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

---

### IDEA-020 — Identity: PitZone as NICA master user registry

**Context:** PitZone is NICA's authoritative user system. It issues a registration ID per person and uses email as the family-level login — not the individual-level identifier. A parent coach and their student athlete can share the same PitZone account and email address.

**Implications for this app:**

- **Email is not a safe unique key.** Never use PitZone email alone to identify an individual athlete or coach. Always prefer a NICA registration GUID when available.
- **Roster import (Phase 2b):** If the Google Sheet includes a NICA ID / Registration ID column, use it as the primary merge key. Fall back to name-match only when no ID is present. Store the ID as `external_id` on the athlete record — not displayed in UI but used for merge and future sync.
- **Phase 3 auth:** When backend auth is added, the login identity will be PitZone email (family account). The app must resolve from family email → individual person records, not treat the email as a person identifier. A coach logging in as `family@example.com` may have both a coach record and one or more athlete records associated with that PitZone account.
- **Two-way sync (Phase 3+):** `external_id` (PitZone GUID) is the join key between local records and the NICA backend. Design the data model to carry it from Phase 2b onward so no migration is needed when sync is added.

**Open questions:**
- Does PitZone expose a public API for roster lookup, or is export-to-sheet the intended integration path?
- Can individual athletes have their own PitZone login, or is the family account always the entry point?
- What GUID format does PitZone use — numeric, UUID, other?

### IDEA-021 — League staff & detailed RBAC

**Context:** Phase 3 ships four roles enforced by Postgres RLS (`supabase/migrations/0002_rls.sql`). Current capabilities:
- `coach` — sees & writes (observations / confirmed-levels / practice / attendance) **only for their own ride group** (`app_caller_ride_group_ids()` = groups where they are the `role='coach'` occupant).
- `head_coach` / `team_director` — see & write the **whole team**, incl. roster management (import, reassign groups). Functionally identical (`app_caller_hc_team_ids()` covers both).
- `league_staff` — sees **every team in their league** (via `app_caller_league_team_ids()`) but **read-only** — there are NO league_staff insert/update policies. Pure oversight.
- One person = exactly one role; one auth_user links to one person (no multi-hat).

**Gaps surfaced in pilot-leadership discussion (Tim/Eddie/Nate + andrew all "league staff who float across teams and rate"):**
- **No league-wide WRITE role.** People who work across teams and record ratings don't fit today: `league_staff` can't write, HC/TD is per-team. Interim workaround used for the pilot: put everyone on one team as `coach`/HC/TD.
- **Options for a real fix:**
  - **A (recommended first):** give `league_staff` **league-scoped write** — mirror the HC insert/update policies but keyed on `app_caller_league_team_ids()`, for observation / confirmed_level / practice / attendance. A "league super-coach." "Temporary coach any group" then falls out for free (they see + can write any group in the league). Optionally extend to roster admin (person insert/update) league-wide; hold that at first (least blast radius).
  - **B:** **multi-persona** — one auth_user → multiple person rows (e.g. scoped coach on team X + viewer elsewhere), requiring the deferred `X-Persona-Id` "which hat" picker (`app/deps.py` TODO). More flexible, more UI.
- **Capability vs. role.** `lead`/`sweep` are currently `person.tags` (folksonomy, no authz). A future permission model could gate specific actions (attendance-taking, promote/demote, medical-info visibility) on capabilities rather than coarse roles — turning RBAC into ABAC-lite.
- **Onboarding tie-in:** the designed-but-unbuilt **access-request flow** (login-with-no-persona → pending → admin approves + assigns role/team/group) removes today's manual SQL seed + role-set for every new person.

**Recommendation:** Ship **A** as a small RLS migration when league-wide staff become real (not just a single-team pilot). Reach for B / capabilities only when someone genuinely needs to be a *scoped* coach on one team while a viewer elsewhere — the single-role model covers everything until then.

**Open questions:**
- Should league-wide write include roster management, or only ratings/attendance? (Blast-radius vs. convenience.)
- Is a league-wide *write* role even desirable, or should cross-team work always be explicit per-team grants (auditability)?
- Do lead/sweep ever need to *gate* behavior, or do they stay purely descriptive?

---

### IDEA-022 — Rider photo capture via device camera *(parked — build attempted, e2e failing)*

Let a coach launch the device camera directly from the rider card and set the captured frame as the rider photo, instead of only picking an existing file.

**Status:** A build was attempted on branch `feature/idea021-rider-photo-camera` (worktree only, never committed/opened as a PR). Frontend logic is sound — 307/307 Vitest passing (`index.html`, `src/main.js`, `src/storage.js`, `src/views.js`, `tests/unit/storage.test.js`). But the new Playwright e2e suite (`tests/e2e/test_photo_camera.py`, mocks `getUserMedia` via `canvas.captureStream()`) fails 9 of 14 cases:

1. **Capture-ready wait never resolves** — `Page.wait_for_function: Timeout 30000ms exceeded` on capture, retake, and rear-camera-selection tests. Whatever the app waits on before enabling the shutter button (a video frame becoming available) doesn't fire against the mocked `captureStream()` source in headless Playwright — needs investigation into whether this is a real timing bug against a live camera too, or specific to the mock.
2. **Dynamic import fails against the built app** — `TypeError: Importing a module script failed` on `await import('/src/storage.js')` inside `page.evaluate()`, used by the offline-persistence and JSON-export-roundtrip tests. The e2e fixture serves a production `npm run build` output, where `/src/storage.js` isn't a servable path (bundled/hashed) — this is a test-authoring bug, not an app bug; the test needs to exercise storage through the UI/exposed app API rather than importing source paths that don't exist post-build.

**Next step when picked back up:** fix (1) first since it blocks the actual capture flow in tests; fix (2) is a test-only fix (stop importing `/src/storage.js` directly). Re-run `.venv/bin/pytest tests/e2e/test_photo_camera.py` after both fixes before opening a PR.

---

### IDEA-024 — Engagement/feedback report delivery (Stage 1: signed URL + email)

**Context:** `scripts/engagement_report.py` (shipped) generates a static HTML report over the `feedback`/`engagement` tables, but it's local-only — run by hand with `DATABASE_URL`, opened from disk. No web endpoint exists on purpose (see the script's own docstring: those tables are RLS deny-all with no admin role in the identity model, so a new read endpoint would be an unreviewed admin auth surface).

**Proposed Stage 1 (parked, not yet built):** A scheduled GitHub Action that:
1. Runs the existing script against `DATABASE_URL_ITG` (or prod)
2. Uploads the output HTML to a new, private GCS bucket (not the hosting buckets)
3. Generates a short-lived (~7 day) signed URL — a bearer link, so sharing it with Tim requires no Google account or IAM change on his end, just forwarding the link
4. Emails the link via **Resend** (chosen over an SMTP/Gmail-app-password approach specifically to avoid tying delivery to a personal Gmail account)

**Blocker:** mtb-skills has no registered custom domain — only Google/GitHub-owned subdomains (`*.web.app`, `ashaber.github.io`), none of which Resend can verify DNS ownership of. Decided to start on **Resend's shared onboarding domain**, which only delivers to the account owner's own verified email — good enough for Andrew, not yet for Tim. Revisit once idahomtb.org DNS access is confirmed or a dedicated domain is registered.

**Infra this would need when built** (scoped, not yet created): a new least-privilege GCP service account (`github-reports` — deliberately *not* reusing the `github-deployer` SA, which has `run.admin`/`artifactregistry.writer`/`firebasehosting.admin` this job doesn't need), a new private bucket, a WIF binding for that SA (same OIDC pattern as `scripts/setup-wif.sh`, no static keys), and two new GitHub secrets (`RESEND_API_KEY`, `GCP_REPORTS_SERVICE_ACCOUNT`).

**Stage 2 (bigger, only if Tim/others need regular self-serve access):** a real admin/league-staff-scoped role + `GET /api/admin/engagement` endpoint behind Supabase Auth + RLS, rendered as an actual view in the app — same pattern as the HC/TD dashboard and team switcher, rather than a regenerated static file.

---

### IDEA-023 — Fitness scale to assist with correct group placement

Raw stub — mechanic not yet defined (what scale, where displayed, does it drive ride-group placement or just inform a coach's judgment). Needs a scoping conversation before this is estimable or buildable.

---

### IDEA-025 — About / reference content refresh + EULA

- `public/about.html` "Learn more" content is out of date — needs a content pass, not code.
- Add a EULA/terms section to the about page.
- The Field Guide's "Full written reference" link opening raw Markdown instead of rendered HTML is a real bug, tracked in `DEFECTS.md` D28 (not here — that one has a known cause and fix).

---

### IDEA-026 — Student/parent view

**Parent view:** A parent installs the app and sees only their own student-athlete's data (observations, confirmed levels, trail readiness) — read-only, no roster of other riders.

**Student/athlete view:** Referenced already in `public/about.html`'s FAQ as an external early prototype (healthprof.github.io/mtb_skill_concept) with athlete/coach/head-coach/admin views — this idea is about bringing an athlete-facing view (and now parent report email) into this app itself.

**Why this is the biggest lift on the list, not a quick add:** it's a new persona in the identity model, not a UI feature. It directly collides with [[IDEA-020]]'s PitZone shared-family-email problem — a parent and their student can share one PitZone login, so "parent sees only their kid" requires the same auth_person-style resolution the coach identity model already uses, extended to a role that doesn't exist yet (`person.role` has no `parent`/`athlete-login` value today, and athlete `person` rows are explicitly never linked to a login — see `backend/app/onboarding.py`'s docstring). Needs a real design pass before implementation, not a quick feature branch.

---

### IDEA-027 — Ride-group move request + HC/TD approve workflow

A coach can request to move a rider up or down between ride groups; the app also surfaces recommendations (riders who look mismatched — over- or under-performing for their current group). HC/TD gets accept/reject cards for pending requests.

**Scope:** needs a new data entity (a request/flag, with state: pending/accepted/rejected), new RLS policies for who can create vs. resolve a request, and new UI on both the requesting coach's and the HC/TD's side. Not small — a real feature, not a quick add.

---

### IDEA-028 — League Director / Coach Development Manager (CDM) access

Self-serve league-staff tooling: add teams, configure HC/TD assignments, and (separately, larger) injury stats correlated to skill level and attendance.

**Status of the groundwork:** the design thinking for the first two already exists — [[IDEA-021]] ("league staff & detailed RBAC") named the exact gap: today `league_staff` is **read-only** across every team in their league (`app_caller_league_team_ids()`); there is no league-scoped **write** RLS policy. "Add teams" / "configure HC/TD" both need that write policy built first, then UI on top of it.

**Injury stats correlated to skill/attendance** is a separate, larger item — no injury data model exists at all today; this would be a ground-up feature (new table, new RLS, new UI), not an extension of anything that exists.

**Addendum (2026-08-14):** confirmed as a live, non-speculative gap during pilot roster seeding — Eddie Freyer (Idaho league director, seeded `league_staff`) explicitly wants to add teams himself. Minimum viable scope named: create a team (name only — a team also needs its `league_id`, so "which league" is implicitly part of the same form for a multi-league league_staff) plus assign its first team_director/head_coach by email. Team **renaming** is the same gap from the other direction — there is currently no endpoint to correct a team name once created either (checked `backend/app/routes.py`'s full route list: no PATCH/PUT on `team` exists). Decision for the pilot: handle both by direct DB edit on request (same as this seeding batch) rather than building the feature before kickoff — revisit post-pilot.

---

### IDEA-029 — In-app "how to use the app" guidance for new coaches

Andrew, 2026-08-14: a new coach opening the app for the first time needs to know where to tap and what things do — not just the written About/FAQ page, but something that shows them in the live UI. Tim would likely be the one to build/maintain this content (rubric co-author, not the app's developer), so ease of authoring for a non-engineer matters as much as the tech itself.

**Options, ranked by fit for this app's constraints (offline-first, no new backend/vendor dependency, small bundle):**

1. **Bundle a lightweight tour library, anchor it to the existing `data-a`/`data-m` attributes.** Every clickable element in the app is already tagged for the event-delegation click handlers (`src/main.js`'s `onAppClick`/`onSheetClick`) — a tour library (e.g. **Driver.js**, ~5KB, zero dependencies, or **Shepherd.js**/**Intro.js** if more visual polish is wanted) can point a spotlight/tooltip at those same selectors with very little new markup. Fully self-hosted, works offline, no new vendor account. **Downside:** defining a NEW step (a brand-new tooltip pointing at a brand-new element) needs a developer; Tim couldn't add one from scratch alone.
2. **Split the difference — bundle a tour library, but externalize the step CONTENT** (target selector, title, body text, order) into a small JSON file, the same GitHub-editable-without-a-build pattern `public/rubric.json` and `public/about.html` already use. A developer builds the tour mechanism and the initial step list once; after that, Tim can reorder/reword/retarget existing steps himself via GitHub's web editor, same muscle memory as editing rubric content today. Can't add a step pointing at a UI element that doesn't already have a step without dev help, but everything else is his to own.
3. **No-code SaaS product-tour tool** (Appcues, Userpilot, Chameleon, Pendo, etc.) — the only option where Tim could build an entirely new tour, start to finish, with zero code or GitHub involvement, via a point-and-click editor over the live app. Real tradeoffs: breaks offline-first (these inject a script that fetches tour config over the network), adds a new third-party vendor/data-sharing relationship, and most have a real subscription cost past a small free tier.
4. **Lowest-effort, not interactive:** a short narrated screen recording (Loom or just a phone screen capture) walking through Roster → Practice → Rubric, linked from Settings/About. Zero technical barrier for Tim — record and upload, done — but it's passive video, not something that highlights the live element a coach is actually looking at.

**Recommendation (not yet built):** option 2 — matches the app's existing "structural code + GitHub-editable content" split (`src/rubric.js` vs `public/rubric.json`) instead of introducing a new pattern, keeps the app offline-first, and gives Tim real ongoing ownership of the wording/order without needing a developer for every edit, just for adding an entirely new step.

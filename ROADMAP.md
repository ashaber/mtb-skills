# MTB Skills Assessment App — Roadmap

Phased build plan for a coach-facing skill assessment tool. Each phase is independently usable — coaches can run Phase 1 while Phase 2 is in progress.

---

## Phase 1 — Local HTML App

**Status:** In progress
**Goal:** A working tool any coach can open on any device. No server, no login, no network dependency.

### Features
- **Athlete roster** — add and manage athletes manually in-app
- **Session assessment** — select athlete → select skill → select level 1–5 → log observation
- **Observation history** — chronological log per athlete per skill
- **Confirm skill level** — coach explicitly confirms a level when the consistency gate is met (separate from raw observations). The consistency gate is a coach judgment call, not an algorithm: the rubric defines it as "consistent = earns the level; one good rep does not qualify." The app surfaces the observation history to support that judgment but never auto-promotes a level.
- **Trail readiness view** — given confirmed levels, show which trails the athlete is ready for per the rubric minimums
- **Data export** — full JSON download (backup + shareable with head coach)

### Tech
- Vanilla HTML/CSS/JS, ES modules, no build step
- `localStorage` for persistence
- Data model includes `team_id` and `coach_id` on all records for future-proofing

### Deployment
- GitHub Pages — deploys from `main` branch root (`/`)
- Live at: https://ashaber.github.io/mtb-skills/
- `index.html` at repo root is the entry point
- Updates ship on git push — no build step, no manual deploy action

### Offline
Fully offline by design — no network calls.

### Definition of Done
- [ ] `index.html` at repo root, served by GitHub Pages
- [ ] Live and accessible at https://ashaber.github.io/mtb-skills/
- [ ] Opens and functions on Android (Chrome)
- [ ] Opens and functions on iOS (Safari)
- [ ] Athlete roster: add and manage athletes
- [ ] Session assessment: log observation (athlete → skill → level 1–5 → date)
- [ ] Observation history: chronological log per athlete per skill
- [ ] Confirm skill level: coach explicitly sets confirmed level
- [ ] Trail readiness: computed from confirmed levels, matches rubric minimums
- [ ] JSON export: full data download
- [ ] Data persists across page reloads (localStorage)
- [ ] Works with no network connection
- [ ] All records use UUIDs, carry `team_id` and `coach_id`

---

## Phase 2 — Offline-First PWA + Google Sheets Backend

**Goal:** Team leadership can view all athletes; coaches can work offline and sync when back in range.

### Milestones (in order)

**2a — Roster import from Google Sheet**
Before building full sync, add the ability to load the athlete list from a designated Google Sheet. The local copy is cached for offline use. No auth required if the sheet is publicly readable by link.

**2b — Full Google Sheets backend + OAuth**
- Google OAuth: coaches authenticate, head coach / team director can view the full roster and all assessments
- Observations write to Google Sheets when online; queued locally when offline
- Sync strategy: observations are immutable append-only (no merge conflict); ConfirmedLevel uses last-write-wins
- Data privacy scoped to the team's Google Sheet — no cross-team visibility

**2c — Service worker**
Full PWA: app installs to home screen, works completely offline, syncs on reconnect.

### Architecture note
Team data lives in that team's Google Sheet — not a shared database. This is intentional: a future Phase 4 can add a proper DB without schema changes because the data model already carries `team_id` on every record.

---

## Phase 3 — Native Mobile App

**Goal:** Better UX on iOS and Android; camera access for future video features.

- React Native or Flutter, same data model and business logic
- Native offline storage (SQLite) replacing localStorage
- Sync to Google Sheets (Phase 2) or a proper backend (Phase 4 decision point)

---

## Phase 4 — Multi-Tenant Backend (optional)

**Goal:** League-level visibility; inter-rater reliability tooling.

- PostgreSQL with a `teams` table — existing data model already supports this without migration
- League director visibility across teams
- NICA PitZone integration if their API becomes accessible
- Inter-rater reliability testing between trained coaches

---

## Phase 1+ — Reference Video per Skill Level

**Collaborator:** Tim Curry (co-author of rubric, Assistant Professor of Physiology)

Tim and Andrew shot video of each skill demonstrated at each target level. Editing is partially complete; a second shoot is planned to refine. The feature adds a YouTube-linked reference clip to each rubric card so a coach can watch the skill performed correctly at a specific level.

- Each skill card gets an optional "watch example" link → opens a YouTube clip
- Clips are keyed by `skill + level` — stored in `rubric.js` alongside the rubric content
- No data model change required — this is rubric content, not athlete data
- Does not block Phase 1 — can ship as a rubric content update once clips are ready

## Moonshot — Automated Video Analysis

**Collaborator:** Tim Curry

- Tagged video clips attached to observations
- Automated technique detection (e.g., body position classification from video)
- Data model impact: observations gain an optional `video_url` field — no schema migration needed
- Does not block any earlier phase

---

## Skills Not Yet in Rubric Scope

**Climbing** — excluded from v1 rubric. Climbing is a discrete-technique toolbox rather than a linear step-accumulation progression. To be added as a separate module once the rubric is defined. When added, it extends the app without structural changes.

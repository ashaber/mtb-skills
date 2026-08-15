# MTB Skills Assessment & Trail Readiness

**Live app:** https://ashaber.github.io/mtb-skills/

A coach-facing skill assessment tool for NICA mountain bike coaches. Log observations, confirm skill levels, and know which trails each rider is genuinely ready for — **fully offline, no login required**, with **optional Google sign-in** that adds team visibility (a coach's data syncs to a per-team backend so their head coach and co-coaches can see it). See [Onboarding & team visibility](#onboarding--team-visibility-phase-3).

**Deployed app:** ITG (staging) https://mtb-skills-itg.web.app · Prod https://mtb-skills-prod.web.app

Rubric by Andrew Shaber, Renee Kline & Tim Curry.

## The problem it solves

Ask a coach the skill level of their riders and the answer is almost universally: "They're really fast." That's answering the wrong question.

This rubric gives coaches a shared language for skill — three foundational skills (Body Position, Braking, Cornering) across five levels defined by what breaks, when it breaks, and at what threshold. Skills are not binary. A rider corners at Level 1 seated and looking down; at Level 5 at speed on black-plus terrain with near-zero failure. The rubric measures the full progression.

## Key design principle

The rubric is written from **failure modes** — what breaks, when it breaks, at what threshold — not from teaching points. A coach watching a rider on trail can identify failures faster than they can check for correct technique.

## The scale

| Level | Trail | Consistency |
|-------|-------|-------------|
| 1 | Paved / no rating | Breaks on anything beyond flat |
| 2 | Green ● Easy | Breaks with distraction or challenge |
| 3 | Blue ■ More Difficult | Breaks when over-challenged |
| 4 | Black ◆ Very Difficult | Breaks only at extreme consequence |
| 5 | Dbl Black ◆◆ | Essentially does not break |

Score notation: **Body Position – Braking – Cornering** (e.g. 2-3-2)

Level 5 represents elite skill beyond NICA trail scope. NICA riders ride white, green, blue, and black trails.

## Trail readiness minimums

Minimum skill levels are **floors not ceilings**. A trail's rating reflects its hardest feature — match the minimum to that feature, not just the rating.

| Trail | Min Body Position | Min Braking | Min Cornering |
|-------|-----------------|-------------|---------------|
| Green ● | 2 | 2 | 1 |
| Blue ■ | 3 | 2 | 2 |
| Black ◆ | 3 | 3 | 3 |
| ◆◆ | 4 | 4 | 4 |

Short sections can be speed-managed or walked. Assess at the start of every season — skills regress in the off-season.

## Calibration

- Most student-athletes operate at **Level 1–2**
- **Level 3** is a realistic and meaningful seasonal goal
- **Level 4** is genuinely exceptional
- **Level 5** exceeds what NICA trails require

## App features

### Roster
Add athletes and coaches. Each person has a role (athlete / coach), optional photo, and profile stored locally. Filter the list by role. Coach profile (name, team) set in Settings pre-fills observation records.

### Observations
Tap a level pill (1–5) on any roster row to log an observation immediately — skill, level, and date recorded in one tap. The full rider card shows observation history per skill, a trend sparkline, and the current confirmed level.

### Confirmed levels
Confirming a level is a coach judgment call — the app surfaces observation history to support that judgment but never auto-promotes. One good rep does not confirm a level; consistency does.

### Trail readiness
Computed automatically from confirmed levels against rubric minimums. Each rider's card shows which trails they are ready for and which skills are blocking the next tier. The roster row shows trail readiness at a glance.

### Practice management
Start a practice (coach-initiated, not auto), take attendance (riders sorted to top of roster), run observations during practice, then end practice. Ending practice opens a reflection sheet:
- **Mood** — 5-point scale (😞 to 😊)
- **Reflection** — freeform notes (what went well, what to change)
- **Incidents** — safety concerns, injuries

Reflection is optional — skip ends the practice without saving it. Past practices are viewable from the Practice tab.

### Field Guide
Full rubric reference, browsable offline. All three skills across all five levels — failure modes, level descriptions, terrain context. No network required on trail.

### Athlete trading card
Each rider card includes a QR code. Scan it on another device to instantly import that rider's skill data — no manual entry needed when a rider joins your pod from another coach's roster.

### JSON export / import
Full data backup as a single JSON file. Re-import on any device — all athletes, observations, confirmed levels, and practice records included. Export is in the ⋯ overflow menu and the Settings tab.

### Settings
- Coach profile (name, team)
- QR code for sharing the app URL
- About section with rubric authorship and contact info
- JSON import

## Extended about page

[https://ashaber.github.io/mtb-skills/about.html](https://ashaber.github.io/mtb-skills/about.html)

Full narrative: origin story, rubric design principles, motor learning alignment, trail readiness rationale, FAQ. Editable on GitHub mobile (pencil icon) for quick updates without a terminal.

## Status

- v2.0 rubric presented at IICL Coach Leadership Training, May 2026
- Phase 1 app complete; conference-tested June 2026
- Climbing skill excluded from v1 — to be added as a separate module

## How this was built

Claude Code (Anthropic's coding agent) wrote the majority of the
implementation code. That's stated plainly because the more relevant story
is what the human role was *around* that: **architecture decisions,
security and data-model judgment calls, product scoping, and independent
verification** — the parts that don't get outsourced.

Concretely, that meant:
- **Choosing Postgres Row-Level Security as the actual authorization
  boundary**, not app-layer `if` statements — a decision that shapes the
  entire backend and is verified end-to-end over live HTTP in CI, not
  assumed. See [`docs/architecture/SECURITY.md`](docs/architecture/SECURITY.md).
- **Modeling identity around a real-world constraint**: NICA's user
  registry (PitZone) uses one email per *family*, not per person — a
  parent coach and their student can share a login. The data model
  separates `auth.users` (email) from `person` (role) specifically so a
  shared email can never let a login reach a minor's data, and minors
  never authenticate at all.
- **Scoping a feature request down instead of over-building it**: when
  asked for an engagement/feedback "dashboard," recognized that the
  underlying tables are intentionally deny-all under RLS (this app's
  identity model has no admin role) and shipped a local, service-role
  reporting script instead of inventing an unreviewed admin auth surface
  to expose it on the web.
- **Treating AI-authored pull requests like any other contributor's PR**:
  every PR is reviewed for the actual diff and re-verified by
  independently re-running the test suite from a clean state —
  self-reported pass counts are not trusted as the record of truth.
- **Owning the CI/CD and deploy story**: environment promotion
  (dev → ITG → prod), secret handling, and infrastructure setup are
  human-directed and human-executed, not delegated.

Full architecture (system landscape diagram, database ERD), API reference,
and security/RBAC documentation live in
[`docs/architecture/`](docs/architecture/README.md).

## Roadmap

See [ROADMAP.md](ROADMAP.md) for the full phased plan:
- **Phase 1:** ✅ Local HTML app, localStorage, fully offline
- **Phase 2:** ✅ PWA (installable, offline pre-cache) + Google Sheets / PitZone roster import
- **Phase 3:** ✅ Supabase backend — Google auth, per-team visibility via RLS, roster / practice-attendance / feedback / usage all DB-backed; deployed ITG + prod (Cloud Run + Firebase)
- **Phase 4:** Native mobile (iOS/Android); HubSpot/PitZone deeper integration; access-request self-serve onboarding

## Onboarding & team visibility (Phase 3)

The app is offline-first and works with **no account**. Signing in with Google adds **team visibility**: a coach's roster, observations, confirmed levels, practices, and attendance sync to a FastAPI + Supabase backend, scoped per team by Postgres Row-Level Security — so a head coach and co-coaches see each other's data, and no one sees another team's minors' data. There are two environments: **ITG** (staging) and **Prod**, each a separate Supabase project.

### Onboard a coach (their team is already set up)
1. Open the app URL → **Sign in with Google**.
2. Their Google email is matched to their coach record on the team roster (created by the roster import) and linked automatically — they immediately see their ride group / team.
3. If their email isn't on the roster yet, they see nothing until the head coach imports them (or, once built, an access-request approval).

### Onboard a team
1. The head coach signs in (their coach record must exist — see the new-league seed below for the very first HC).
2. **Settings → import roster** from a PitZone CSV. Records are matched by **email + name together** (PitZone email is family-level and names collide, so both are required); a stable ID column is used when present.
3. Import creates coach + athlete `person` rows. Each coach then signs in and auto-links by email; the head coach can reassign athletes to ride groups from the roster.

### Onboard a new league / the first head coach (one-time SQL seed)
The first head coach per team has no record yet (chicken-and-egg). Seed it once in the Supabase SQL editor for that environment:

```sql
with l as (
  insert into league (id, name) values (gen_random_uuid(), 'League Name') returning id
), t as (
  insert into team (id, league_id, name) select gen_random_uuid(), l.id, 'Team Name' from l returning id
)
insert into person (id, team_id, ride_group_id, role, name, email)
select gen_random_uuid(), t.id, null, 'head_coach', 'Full Name', 'their@email.com' from t;
```

Then that HC signs in → auto-links by email → imports the team roster. **Each league's data is fully isolated by RLS** — a coach in one league never sees another's.

### Scaling past 100 users (OAuth)
Google sign-in runs through the **OAuth consent screen**, not Firebase — Firebase only serves the frontend, so it does not bypass the consent screen's Test-users list. In **Testing** status that list caps at **100 users**. Before the pilot grows, **publish the consent screen** (Google Cloud → APIs & Services → OAuth consent screen → *Publish app*). Sign-in uses only non-sensitive scopes (`openid`, `email`, `profile`), so production publishing needs **no Google verification** and removes the cap — any Google account can then sign in.

### Deployment
- **Frontend** → Firebase Hosting (`deploy-frontend.yml`, per-env sites `mtb-skills-{itg,prod}`).
- **Backend** (FastAPI) → Cloud Run (`deploy-backend.yml`, services `mtb-api-{itg,prod}`), auth via WIF, secrets in Secret Manager.
- **Data** → Supabase Postgres (two projects). Both workflows are `workflow_dispatch`; **`supabase/migrations/*.sql` are applied manually to each Supabase project** (idempotent, in order).

### Stack health check
```bash
bash scripts/ops_check.sh
```
One-shot, read-only check of both itg and prod: frontend reachable, backend alive (`/health`), database reachable (`/health/db` — the practical "is Supabase paused?" signal, since a paused/unreachable DB fails this without needing `/health` itself to go down), and how many commits the deployed backend is behind `origin/main`. No auth/secrets required — everything it checks is a plain HTTP GET against already-public endpoints.

## Development

### Prerequisites

Node 20+ and npm.

```bash
npm install
```

### Dev server

```bash
npm run dev
```

Opens at `http://localhost:5173`. Hot reload on every save.

### Dev server on phone

```bash
npm run dev -- --host
```

Vite prints a **Network** URL (e.g. `http://192.168.1.42:5173`). Open it on any phone on the same WiFi — works for both Android Chrome and iOS Safari.

### Tests

```bash
npm run test          # Vitest unit tests (rubric logic, storage)
npm run test:e2e      # Playwright browser tests (Chromium + WebKit)
npm run test:all      # both
```

### Build

```bash
npm run build         # outputs to dist/
npm run preview       # serve dist/ locally before deploy
```

Phase 1–2 deployed to GitHub Pages automatically on push to `main`. Phase 3 deploys to **Firebase Hosting** (frontend) + **Cloud Run** (backend) per environment — see [Deployment](#deployment) above; both are `workflow_dispatch` (`gh workflow run deploy-frontend.yml -f environment=itg|prod`, likewise `deploy-backend.yml`).

## Alignment

- NICA OTB-101 Manual (2024)
- Fitts and Posner motor learning stages (referenced in NICA coach training)
- IMBA trail difficulty rating system

## Rubric roadmap

- [ ] Incorporate coach feedback from v2.0 presentation
- [ ] Add Climbing skill module
- [ ] Inter-rater reliability testing with trained coaches
- [ ] OTB-201 manual integration for Level 4 cornering detail

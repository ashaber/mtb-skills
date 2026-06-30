# MTB Skills Assessment & Trail Readiness

**Live app:** https://ashaber.github.io/mtb-skills/

A coach-facing skill assessment tool for NICA mountain bike coaches. Log observations, confirm skill levels, and know which trails each rider is genuinely ready for — fully offline, no login required.

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

## Roadmap

See [ROADMAP.md](ROADMAP.md) for the full phased plan:
- **Phase 1:** ✅ Local HTML app, localStorage, fully offline
- **Phase 2:** PWA + Google Sheets backend, offline-first sync, Google OAuth
- **Phase 3:** Native mobile (iOS/Android)
- **Phase 4:** Multi-tenant backend (league-level visibility, NICA/HubSpot/PitZone roster integration)

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

Deploys automatically to GitHub Pages on push to `main` via GitHub Actions.

## Alignment

- NICA OTB-101 Manual (2024)
- Fitts and Posner motor learning stages (referenced in NICA coach training)
- IMBA trail difficulty rating system

## Rubric roadmap

- [ ] Incorporate coach feedback from v2.0 presentation
- [ ] Add Climbing skill module
- [ ] Inter-rater reliability testing with trained coaches
- [ ] OTB-201 manual integration for Level 4 cornering detail

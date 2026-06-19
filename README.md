# MTB Skills Assessment & Trail Readiness

**Live app:** https://ashaber.github.io/mtb-skills/

A practical rubric for NICA mountain bike coaches to assess student-athlete skill levels, select appropriate trails, and set measurable goals.

## What this is

A 1–5 skills assessment rubric across three foundational MTB skills — **Body Position**, **Braking**, and **Cornering** — aligned to trail difficulty ratings (Green/Blue/Black/Double Black).

Built for the [Idaho Interscholastic Cycling League](https://idahomtb.org/) and aligned to NICA OTB-101 and OTB-201 coach training curricula.

**The core problem it solves:** Coaches make trail selection decisions based on memory ("they were really good last season") or fitness ("they're really fast") rather than current, objective skill assessment. This rubric gives coaches a consistent, observable framework.

## Key design principle

The rubric is written from **failure modes** — what breaks, when it breaks, at what threshold — not from teaching points. A coach watching a rider on trail can identify failures faster than they can check for correct technique.

## Outputs

| File | Purpose | Authority |
|------|---------|-----------|
| `MTB_Field_Cards.docx` | Pocket field cards (4"×3.125"), one per skill | **Master** |
| `MTB_Skills_Assessment.docx` | Full reference document with diagnostic detail | Secondary |
| `IICL_Skills_Assessment.pptx` | 7-slide coach leadership presentation | Derived |

**Content changes start with the field cards. The reference doc and presentation derive from card content.**

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

## Trail selection

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

## Status

- v2.0 presented at IICL Coach Leadership Training, May 2026
- Received well — printed cards used as handouts
- Feedback form deployed post-presentation
- Climbing skill excluded from v1 — to be added as separate module

## App Build & Roadmap

A coach-facing assessment tool. Source in `src/`, built with [Vite](https://vitejs.dev/).

**Current status:** Phase 1 ✅ Complete. Live at https://ashaber.github.io/mtb-skills/

For the full phased build plan, see [ROADMAP.md](ROADMAP.md):
- **Phase 1:** ✅ Local HTML app, localStorage, no login, fully offline
- **Phase 2:** PWA + Google Sheets backend, offline-first sync, Google OAuth
- **Phase 3:** Native mobile (iOS/Android)
- **Phase 4:** Multi-tenant backend (optional, league-level)

## Development

### Prerequisites

Node 20+ and npm.

```bash
npm install
```

### Test on your computer

```bash
npm run dev
```

Opens at `http://localhost:5173`. Hot reload on every save.

### Test on your phone

```bash
npm run dev -- --host
```

Vite prints a **Network** URL (e.g. `http://192.168.1.42:5173`). Open it on any phone connected to the same WiFi — no build, no cable needed. Works for both Android Chrome and iOS Safari.

### Run tests

```bash
npm run test          # Vitest unit tests (rubric logic, storage)
pytest tests/e2e/     # Playwright browser tests (requires npm run build first)
```

### Build for production

```bash
npm run build         # outputs to dist/
npm run preview       # serve dist/ locally to verify before deploy
```

## Rubric roadmap

- [ ] Incorporate coach feedback from v2.0 presentation
- [ ] Add Climbing skill module
- [ ] Inter-rater reliability testing with trained coaches
- [ ] OTB-201 manual integration for Level 4 cornering detail

## Alignment

- NICA OTB-101 Manual (2024)
- Fitts and Posner motor learning stages (referenced in NICA coach training)
- IMBA trail difficulty rating system
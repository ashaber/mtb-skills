# Pilot coach-facing docs — source data

Extracted from the actual shipped app/backend behavior (not aspirational) as
of 2026-08-14, for turning into polished coach-facing documents. Each
section below maps to one requested doc.

---

## 1. Team/roster onboarding guide

**Precondition (this is the part that isn't self-serve):** a coach can only
sign in if a `person` row already exists for their exact email, with a
coach role (`league_staff` / `head_coach` / `team_director` / `coach`) and
a team assigned. There's no self-serve "request access" flow. **This is a
one-time bootstrap problem per team, not per coach:**

- **A brand-new team needs exactly one manual seed** — its first head coach
  or team director, matched to team + role by Andrew (or whoever holds
  backend access). Nothing else can happen for that team until this exists.
- **Every other coach on that team does NOT need manual seeding.** Once the
  team's HC/TD is seeded and signs in, they use **Settings → Roster Import
  → Import roster from CSV** (see section 2) with a NICA PitZone **coach**
  roster export — that import creates a `person` row, with email, for every
  coach in the file in one pass. Each of those coaches can then sign in
  themselves; no one has to touch the database for them individually.

So the real one-time manual step is: seed one HC/TD per new team → they
import the rest of their team's coach roster → everyone else self-serves
from there.

**Once seeded, first-login flow for a coach:**
1. Open the app (link/QR from your head coach or team director).
2. Settings tab → Account → **Sign in with Google**.
3. Use the *exact* Google account tied to the email your team was seeded
   with. (If sign-in fails or you land on "not a recognized coach," the
   email your Google account uses doesn't match what was seeded — get the
   correct email added instead of creating a new one.)
4. If you have more than one role (e.g. head coach on one team, coach on
   another), a **team switcher** appears in Settings so you can pick which
   team's roster you're viewing/editing.
5. Tap **Sync now** (or it happens automatically) to pull the shared team
   roster onto your device. From here you can work fully offline — the app
   syncs again automatically next time you're online.

**Without signing in:** the app still works standalone — you can add
athletes, log observations, and run practice entirely on-device, with
nothing shared with your team. Sign-in is what turns on shared/synced
rosters.

---

## 2. Roster import template

Head coaches and team directors only (Settings → Roster Import → **Import
roster from CSV**, after signing in). This bulk-imports many athletes at
once instead of adding them one by one.

**File format: CSV only.** The file picker is hard-restricted to `.csv` —
no `.xlsx`/spreadsheet upload exists. If a template is built in Excel/
Sheets, it must be exported/saved as CSV before a coach can import it.

**Source:** designed around a real **NICA PitZone CSV export** — either the
coach roster export or the athlete roster export. Both work; you upload
whichever one you have. Same importer, same column set, for both files —
the only thing that distinguishes "this is a coach file" from "this is an
athlete file" is whether a Role column is mapped at all (see below).

**Column headers the importer auto-detects** (case-insensitive, matches
common PitZone header wording):

| App field | Header patterns it looks for | Required? | Hand-mappable if auto-detect misses it? |
|---|---|---|---|
| First name | "First Name", "First" | Yes* | Yes |
| Last name | "Last Name", "Last" | Yes* | Yes |
| Email | "Email" | No | Yes |
| Role | "Coach Role", "Role" | No | Yes |
| Ride Group | "Ride Group", "Lead Coach", "Group" | No | Yes |
| Grade | "Grade", "Year" | No | Yes |
| Category | "Racing Category", "Category", "Cat" | No | Yes |
| External ID | "Pit Zone ID", "PitZone ID", "NICA ID", "Registration ID", "External ID", "GUID" | No, but strongly recommended — see below | **No — auto-detect only, no manual dropdown for this field in the mapping UI.** If a template's ID header doesn't match one of the patterns listed, it silently won't map; give the column one of those exact header names. |

*A row with no combined first+last name is silently dropped from the
import, not rejected as an error.

**Role column controls athlete-vs-coach for the WHOLE file, not just a
per-row default:**
- **No Role column mapped at all** → every row in the file imports as
  `athlete`, regardless of any other cell content. This is how an
  athlete-file template should work — it can omit Role entirely.
- **Role column mapped, but a given row's cell is blank** → that row
  imports as `coach` (the fallback for a coach-file row instructor with no
  explicit hc/td marking).
- **Role column mapped, cell contains "hc"** → `head_coach`. Contains
  "td" → `team_director`. Anything else → `coach`.

**No parent/guardian email field exists anywhere in the data model.** This
isn't a template gap — the `person` table itself has no column for it (only
`name`, `email`, `role`, `ride_group`, `grade`, `category`, `external_id`).
A "Parent Email" column in an athlete template today would import and be
silently discarded; the value goes nowhere. Needs a schema change before a
template column would do anything (flagged, not building yet — Andrew,
2026-08-14).

**Why External ID matters:** it's the strongest re-import match key. Without
it, re-importing the same person matches by email+name — usually fine, but
a PitZone ID guarantees no accidental duplicate or merge-into-wrong-person
on a later re-import (e.g. after a name change).

**Flow:** choose file → confirm/adjust the column mapping → preview the
first 5 mapped rows → import. Summary shown afterward: people added,
people updated (matched an existing roster row), ride groups created,
and any skipped rows with a reason (most commonly: blank name).

**Re-importing is safe** — existing observations and confirmed levels are
never touched by a re-import; it only adds/updates the person records.

---

## 3. Coach access / sharing instructions

**Two independent sharing mechanisms — use the right one:**

**A. Team-wide sync (the normal way, once backend access exists)**
- Every coach on the team signs in with Google (their seeded email).
- All roster, observations, and confirmed levels are shared automatically
  between everyone signed in to the same team — no manual hand-off needed.
- Head coaches/team directors additionally get a **Team dashboard**
  (Settings → Team dashboard) — every athlete's ride group, recent
  attendance, and current confirmed level per skill in one table.

**B. One-off athlete card share (works with no sign-in, no network)**
- Open the athlete's full card → **⋯ (3-dot menu)** → **Share card**.
- This generates a QR code for that one athlete's profile + skill data.
- Receiving coach: Roster tab → scan icon → scan the QR. Import is
  instant, fully offline, no account needed.
- Use this for a one-off hand-off (rider joins a clinic group, changes
  pods) when you don't want/need full team sync.

**Access levels:**
| Role | Can do |
|---|---|
| `coach` | Log observations, confirm levels, run practice/attendance for their own ride group |
| `head_coach` / `team_director` | All of the above, plus: Team dashboard, CSV roster import, reassign ride groups |
| `league_staff` | Read-only across every team in the league (no write policy yet — write access is a known gap, not yet built) |

**Losing/switching devices:** sign-in is what makes this device-independent
— sign in on a new device with the same Google account and your team's
data syncs down. Without sign-in, use Settings → Export JSON to manually
back up/move data between devices.

---

## 4. How to rate a skill (quick reference)

**The three foundational skills:** body position, braking, cornering —
each on a 1–5 scale. Body position is the foundation the other two build on.

**Logging an observation (raw data point, timestamped):**
1. Roster tab — each athlete row shows three level pills, one per skill.
2. Tap the pill for the skill you're watching → pick a level 1–5.
3. Done — no form, no stopping. Logged with a timestamp automatically.
4. Tap an athlete's name for their full card: history, trend, full skill
   breakdown per skill.

**Confirming a level (your judgment call, not automatic):**
1. Open the athlete's full card → select the skill → tap **Confirm**.
2. A confirmed level means you've judged the rider *consistently*
   demonstrates that level — not "did it once."
3. The app never auto-promotes a level from observations alone; a
   confirmed level only changes when a coach explicitly confirms it.
4. Trail readiness (which trails a rider is genuinely ready for) is
   computed from the **lowest** confirmed skill across all three —
   updates immediately on confirm.

---

## 5. How to track a practice

1. **Practice tab** → **Start Practice**.
2. **Take Attendance** — toggle each rider present/absent. Present riders
   sort to the top of the Roster tab for the rest of practice, so
   logging observations during the session is fast.
3. Log skill observations from the Roster tab as normal while practice
   runs (see section 4 above) — no separate "practice mode" UI, it's the
   same roster screen.
4. **End Practice** when done. A quick optional sheet lets you:
   - Rate how practice went (😞–😊)
   - Add a reflection note
   - Log any incidents or safety concerns
   All optional — tap **Skip** to close immediately with none of it.
5. **Practice report export** — from an ended practice card in the
   Practice tab, tap the export button to download attendance,
   reflection, and incident notes for that practice as a file.

**Offline:** the entire practice flow — attendance, observations, end-of-
practice reflection — works with zero network. If signed in, everything
syncs to the team automatically next time you're online.

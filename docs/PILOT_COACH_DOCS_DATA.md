# Pilot coach-facing docs — source data

Extracted from the actual shipped app/backend behavior (not aspirational) as
of 2026-08-14, for turning into polished coach-facing documents. Each
section below maps to one requested doc.

---

## 1. Team/roster onboarding guide

**Precondition (this is the part coaches can't self-serve yet):** a coach
can only sign in if a `person` row already exists for their exact email,
with a coach role (`league_staff` / `head_coach` / `team_director` /
`coach`) and a team assigned. There's no self-serve "request access" flow —
Andrew (or whoever holds backend access) has to seed the first `person` row
per coach manually, matched to team + role. This is a one-time step per
coach, done before they ever open the app. Until that row exists, signing
in returns "not a recognized coach."

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

**Source:** designed around a real **NICA PitZone CSV export** — either the
coach roster export or the athlete roster export. Both work; you upload
whichever one you have.

**Column headers the importer auto-detects** (case-insensitive, matches
common PitZone header wording — you can also map columns by hand if
auto-detect misses one):

| App field | Header patterns it looks for | Required? |
|---|---|---|
| First name | "First Name", "First" | Yes (name is required) |
| Last name | "Last Name", "Last" | Yes |
| Email | "Email" | No |
| Role (coach file only) | "Coach Role", "Role" | No — blank = "coach" on a coach file; athlete file rows are always imported as athletes |
| Ride Group | "Ride Group", "Lead Coach", "Group" | No |
| Grade | "Grade", "Year" | No — non-numeric values are dropped, not rejected |
| Category | "Racing Category", "Category", "Cat" | No |
| External ID | "Pit Zone ID", "PitZone ID", "NICA ID", "Registration ID", "External ID", "GUID" | No, but strongly recommended — see below |

**Role values:** a coach-file "Role" cell containing "hc" → head coach,
"td" → team director, anything else → coach.

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

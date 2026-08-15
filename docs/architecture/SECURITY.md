# Security & Privacy Architecture

*Prepared for review with NICA's IT architecture lead and a fractional CTO
ahead of pilot scale-up (2026-08-14 kickoff). Every claim below is grounded
in the actual codebase and live infrastructure at time of writing — checked
against source, migrations, or a live `gcloud`/database query, not inferred
from design docs.*

**Scope:** frontend (PWA), backend API, database, deploy pipeline.
**Environments:** ITG & Prod, both GCP project `mtb-skills-ashaber`.

---

## Posture summary

The core design decision is that **Postgres Row-Level Security is the
authorization boundary, not the API code.** Every request the backend makes
to the database runs as the calling coach's own identity — the API layer
decides *which rows to ask for*, never *which rows the caller is allowed to
see*. A bug in a route handler can return the wrong data shape; it cannot
leak another team's roster, because the database itself refuses the query.
That holds even against an API bug the team hasn't found yet.

---

## Authentication

### Identity provider

**Supabase Auth**, currently Google OAuth only. The frontend never talks to
Google directly — it redirects into Supabase's hosted auth flow, which
issues a signed JWT on success. No password is ever stored or handled by
this application.

### Token verification

Every authenticated API call carries that JWT as a bearer token.
`app.auth.verify_supabase_jwt` checks the signature against Supabase's
published JWKS before anything else runs — an unverified or expired token
is rejected with `401` before touching the database at all. No session
state is kept server-side; the JWT itself, freshly re-verified every
request, is the only source of truth for who's calling.

### What happens on first login

A coach can only be recognized if a `person` row already carries their
exact email — this is the pre-authorization step (a coach is added to the
roster *before* they can sign in, never the reverse). First sign-in links
their verified email to that row via a single, deliberately narrow-scoped
bypass (`app.onboarding.bootstrap_link`) — the only place in the system
permitted to write outside the calling user's own RLS-scoped view, and it
can only read coach-role rows by verified email and insert the link
record. Nothing else uses that path.

The same link step also runs on every `GET /api/me` call, not just a
coach's very first one — so a `person` row added *after* someone's first
sign-in (a second team, a promotion to `league_staff`) gets picked up
automatically the next time the app refreshes identity, rather than
sitting invisible until a manual database fix (`DEFECTS.md` D31).
Deliberately scoped to that one low-frequency endpoint, not the shared
per-request auth dependency every route uses — same narrow-bypass
discipline as the rest of this section, just re-checked more than once.

### How access is actually granted, step by step

A coach's authorization to sign in at all is a single fact: **does a
`person` row exist with this exact email.** Google's OAuth flow
cryptographically proves whoever's signing in controls that inbox — that
part is strong. The chain of who gets to *create* that row, with which
role, is worth walking through explicitly:

1. **Step 0 — bootstrap.** A brand-new team's very first `head_coach`/
   `team_director` has no one above them yet to grant access, so this one
   step is necessarily manual: an admin (today, direct database access)
   seeds that one person by email. Planned: a League Director role does
   this themselves instead (`IDEA-028`/`IDEA-034` in the engineering
   backlog), scoped but not built.
2. **Step 1 — the TD/HC populates the rest of the team.** Once that first
   account can sign in, they use CSV roster import to add everyone else —
   coaches and athletes together, one file. The CSV's own `Role` column is
   what determines the access each imported row gets — `head_coach`/
   `team_director` for full team read/write, `coach` for the importing TD
   to then assign a ride group to.
3. **Step 2 — the TD assigns ride groups.** A `coach`-role row only gets
   scoped access once it has a `ride_group_id` — that assignment, done by
   the TD, is what actually turns "can sign in" into "can see and log
   anything."

**Step 1 is deliberately an admin capability, not an accident.** Head coach
/ team director is the team-scoped admin role — the whole point of the
position is running their own team's roster, which includes deciding who
else on that team gets admin standing. A TD provisioning another TD is the
same category of action as a Workspace admin granting another admin, or an
AWS account owner adding an IAM admin: expected, intended, and exactly the
authority the role is supposed to carry. RLS enforces that scope correctly
— a TD can do this for their own team and nowhere else.

Direct database seeding (step 0 today) is gated only by who holds the
`DATABASE_URL` secret and an authenticated `gcloud` session — effectively
one person right now. Fine at pilot scale; worth a real request/approval
trail once more than one or two people hold that access.

**Net:** the cryptographic parts of authentication are solid, and the admin
delegation model is working as designed. The one polish item, not a gap in
the model itself: the CSV import UI doesn't currently surface a summary of
how many elevated-role rows a file is about to grant, which would make it
easier for a TD to catch their own mistake before submitting — see Open
Items.

### Planned fast-follow: magic link

Email OTP sign-in for coaches without a Google account tied to their email
— several pilot coaches on `@live.com` addresses hit exactly this gap
(confirmed: their Google sign-in never even produced a Supabase session,
not just an email mismatch afterward — no Google account exists for that
address). No backend change required: token verification is already
provider-agnostic. See the engineering backlog (`IDEA-031`) for the full
scope, including the recommended fix for email deliverability (routing
through Resend, already integrated elsewhere in this project).

---

## Authorization — Row-Level Security

How the database itself, not application code, decides what a given coach
can read or write.

```
Browser (PWA)                 Cloud Run API                    Postgres
  holds JWT      ──HTTPS +──▶   verifies signature   ──SET LOCAL──▶  ┌─────────────────────┐
                  Bearer JWT    picks which rows        role         │  ENFORCEMENT BOUNDARY │
                                to ask for            authenticated   │  RLS policy per table │
                                                                      │  decides what's       │
                                                                      │  visible — not the API│
                                                                      └─────────────────────┘
```

The API connects as the pooled role and immediately narrows itself:
`SET LOCAL role authenticated` plus the caller's verified claims
(`request.jwt.claims`), inside the same transaction as the query. Every
policy below reads those claims — the API cannot query outside them even
if a route handler tried to.

### Team isolation

Every table that carries personal data — roster, observations, confirmed
levels, practices, attendance — is scoped by `team_id`/`ride_group_id`
under RLS. A ride-group coach sees their own group; a head coach or team
director sees their whole team; `league_staff` sees read-only across every
team in their league. No role sees across leagues.

### The one deliberate exception

A single connection type, `service_connection`, bypasses RLS — used *only*
by first-login bootstrap, and hard-scoped in code to two operations: read a
coach `person` row by verified email, and insert the auth link. It never
returns athlete data, observations, or confirmed levels to anyone. This is
the one place a reviewer should look closely, and it's small and
single-purpose by design.

### Verified, not asserted

This isn't just a design claim — the test suite includes a dedicated RLS
matrix (`tests/db/`) that runs against a real Postgres instance in CI on
every change, proving cross-team/cross-role denial directly against the
database, not by mocking it.

---

## RBAC — what each role can actually do

Read directly off every RLS policy in the system, table by table. **No
role has a DELETE policy on any of these tables anywhere in the system —
every write is append-or-update only.**

| Table | `coach` | `head_coach` / `team_director` | `league_staff` |
|---|---|---|---|
| Roster (`person`) | Read: own ride group only. Write: none | Read + write: whole team | Read: whole league. Write: none |
| Ride groups | Read: own group only | Read + write: whole team | Read: whole league |
| Observations | Read + write: own group only | Read + write: whole team | Read: whole league |
| Confirmed levels | Read + write: own group only | Read + write: whole team | Read: whole league |
| Practices & attendance | Read + write: own group only | Read + write: whole team | Read: whole league |
| Team / league (names only) | Read: own team's name | Read: own team's name | Read: every team name in league |

### Email is never returned by any API response, to anyone

Checked directly: the roster response shape, the observation/confirmed-
level/practice/attendance shapes, and the caller's own `/api/me` persona
shape — none of them include an `email` field, for any role, including
the caller's own. It isn't hidden by the UI; it isn't in the payload at
all. Email exists in the database purely as the write-side key first-login
matches against — it's never read back out to a client.

### Coach progression levels (L1 → L2 → L3), no app access until promoted

A newer coach (floater/sweep) is a real adult coach, never a student
athlete — but shouldn't have app access at all until promoted, while still
having an email on file so a future re-import matches them instead of
creating a duplicate. Resolved as a dedicated role value rather than a
boolean flag layered onto `role='coach'`:

- **`coach_l1`** — a new role value, left **out** of the backend's
  `COACH_ROLES` allowlist (`backend/app/identity.py`). This is not a new
  pattern — it's the exact mechanism `athlete` already uses to be
  permanently login-ineligible even on an exact email match. The
  email-matching bootstrap query never even sees a `coach_l1` row as a
  candidate — no auth link is ever created, stronger than "signs in but
  RLS shows nothing." `role='coach'` stays an unambiguous "has real
  access" signal for anyone reading the schema later, instead of requiring
  a second flag check everywhere that matters.
- **Promotion to L2** is then just changing that one field —
  `role: coach_l1 → coach` — plus assigning a `ride_group_id`. The same
  roster-edit action HC/TD already has.
- **L2 and L3 get identical access, automatically**, the moment they share
  a `ride_group_id` — RLS scopes coach access by ride-group membership,
  not by seniority. An assistant lead sharing a ride-group assignment
  already has exactly the same read/write as the primary lead — not a
  lesser tier. `ride_group.lead_coach_id` (who's *displayed* as leading)
  is explicitly advisory/cosmetic today, not RLS-enforced, so "becoming
  lead for a practice" is a display update, not an access grant.

Still a real migration (new CHECK constraint value, one line in the
backend's role allowlist) — small, but real. Full detail: `IDEA-033`.

### A second gap worth naming: `league_staff` is always-on for the whole league

There's no request/approval step — a `league_staff` row simply sees every
team in its league, all the time, from creation. A leaner posture for a
large league: league staff sees nothing by default, and requests read
access to a specific team on demand (approved by that team's HC/TD, or
granted permanently once trust is established). Scoped as `IDEA-034` — a
real RLS/schema change (a grant table the SELECT policies would need to
check), not built today.

---

## Attack surface

Every place data crosses a network boundary, broken out by hop.

### Browser ↔ API

| Control | State |
|---|---|
| Transport | HTTPS only (Cloud Run terminates TLS; no plaintext path exists) |
| Auth | Bearer JWT per request, re-verified every time — no cookies, no server session (`allow_credentials=False`) |
| CORS | Explicit origin allowlist per environment — no wildcard |
| Methods / headers | Restricted to `GET/POST/PATCH/DELETE/OPTIONS` and `Authorization`/`Content-Type` only |

### API ↔ Database

| Control | State |
|---|---|
| Transport | Supabase's pooled connection (TLS to managed Postgres, encrypted at rest by the provider) |
| Credentials | `DATABASE_URL` held in GCP Secret Manager, never in source or image layers |
| Authorization | RLS, as above — the API's own connection is never more privileged than the caller |

### Roster CSV import

The file **never transmits to the backend as a file.** Parsing happens
entirely client-side (in the coach's browser); only the already-structured
rows (name, role, email, ride group…) are POSTed as JSON, over the same
authenticated HTTPS channel as every other write. There is no separate
upload endpoint and no object storage (GCS or otherwise) anywhere in the
current system — nothing to intercept in transit beyond standard TLS, and
no server-side file-parsing surface at all.

### Deploy pipeline

GitHub Actions authenticates to GCP via Workload Identity Federation — no
long-lived service-account keys stored anywhere. Both deploy workflows are
manual (`workflow_dispatch`); merging code does not by itself push to
either environment.

---

## Data & PII inventory

What the system actually holds, and where — read directly off the database
schema, not the intended design.

| Field | Whose | Where it lives | Note |
|---|---|---|---|
| Name | Coach & athlete | Backend (synced) | Required |
| Email | Coach only | Backend (synced) | The access-control key — athletes are never linked to a login |
| Grade / racing category | Athlete | Backend (synced) | Optional, from PitZone import |
| Skill ratings & observations | Athlete | Backend (synced) | The core product data |
| Medical notes | Athlete | **Device only** | No column exists on the backend `person` table — confirmed against every migration file. Not "policy says don't sync" — there is architecturally nowhere to send it. |
| Emergency contact name / phone | Athlete | **Device only** | Same as above — captured in-app for on-trail use, never leaves the coach's device |

Phone number is not collected for any coach or athlete. No payment data,
no government ID, no photos are required by the system (an optional local
athlete photo, if a coach adds one, follows the same device-only path as
medical notes).

---

## Open items

What a real external review would flag — listed here first, deliberately,
rather than left for someone else to find.

| Priority | Finding |
|---|---|
| **Highest** | Both Cloud Run services (`mtb-api-itg`, `mtb-api-prod`) currently run as the GCP **default compute service account**, which carries `roles/editor` across the whole GCP project — far more than an API that needs to read two secrets. Not exploited today; the concern is blast radius if the API service itself were ever compromised via an application bug. Fix is well-scoped: a dedicated runtime service account with only `secretmanager.secretAccessor` on the two secrets it actually reads. |
| Gap | No application-level rate limiting. Cloud Run provides infrastructure-level protection, but there's no per-caller throttling on auth or API endpoints yet. |
| Gap | No automated static analysis in CI. No linter is currently wired in for the frontend (a plain undefined-variable bug reached production this way — since fixed, see `DEFECTS.md` D30), and no dependency-vulnerability scan runs automatically for either the JS or Python side. |
| Gap | Deploy service account (`github-deployer`) is broader than strictly needed — holds `run.admin`, `artifactregistry.writer`, `storage.admin`, and hosting admin. Appropriate for a deploy identity generally, not yet audited line by line against least privilege. |
| Nicety | CSV roster import doesn't summarize elevated-role grants before submit. A TD/HC importing a coach roster CSV can grant `head_coach`/`team_director` via that file's Role column — correct admin behavior for their own team (see Authentication, above). A short "this file grants N people admin access" summary before final confirm would just make it easier to catch a typo, not a change to what's allowed. |
| By design | `league_staff` is read-only, on purpose — there is no write RLS policy for that role at all today. A new "league staff" permission level defaults to *no access* until a policy is explicitly written and reviewed, not the other way around. |
| Not yet a target | No third-party penetration test performed yet. Everything above is from internal review of the live system. |

---

## Recommended next steps

Sequenced from what's free and fast to what's worth paying for.

**Now — self-directed:**
- Dependency vulnerability scan (`npm audit`, Python `pip-audit`) — minutes, zero cost
- Wire the existing RLS test matrix and a dependency scan into CI as a required check, not just something that exists
- Fix the runtime service-account scope (above) — the highest-value single change available
- An adversarial code-and-config review focused specifically on attempting RLS bypass, JWT confusion, and CORS/secret misconfiguration — can be run directly against the current codebase

**Before wider scale:**
- A real third-party penetration test or audit — carries credibility internal review can't, and NICA's context (minors, even without medical data) justifies the cost before a full league rollout
- Formalize this document into whatever NICA's IT team already uses for vendor/architecture review, rather than a one-off
- Revisit medical/emergency-contact data *only* if the product ever needs it to sync — right now that's a non-issue by construction, worth keeping that way deliberately

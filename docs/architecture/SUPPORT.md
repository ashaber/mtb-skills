# Support, Operations & Continuity

*Companion to `SECURITY.md` — same audience (NICA's IT architecture lead,
a fractional CTO), same standard: every claim below is checked against the
live system at time of writing (`gcloud`/`gh` queries run 2026-08-15), not
inferred from what the design docs say should be true.*

**Why this document exists now, specifically:** during build-out, this
system's AI coding assistant (Claude Code) has held direct `DATABASE_URL`
access to prod — reasonable while the data was pilot coaches' own
test/seed rows and there was no other operator. That tradeoff stops making
sense the moment real coaches' and athletes' data is the thing on the
other end of that credential. This doc starts with that question because
it's the one that actually changed this week, then covers the operational
maturity questions that follow from it: runbooks, monitoring, scale
limits, and — the one with no good short answer — continuity if Andrew is
unavailable.

---

## The access model — what changes now

**What's been true through build-out:** `DATABASE_URL_PROD` (and `_ITG`)
have been supplied directly into agent shell sessions repeatedly, used for
pilot roster seeding, live defect diagnosis (`DEFECTS.md` D30/D32), and
one data cleanup (an accidentally-imported test-fixture batch). Handling
followed a standing discipline — pull the secret via `gcloud secrets
versions access` straight into a command, never assign it to a variable
that gets echoed or printed — but that discipline protects against
*accidental disclosure in output*, not against the credential having been
*supplied* to an AI agent's session at all, repeatedly, with no distinct
audit identity from Andrew's own `gcloud` login.

**Why that's a real exposure now, not a hypothetical:** every future
conversation with this or any coding agent gets the same standing access
by default unless someone deliberately re-scopes it. There's no MFA on
"the AI's access" — it's whatever the human sharing the terminal chooses
to hand over that session — and the practice of pasting a live prod
credential into a chat transcript is exactly the kind of secret-sprawl
this project's own logging standard ("never log secrets... to stdout")
already treats as a real risk in every other context.

**Recommended, concrete, in order:**

1. **Rotate `DATABASE_URL_PROD`'s password now**, as a clean line between
   "build-phase access" and "production access" — Supabase dashboard:
   Settings → Database → Reset database password, then update the
   `DATABASE_URL_PROD` GCP secret and redeploy. Not urgent-today; genuinely
   worth doing before the next real onboarding wave rather than after.
2. **Stop supplying the raw credential to agent sessions for anything
   beyond a reviewed, checked-in script.** This project already has the
   right shape for this — `scripts/ops_check.sh`, `scripts/
   engagement_report.py`, and `scripts/send_invite.py` are all "an
   operational need became a small script, reviewed via PR like any other
   code change, before it ever touches prod." Extending that same pattern
   to cover ad hoc troubleshooting queries (see the Runbook below) is a
   small, natural next step — not a new discipline, just applying the one
   that already exists more consistently.
3. **Two workable models going forward, either is fine:**
   - **Human-in-the-loop:** an agent drafts the SQL, Andrew reviews and
     runs it himself against prod. The agent never holds the credential.
   - **Script-mediated:** a recurring need becomes a new script instead of
     a one-off command, same PR-review bar as any other change.
4. **ITG stays low-stakes for agent-assisted debugging** — it's synthetic/
   test data by design. Reserve raw prod-credential handling for Andrew
   personally, not for re-authoring ad hoc queries live in a chat session
   against prod each time.

This doesn't mean "an AI agent can never touch prod again" — it means the
same review gate already applied to deploys (a PR, before it reaches prod)
should apply to database operations too, not just application code.

---

## Runbook — first response

### Is anything down?

```bash
bash scripts/ops_check.sh
```
Already built (PR #41) — checks `/health`, `/health/db`, and frontend
reachability for both environments in one pass. This is the fastest "is it
me or is it actually broken" check and should be step 1 for any report.

### Logs

Every request and error is structured JSON to stdout (this project's
global logging standard), so Cloud Run's own log sink already has
everything — no separate log-shipping to set up.

```bash
# Recent errors, prod backend
gcloud logging read \
  'resource.type="cloud_run_revision" resource.labels.service_name="mtb-api-prod" severity>=ERROR' \
  --limit 50 --format json --freshness=1d

# A specific request path (e.g. roster import failures)
gcloud logging read \
  'resource.type="cloud_run_revision" resource.labels.service_name="mtb-api-prod"
   jsonPayload.path="/api/roster/import"' \
  --limit 50 --format json --freshness=6h

# Everything in the last 15 minutes, either env — good for "is this happening right now"
gcloud logging read \
  'resource.type="cloud_run_revision" resource.labels.service_name=~"mtb-api-"' \
  --format json --freshness=15m
```

> **Known gotcha, cost real time earlier this build phase:** filter on
> `jsonPayload.*` fields, not `textPayload` — this app logs structured
> JSON, and querying `textPayload` silently returns nothing even though
> matching log lines exist. Confirmed the hard way during D32's
> investigation.

### Common diagnostic queries

Read-only SQL against `DATABASE_URL` (subject to the access-model section
above — Andrew runs these directly, or they become a script if a pattern
recurs):

```sql
-- Is this person linked to a login yet?
select p.id, p.name, p.role, p.email, ap.auth_user_id
from person p left join auth_person ap on ap.person_id = p.id
where lower(p.email) = lower('coach@example.com');

-- What does this team's roster look like right now?
select id, name, role, ride_group_id, email, created_at
from person where team_id = '<team_id>' order by created_at desc;

-- Recent roster-import activity for a team (newest person rows)
select name, role, email, created_at from person
where team_id = '<team_id>' order by created_at desc limit 25;

-- Recent observations for a ride group (is data actually flowing?)
select athlete_id, skill, level, created_at from observation
where ride_group_id = '<ride_group_id>' order by created_at desc limit 25;
```

### Symptom → likely cause

| Symptom | Check first |
|---|---|
| "Sign-in does nothing" / button appears to hang | Browser console for a JS error (see `DEFECTS.md` D30's exact pattern — an undefined reference silently breaking the click handler); confirm the coach's `person.email` matches their login email exactly, case included |
| "Roster import fails / can't import for that team" | Confirm the importing coach's own row isn't being self-demoted mid-file (`DEFECTS.md` D32's exact mechanism, fixed, but worth re-checking if a *new* variant surfaces); check Cloud Run logs for the specific `psycopg.errors.*` |
| "A coach can't see a team/role they should have" | `DEFECTS.md` D31's fix means this now self-resolves on their next app open/sync (`GET /api/me` re-links); if it's been days and it's still missing, check `auth_person` directly |
| "App shows stale data after a fix went out" | PWA service-worker cache on the coach's device, not a server issue — confirmed pattern this build phase (Michael's post-deploy retry). Have them force-refresh / reinstall. |
| Everything looks fine in logs but a coach reports an error | Ask for the in-app feedback submission or a screenshot — `src/log.js`'s ring buffer is exportable from the coach's own device and often has the client-side context server logs don't |

### Escalation

Today: there is exactly one person who can act on any of the above —
Andrew. See **Bus factor**, below — this is the runbook's biggest actual
gap, not a missing query.

---

## Monitoring — current state and roadmap

**Current state: manual only.** `scripts/ops_check.sh`, run by hand. No
alerting, no dashboard, no automatic notification of an outage — the first
signal today is a coach reporting it. Confirmed zero uptime checks and
zero alerting policies configured on the GCP project as of this writing.

**Roadmap, phased by cost:**

- **Phase A — now, free, ~10 minutes of console work:** a GCP Cloud
  Monitoring uptime check on `/health` for both `mtb-api-itg` and
  `mtb-api-prod`, plus an alerting policy on Cloud Run 5xx rate, with a
  notification channel to Andrew (and a designated backup, once named —
  see Bus factor). Also enable Supabase's own built-in project alerts
  (paused-project, approaching-quota) in each project's dashboard — these
  exist today and aren't turned on. This is the single cheapest, highest-
  leverage gap to close in this whole document.
- **Phase B:** a lightweight status signal beyond "Andrew's phone" — even
  just a scheduled GitHub Action running `ops_check.sh` and posting to
  email/Slack on failure, no new vendor required.
- **Phase C, only if/when it earns its cost:** real error tracking
  (frontend JS exceptions + backend exceptions) via something like
  Sentry's free tier — trades "error rate went up" for an actual stack
  trace. Worth it once there are enough concurrent users that "ask the
  affected coach to export their log" stops being fast enough.

None of Phase A–C is built today.

---

## Scale limits — where free tier throttles, blocks, or starts charging

Confirmed this session: **billing is already enabled** on the GCP project
(`mtb-skills-ashaber`). That matters — it means GCP/Cloud Run resources
**do not block** at a free-tier boundary, they simply start billing
per-use beyond the included monthly allotment. Supabase's model is the
opposite: its free tier is a hard cap, not a metered overage — hitting it
means degraded/blocked service, not a surprise invoice, until someone
manually upgrades the plan.

| Resource | Free-tier shape (verify current numbers before relying on them — these shift) | What happens at the limit |
|---|---|---|
| Supabase DB size | Free tier has a hard storage cap (historically ~500MB) | New writes can start failing; no automatic overage billing — requires a manual plan upgrade (Pro, historically ~$25/mo) |
| Supabase Auth MAU | Free tier has a monthly-active-user cap on Auth | New sign-ins beyond the cap can be blocked until upgrade — worth watching specifically, since this app's growth model is literally "every coach, eventually every athlete, is a MAU" |
| Supabase project pause | Already documented (`PHASE3_INFRA_SETUP.md`) — pauses after ~1 week fully idle | Not a real risk once real traffic exists; only bites a quiet ITG project between test sessions |
| Cloud Run | Free tier = a monthly allotment of requests/vCPU-seconds/memory-GB-seconds, then pay-as-you-go (billing already on) | No block — just starts costing real money past the free allotment. At this app's traffic (scale-to-zero, low request volume), likely negligible for a long time |
| Firebase Hosting | Generous free tier (storage + daily transfer) | Unlikely to bottleneck a PWA this size |
| GitHub Actions | Metered minutes on the free plan for a private repo (historically 2,000 min/month, resets monthly) | At current CI runtime (~10 min/PR, a few PRs/day), comfortably within free minutes for a long time — but a real, if distant, limit once release cadence rises |

**Practical read:** the first ceiling this project is actually likely to
hit, in order, is **Supabase's Auth MAU cap or DB size** — well before
Cloud Run cost becomes meaningful, well before GitHub Actions minutes
matter at all. Worth checking Supabase's dashboard usage panel
periodically as real onboarding continues, rather than waiting to be
surprised by it.

---

## When to move the database to GCP Cloud SQL (Postgres)

**The RLS/authorization model is more portable than it might look.** RLS
policies here don't lean on anything Supabase-proprietary for their actual
logic — they read `current_setting('request.jwt.claims')`, which *this
app itself* sets via `SET LOCAL role authenticated` + `set_config(...)`
inside `app.db.rls_connection`, not something Supabase injects behind the
scenes. The one Supabase-specific piece the policies touch is `auth.uid()`
— a one-line helper Supabase provisions that reads that same claims
setting — trivially reimplementable as a plain SQL function on any
Postgres. **This was a deliberate, good architectural choice** and is why
a database migration, on its own, is a smaller lift than it sounds.

**What's genuinely NOT portable, and is the real cost:** Supabase's hosted
**Auth** service (GoTrue) — Google OAuth flow management, magic-link email
sending, JWT issuance/rotation, the `auth.users` table and session
lifecycle. Moving the *database* to Cloud SQL doesn't remove the need for
an identity provider; it means bringing your own (Firebase Auth / Google
Identity Platform, or a self-rolled OAuth+JWT issuer). **This is the bulk
of a real migration's effort — not the Postgres engine swap itself.**

Other real, smaller costs: the data migration itself is low-risk (both
sides are plain Postgres — `pg_dump`/restore, not a schema translation);
losing Supabase's included automatic backups/point-in-time recovery
(Cloud SQL has its own, configured and billed separately); losing the
Supabase dashboard's SQL/table editor convenience for Andrew's own direct
access, in exchange for GCP's own tooling.

What it buys, if and when it's worth it: **one IAM boundary** instead of
two separate vendor consoles (directly answers "stronger IAM"); likely
**better latency** (Cloud SQL in the same GCP region/VPC as Cloud Run, no
cross-vendor network hop); **one bill**; and it removes Supabase's
free-tier caps entirely (Cloud SQL scales by instance size, not a MAU/DB-
size cliff).

**Recommended trigger — not urgency.** Not worth it at pilot or even
single-league scale. Worth a real evaluation when *either*:
- Supabase's free tier is actually being hit (DB size or Auth MAU — see
  above) and Supabase Pro no longer feels like the simpler answer than
  migrating, **or**
- A real compliance/IAM-consolidation requirement shows up independent of
  raw scale — e.g., NICA's board or an insurer wants everything under one
  auditable IAM boundary given this system holds minors' data.

Until either triggers, staying on managed Supabase is the right call —
Cloud SQL is *also* a managed service, so choosing it later isn't a
self-hosting move, just a vendor-consolidation one, consistent with this
project's standing "stay managed" instinct.

---

## Other bottlenecks and scale limits on the horizon

- **Cloud Run cold starts.** Scale-to-zero means the first request after
  idle pays a container-boot penalty (typically low seconds for a small
  FastAPI image, but real) — a coach's first sync of a practice day could
  feel slow. Cheap mitigation later, not worth it yet at pilot traffic: a
  minimum-instance-count of 1 (small always-on cost) if this becomes a
  real complaint.
- **Single-region deployment** (`us-central1`, confirmed both Cloud Run
  services). Fine while usage is Mountain-time/Idaho-centered; only worth
  revisiting if NICA leagues genuinely spread coast-to-coast with
  latency-sensitive usage — unlikely given this app's actual usage
  pattern (infrequent syncs, not real-time).
- **The default-compute-service-account IAM gap** (already `SECURITY.md`'s
  highest-priority open item — confirmed still true this session: both
  Cloud Run services run as `899076610571-compute@...` with
  `roles/editor` project-wide). This matters *more*, not less, given this
  document's own IAM-consolidation conversation — fix it before adding
  more people or services to this GCP project, not after.
- **Deploy is fully manual** (`workflow_dispatch` on both environments,
  confirmed). Fine at today's release cadence. The previously-planned
  split — merge to `main` auto-deploys ITG, prod stays a gated manual
  promote (already the target described in this project's own CLAUDE.md)
  — becomes worth actually building once releases happen more than a
  couple times a week, purely to cut manual toil, not because manual is
  unsafe today.
- **`gh`/GitHub API connectivity flakiness**, observed repeatedly this
  build phase (intermittent "error connecting to api.github.com," always
  resolved by retry). Not a scale limit — just an existing minor
  operational friction worth knowing about rather than mistaking for a
  real outage.

---

## Bus factor — what happens if Andrew is unavailable

**Confirmed directly this session, not assumed:**
- GCP project `mtb-skills-ashaber` has exactly **one** human IAM
  principal — `andrewshaber@gmail.com`, holding `roles/owner`. Every other
  binding is a service account.
- The GitHub repo (`ashaber/mtb-skills`) has exactly **one** collaborator
  — `ashaber`, with admin access. Nobody else can push, review-and-merge,
  or dispatch a deploy.
- Supabase org membership (`andrew@idahomtb.org`) wasn't checked in this
  session (outside this session's own access) but should be assumed
  similarly single-holder unless already confirmed otherwise.

**This is the largest continuity risk in the whole system** — larger than
any single item in `SECURITY.md`'s Open Items table. If Andrew is
unreachable, nobody else can deploy a fix, rotate a credential, resume a
paused Supabase project, or even read the application logs. For a
NICA-adjacent tool that will hold minors' data, this isn't a hypothetical
edge case to defer — it's the one open item in this whole document with
no purely-technical fix.

**Recommended, sequenced by cost and urgency:**

1. **Today, free, highest leverage in this entire document:** add a
   second human `roles/owner` on the GCP project —
   ```bash
   gcloud projects add-iam-policy-binding mtb-skills-ashaber \
     --member="user:<successor-email>" --role="roles/owner"
   ```
   and a second admin collaborator on the GitHub repo (Settings →
   Collaborators). A natural first candidate: whoever holds the fractional-
   CTO role already reviewing this doc package, or a technically literate
   NICA board member. This alone turns "one point of failure" into "two,"
   at zero cost.
2. **Today, free:** add a second admin to the `andrew@idahomtb.org`
   Supabase organization (Team settings, in the Supabase dashboard) — same
   reasoning, same urgency.
3. **Soon:** move whatever this system depends on that currently lives in
   Andrew's personal password manager into a vault a designated successor
   can reach under a defined trigger. Most password managers have a
   built-in "emergency access"/legacy-contact feature built for exactly
   this — it doesn't require handing over day-to-day access, only a
   break-glass path.
4. **Formalize, doesn't need to be elaborate:** a short, separate note —
   deliberately **not** committed to this public-ish repo — naming who
   currently holds access to what, where the emergency-access trigger
   lives, and who NICA's board would contact. This document names the
   *categories* of access that need a successor; the specific "here is the
   current successor and how to reach them" belongs wherever NICA already
   tracks key-person risk for its other vendors, not duplicated in git
   history.
5. **Longer term, already on record:** `PHASE3_INFRA_SETUP.md`'s own
   "future cleanup" note — moving GCP ownership under the 501(c)3's
   Google for Nonprofits account rather than Andrew's personal one — is
   itself a bus-factor fix (institutional ownership, not individual). This
   conversation is a reason to prioritize that sooner than "someday."

**The good news, worth stating plainly:** the docs/architecture package
itself (`SECURITY.md`, `ARCHITECTURE.md`, `API.md`, this document) is
already the single biggest *technical-knowledge* bus-factor mitigation in
place — a second admin added per step 1 above could genuinely stand this
system back up from these docs alone. Keeping them current, already this
project's stated norm (`docs/architecture/README.md`: "treat drift here
the same as a failing test"), *is* the continuity plan for institutional
knowledge. The IAM/access items above are what's still missing —
knowledge isn't the gap here, access is.

---

## Recommended next steps

Sequenced the same way as `SECURITY.md`'s own recommendations, for the
same reason: cheapest/fastest first.

**This week, free:**
- Add a second GCP project owner + second GitHub admin — the single
  highest-leverage action in this document (Bus factor, step 1)
- Add a second Supabase org admin (Bus factor, step 2)
- Rotate `DATABASE_URL_PROD`'s password; stop supplying raw prod
  credentials to agent sessions for anything beyond a reviewed script
  (Access model, above)
- Turn on a GCP uptime check + basic 5xx alerting policy for both
  environments (Monitoring Phase A) — closes the "first we hear of an
  outage is a coach complaining" gap

**Before wider scale:**
- Fix the default-compute-service-account IAM gap (`SECURITY.md`'s
  highest-priority open item) — before, not after, adding more people or
  services to this GCP project
- Decide and document a real "who gets paged" answer beyond "Andrew," even
  if that's still Andrew today with an explicit named backup
- Revisit the GCP-under-nonprofit-account migration already planned in
  `PHASE3_INFRA_SETUP.md` — ties directly into the ownership-consolidation
  story here

**Only if/when a concrete trigger hits** (see Scale limits / Cloud SQL,
above), not preemptively:
- Supabase Pro tier, or the Cloud SQL migration

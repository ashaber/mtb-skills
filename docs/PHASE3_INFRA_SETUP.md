# Phase 3 — Infrastructure Setup Runbook

One-time setup Andrew runs to stand up the ITG + prod stack for the team-visibility backend. Companion to `docs/PHASE3_TEAM_VISIBILITY_PLAN.md`. Patterned on `swim-coach` (`backend/README.md`, `deploy-backend.yml`), adjusted to a true two-environment (ITG/prod) stack.

> **Can I reuse swim-coach's setup?** No, not the WIF binding or Supabase — see "Reuse vs. new" below. Yes for your gcloud login and billing account.

## Reuse vs. new (answers to the obvious questions)

| Thing | swim-coach has it | For mtb-skills |
|---|---|---|
| gcloud auth / billing account | ✅ | **Reuse** your login + billing |
| GCP **project** | `open-swim-coach-ashaber` | **New, dedicated** project recommended (isolation for minors' data; own IAM/blast-radius). Reuse is possible but namespace everything. |
| **WIF** provider/binding | bound to `ashaber/swim-coach` | **New** — a provider is pinned to one repo; must add an `ashaber/mtb-skills` binding |
| **Supabase** project | swim-coach's | **New ×2** (itg + prod) — a project is one app's schema+RLS |
| **Anthropic** API key | used for coach-chat | **Not needed** — this backend has no LLM |
| **Google OAuth** client | swim-coach's client id | **New** client (its own authorized origins/redirects); becomes this app's `VITE_GOOGLE_CLIENT_ID` |
| Artifact Registry / Cloud Run / Firebase Hosting | swim-coach's | **New**, mtb-namespaced |

## Account ownership (decided 2026-08)

Resources are split across two Google accounts:

| Layer | Account | Why |
|---|---|---|
| **Supabase** (ITG + prod) | **`andrew@idahomtb.org`** (the 501(c)3) | fresh free-tier 2-project allotment; nonprofit infra under the nonprofit account (step 4) |
| **GCP + Firebase** (WIF, Cloud Run, Firebase Hosting, Artifact Registry) | personal (`mtb-skills-ashaber`) **for now** | already stood up; **future cleanup:** move under the org via Google for Nonprofits (also brings GCP credits). Do NOT block the pilot on this. |
| **Google OAuth client** | wherever the GCP project lives (step 6) | client id is public; account owning it doesn't affect coaches |

## The values you'll end up with (fill these in as you go)

| GitHub setting (per the deploy workflows) | Kind | Value |
|---|---|---|
| `GCP_PROJECT_ID` | secret | `mtb-skills-ashaber` (or your choice) |
| `GCP_WORKLOAD_IDENTITY_PROVIDER` | secret | `projects/<PROJECT_NUMBER>/locations/global/workloadIdentityPools/github-pool/providers/github-provider` |
| `GCP_SERVICE_ACCOUNT` | secret | `github-deployer@<PROJECT_ID>.iam.gserviceaccount.com` |
| `VITE_GOOGLE_CLIENT_ID` | **variable** (public) | `<clientid>.apps.googleusercontent.com` |
| `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` | **variables**, per env | from the `andrew@idahomtb.org` Supabase projects (step 4) |

---

## 0. Prereqs

```bash
gcloud components update            # or install the Cloud SDK
gcloud auth login
# shell vars used throughout — edit these two:
export PROJECT_ID=mtb-skills-ashaber
export REGION=us-central1
export REPO=ashaber/mtb-skills
```

---

## 1. GCP project + APIs

```bash
gcloud projects create "$PROJECT_ID" --name="MTB Skills"
gcloud billing projects link "$PROJECT_ID" --billing-account="$(gcloud billing accounts list --format='value(name)' | head -1)"
gcloud config set project "$PROJECT_ID"
export PROJECT_NUMBER=$(gcloud projects describe "$PROJECT_ID" --format='value(projectNumber)')

gcloud services enable \
  run.googleapis.com artifactregistry.googleapis.com \
  secretmanager.googleapis.com iamcredentials.googleapis.com \
  sts.googleapis.com storage.googleapis.com --project "$PROJECT_ID"
```

## 2. Artifact Registry (Docker images)

```bash
gcloud artifacts repositories create mtb-skills-repo \
  --repository-format=docker --location="$REGION" --project "$PROJECT_ID"
```

## 3. Workload Identity Federation (this is the part you couldn't remember)

Lets the `ashaber/mtb-skills` GitHub repo deploy without a long-lived key.

```bash
# Pool
gcloud iam workload-identity-pools create github-pool \
  --location=global --project "$PROJECT_ID" --display-name="GitHub Actions"

# OIDC provider — attribute-condition pins it to THIS repo (why swim-coach's can't be shared)
gcloud iam workload-identity-pools providers create-oidc github-provider \
  --location=global --workload-identity-pool=github-pool --project "$PROJECT_ID" \
  --issuer-uri="https://token.actions.githubusercontent.com" \
  --attribute-mapping="google.subject=assertion.sub,attribute.repository=assertion.repository" \
  --attribute-condition="assertion.repository=='${REPO}'"

# Deployer service account
gcloud iam service-accounts create github-deployer \
  --project "$PROJECT_ID" --display-name="GitHub Deployer"
export SA="github-deployer@${PROJECT_ID}.iam.gserviceaccount.com"

# Roles the deploy workflow needs
for ROLE in roles/run.admin roles/artifactregistry.writer \
            roles/iam.serviceAccountUser roles/secretmanager.secretAccessor \
            roles/firebasehosting.admin; do
  gcloud projects add-iam-policy-binding "$PROJECT_ID" --member="serviceAccount:${SA}" --role="$ROLE"
done

# Let the repo impersonate the SA via WIF
gcloud iam service-accounts add-iam-policy-binding "$SA" --project "$PROJECT_ID" \
  --role=roles/iam.workloadIdentityUser \
  --member="principalSet://iam.googleapis.com/projects/${PROJECT_NUMBER}/locations/global/workloadIdentityPools/github-pool/attribute.repository/${REPO}"

# The two GitHub-secret values:
echo "GCP_SERVICE_ACCOUNT = $SA"
echo "GCP_WORKLOAD_IDENTITY_PROVIDER = projects/${PROJECT_NUMBER}/locations/global/workloadIdentityPools/github-pool/providers/github-provider"
```

## 4. Supabase — two projects (ITG + prod) under the 501(c)3 account

> **Account choice (decided 2026-08):** Supabase for mtb-skills lives under the
> **nonprofit's** Google account — **`andrew@idahomtb.org`** — NOT the personal
> account that hosts swim-coach. Two reasons: (1) the free tier allows 2 projects
> per account, and the personal account's slots are already partly used by
> swim-coach; a fresh account gives a clean 2-project allotment for `mtb-itg` +
> `mtb-prod`. (2) A 501(c)3's infrastructure belongs under the org's account for
> ownership, accounting, and handoff — independent of the free-tier math.
>
> Everything downstream (project names, connection strings, secrets) is identical
> regardless of which account owns it — only the login differs.

### 4a. Create the account + organization
1. Sign out of any personal Supabase session (or use a separate browser profile / incognito to avoid clashing with the swim-coach account).
2. Go to https://supabase.com → **Sign in with Google** → choose **`andrew@idahomtb.org`**.
3. On first sign-in Supabase creates an **organization**. Name it e.g. **`Idaho MTB`** (Free plan). This org's free tier is what gives the 2 projects.
   - Optional: **Organization → Team → invite** your personal gmail as a member so you can administer both without switching accounts. (Ownership stays with the org account.)

### 4b. Create the two projects
In the `Idaho MTB` org, **New project** twice (same region as GCP — `us-central1` ≈ Supabase **`us-central1` / Iowa**, keeps DB↔Cloud Run latency low):

| Project name | Role | DB password |
|---|---|---|
| `mtb-itg`  | staging | generate a strong one, save it |
| `mtb-prod` | production | generate a **different** strong one, save it |

Save both DB passwords in your password manager — Supabase shows the password only at creation time; you can reset it later under Settings → Database, but the connection strings embed it.

### 4c. Per project — collect strings, enable auth, migrate
For **each** of `mtb-itg` and `mtb-prod`:

1. **Connection strings** — click the green **`Connect`** button at the top of the dashboard (the strings moved out of Settings into this dialog). Supabase's pooler is branded **"Supavisor"**; both strings you need have `pooler.supabase.com` in the host:
   - **Transaction pooler** (port `6543`) → **app traffic / `DATABASE_URL`** (step 5). `postgresql://postgres.<ref>:<pw>@aws-0-<region>.pooler.supabase.com:6543/postgres`
   - **Session pooler** (port `5432`) → **migrations only** (step 4c.4; IPv4, handles DDL).
   - Substitute your DB password for `[YOUR-PASSWORD]` (reset under Settings → Database → Database password if lost). *Ignore the `db.<ref>.supabase.co` **direct** string — it's IPv6-only.*
2. **Project URL + anon key** (Settings → API) → become `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` for that env (GitHub Environment `itg` / `prod`, step 9).
   - itg: https://ccnjlamsvbaivoozupls.supabase.co/sb_publishable_-6NUmKe3cAPsvSVMw1iEGQ_zJRbBdPu
   - prod:  https://ppjswjfrhaadgdeqezev.supabase.co/sb_publishable_j1s0wFpJIwfg4yaBpcMlPA_EZ7dJglX
3. **Enable Google auth** (Authentication → Providers → Google → enable). Data flows **both ways** across this form:
   - **Google → Supabase:** paste the **Client ID** + **Client Secret** from your step-6 OAuth client into the top two fields.
   - **Supabase → Google:** Supabase *generates* a **Callback URL** (`https://<ref>.supabase.co/auth/v1/callback`, shown at the bottom of the form). **Copy it** and add it to the step-6 OAuth client's **Authorized redirect URIs**, then Save the Google client.
   - Save the Supabase form. Repeat for the other project — its callback URL has a different `<ref>`, and it *also* goes into the same one OAuth client's redirect URIs (so the client ends up listing both). *(Supabase-Auth path — see the note at the bottom.)*
4. **Run migrations.** Use the **session pooler** string (port **5432** on `<region>.pooler.supabase.com`) — it handles DDL and is IPv4 (Supabase's true direct `db.<ref>.supabase.co:5432` is IPv6-only without the paid add-on). Do **not** use the transaction pooler (6543) for migrations.
   ```bash
   DIRECT_URL='postgresql://postgres.<ref>:<pw>@<region>.pooler.supabase.com:5432/postgres'
   for f in supabase/migrations/*.sql; do psql "$DIRECT_URL" -v ON_ERROR_STOP=1 -f "$f"; done
   ```
   Apply only `supabase/migrations/*.sql` — **not** `tests/db/setup_test_auth.sql` (that's a test-only shim; Supabase provides the real `auth.uid()`).

   > **Expected (not an error):** `0002_rls.sql` prints `NOTICE: policy "…" does not exist, skipping` on a first apply — that's the idempotent `DROP POLICY IF EXISTS` finding nothing to drop before the `CREATE POLICY` that follows. `ON_ERROR_STOP=1` halts only on a real `ERROR:`. Verify success with:
   > ```sql
   > select tablename, rowsecurity from pg_tables where schemaname='public';   -- 7 tables, rls = true
   > select count(*) from pg_policies where schemaname='public';               -- ~15 policies
   > ```

   > **If `psql` errors with "install at least one postgresql-client-<version> package"** (a WSL/Debian `pg_wrapper` stub with no real client): either `sudo apt-get update && sudo apt-get install -y postgresql-client`, **or** run it through the Docker image you already have —
   > ```bash
   > for f in supabase/migrations/*.sql; do docker run --rm -i postgres:16 psql "$DIRECT_URL" -v ON_ERROR_STOP=1 < "$f"; done
   > ```
   > **or** just paste the two files into the Supabase **SQL Editor** and Run (zero local tooling).

   (CI's `db` job runs the same migrations against a throwaway `postgres:16` on every push, so they apply cleanly there too.)

### 4d. Record which strings feed which secret/variable
- `mtb-itg` **pooler** URL → `DATABASE_URL_ITG` secret (step 5)
- `mtb-prod` **pooler** URL → `DATABASE_URL_PROD` secret (step 5)
- each project's **URL + anon key** → `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` in the matching GitHub Environment (step 9)

> **Free-tier note:** unused free projects **pause after ~1 week idle**. During the pilot both stay active from real traffic; if `mtb-itg` ever pauses between test sessions, open its dashboard to resume (a few seconds). Not a concern for `mtb-prod` once teams are live.

### 4e. Enable magic-link (email OTP) sign-in

**Why:** several pilot coaches on `@live.com`/`outlook.com` addresses get
nothing from "Sign in with Google" — a Microsoft-family email isn't
automatically a Google identity, so the OAuth popup has no account to
authenticate against (`IDEA-031`). Magic link sidesteps that entirely: no
third-party account required, just a real inbox. The app code for this
already shipped (`src/auth.js`'s `signInWithMagicLink`, the Settings →
Account email input, and `scripts/send_invite.py` for admin-triggered
sends) — what's left is dashboard config on each Supabase project, plus
validating the whole path end to end before inviting a real coach.

**i. Enable the provider + redirect URLs** (for **each** of `mtb-itg` and
`mtb-prod`, same "per project" pattern as step 4c):

1. **Authentication → Providers → Email.** Confirm it's enabled (usually
   on by default). **Confirmed 2026-08-15: there is no separate "enable
   magic link/OTP" toggle** on the current dashboard — the Email provider
   being on is what enables `signInWithOtp()` (the call
   `signInWithMagicLink` makes), full stop. The "OTP" fields on this same
   page (OTP length / expiry, "min chars") tune the *numeric-code* variant
   of this same flow (a 6-digit code instead of a clickable link) — they
   don't gate anything and don't apply to what this app sends, since
   `signInWithMagicLink` passes `emailRedirectTo`, which selects the
   clickable-link email template instead. Safe to leave those at their
   defaults; don't go looking for a toggle that isn't there.
2. **Authentication → URL Configuration → Redirect URLs.** Add the same
   origins already there for Google (the `*.web.app` site for that
   env) — magic link uses the identical `emailRedirectTo` mechanism, so if
   Google sign-in already redirects correctly for this project, the
   allowlist entry likely already covers it; add it only if missing.

**ii. Custom SMTP (deliverability — do this before inviting a real coach,
not after):**

Until custom SMTP is configured, magic-link emails send from Supabase's
own shared, rate-limited sending domain and often land in spam. Configure
under **Authentication → Settings → SMTP Settings** (toggle "Enable Custom
SMTP", then host/port/user/password/sender fields) using whichever
provider you choose — no app code change is needed when this is turned
on; `signInWithMagicLink` and `scripts/send_invite.py` both already call
the one Supabase endpoint that starts using the new SMTP automatically.

> **Known blocker, carried over from `IDEA-024`:** a real SMTP provider
> (Resend or otherwise) needs a verified sending domain, and this project
> doesn't have a registered custom domain today — only Google/GitHub-owned
> subdomains (`*.web.app`, `ashaber.github.io`), none of which a mail
> provider can verify DNS ownership of. Until that's resolved, coaches
> should expect to check spam for the sign-in email. Not a blocker to
> *testing* the flow (below) — only to it looking polished for real
> coaches.

**iii. Validate end to end, on ITG first, with a real non-Google inbox:**

1. **Create a test account you don't already have.** A free
   `outlook.com`/`live.com` signup (https://signup.live.com) reproduces
   the exact gap pilot coaches hit; an existing personal Microsoft 365
   address works too if you have one. Either way, use an inbox that has
   genuinely never touched Google sign-in, so this is a real test of the
   gap, not just of the button existing.
2. **Seed a matching `person` row on ITG** — same direct-database-access
   pattern as any other pilot seeding this project has done (hold
   `DATABASE_URL_ITG` only in a variable passed straight to `psql`/your
   client, never echoed or exported — this project's standing secret
   discipline). Pick (or reuse) a test team/ride group rather than a real
   one:
   ```sql
   insert into person (id, team_id, ride_group_id, role, name, email)
   values (gen_random_uuid(), '<a test team_id>', '<a test ride_group_id>',
           'coach', 'Magic Link Test', '<your new live.com/outlook.com address>');
   ```
3. **Try the self-serve button first:** open the ITG app URL, Settings →
   Account, enter the test email, tap "Email me a sign-in link." Check the
   inbox (and spam) for the email, click the link, confirm it lands back
   in the app signed in as the "Magic Link Test" persona.
4. **Then try the admin-invite script**, same target email, to confirm
   that path independently:
   ```bash
   DATABASE_URL='<ITG DATABASE_URL>' \
   SUPABASE_URL='<ITG VITE_SUPABASE_URL>' \
   SUPABASE_ANON_KEY='<ITG VITE_SUPABASE_ANON_KEY>' \
       python scripts/send_invite.py '<your test address>'
   ```
   Confirms the script's own DB safety check (only sends to an existing
   `COACH_ROLES` `person` row) and that it produces the identical email/
   flow as step 3, just admin-triggered instead of self-serve.
5. **Only after both pass on ITG**, repeat the dashboard config (i–ii) on
   `mtb-prod` and invite real `@live.com` pilot coaches
   (`dcacioppo@live.com`, `j_fiedler@live.com` — see `IDEA-031`) — either
   have them use the self-serve button themselves, or run
   `scripts/send_invite.py` against their already-seeded `person` rows.

## 5. Secret Manager (per env)

This backend needs only the DB URL and a session-signing secret — **no `ANTHROPIC_API_KEY`** (no LLM), unlike swim-coach.

**Scripted (idempotent, safe re-run):**
```bash
PROJECT_ID=mtb-skills-ashaber \
ITG_POOLER_URL='<mtb-itg transaction pooler, :6543>' \
PROD_POOLER_URL='<mtb-prod transaction pooler, :6543>' \
  bash scripts/setup-secrets.sh
```
(Creates the four secrets; leaves any that already exist untouched — it will **not** regenerate a `SESSION_SECRET` on re-run, which would log everyone out. Note: app traffic uses the **transaction** pooler `:6543`, unlike migrations which use the session pooler `:5432`.)

**Manual equivalent:**
```bash
# DB pooler URL, one secret per env
printf '%s' "$ITG_POOLER_URL"  | gcloud secrets create DATABASE_URL_ITG  --data-file=- --project "$PROJECT_ID"
printf '%s' "$PROD_POOLER_URL" | gcloud secrets create DATABASE_URL_PROD --data-file=- --project "$PROJECT_ID"

# Random secret the backend uses to sign its session tokens (per env)
printf '%s' "$(openssl rand -hex 32)" | gcloud secrets create SESSION_SECRET_ITG  --data-file=- --project "$PROJECT_ID"
printf '%s' "$(openssl rand -hex 32)" | gcloud secrets create SESSION_SECRET_PROD --data-file=- --project "$PROJECT_ID"
```
(`GOOGLE_CLIENT_ID` is **not** a secret — it's the public `VITE_GOOGLE_CLIENT_ID`, passed as a plain env var.)

## 6. Google OAuth client (new — becomes VITE_GOOGLE_CLIENT_ID)

> **No new GCP project needed.** The OAuth client is owned by the project you
> created in step 1 (`mtb-skills-ashaber`). There is also no separate "API" to
> enable — basic Google Sign-In (OIDC) uses only the `email`/`profile`/`openid`
> scopes. The one prerequisite step 6a below (the consent screen) is the "app"
> registration that owns the credential.

### 6a. Configure the OAuth consent screen (prerequisite — do this first)
GCP Console → **APIs & Services → OAuth consent screen** (newer console: **Google Auth Platform → Get started**), for project `mtb-skills-ashaber`:
- **User type: External** — coaches are ordinary Google users, not members of a Workspace org.
- **App name:** e.g. `Idaho MTB Skills` (this is what coaches see on the Google sign-in screen). **User support email** + developer contact: your email. *(These are pulled from the account owning the GCP project — personal, for now; a nonprofit address is a nice-to-have, not a blocker.)*
- **Scopes:** add only the non-sensitive basics — `openid`, `.../auth/userinfo.email`, `.../auth/userinfo.profile`. (Supabase's Google provider requests exactly these.)
- **Publishing status → Publish to Production.** Because the app uses **only non-sensitive scopes**, publishing needs **no Google verification** and shows coaches **no "unverified app" warning** — the smooth pilot path, with no per-user test list.
  - *Alternative:* leave it in **Testing** and add each coach's Google email as a **test user** (cap 100) if you deliberately want a closed login list. More friction; only pick this if you want the allowlist.

### 6b. Create the client
> **One client serves BOTH environments — do not create a separate client per env.** You register both envs' origins and both Supabase callbacks on this single client, and both Supabase projects use the same client id + secret. (`VITE_GOOGLE_CLIENT_ID` is therefore one repo-level variable, same value for both builds.) A stricter shop splits into two clients for blast-radius isolation; unnecessary for the pilot.

GCP Console → **APIs & Services → Credentials → Create Credentials → OAuth client ID → Web application**:
- **Authorized JavaScript origins:** `http://localhost:5173`, and the two Firebase URLs `https://mtb-skills-itg.web.app` / `https://mtb-skills-prod.web.app` (step 7 — add these once the sites exist; localhost alone is enough to start).
- **Authorized redirect URIs:** *both* Supabase projects' callbacks: `https://<itg-ref>.supabase.co/auth/v1/callback` and `https://<prod-ref>.supabase.co/auth/v1/callback` (Supabase-Auth path — the refs come from step 4).
- Copy the **client id** → `VITE_GOOGLE_CLIENT_ID` (GitHub repo **variable**); paste **id + secret** into *each* Supabase project's Google provider (step 4c.3).

### The env topology (why the counts differ)
> **One GCP/Firebase project holds the whole stack for BOTH envs.** Firebase Hosting sites (`mtb-skills-itg/-prod`), Cloud Run services (`mtb-api-itg/-prod`), and secrets (`..._ITG/_PROD`) live in the single project `mtb-skills-ashaber`, separated by **naming**, not by separate projects. The OAuth client is shared too (above).
>
> **The ITG↔prod isolation boundary is the two Supabase projects** — two separate databases, so staging never touches real minors' data. That's the separation that matters; hosting both envs in one project is fine and cost-effective for a pilot.
>
> Summary: **1 GCP/Firebase project · 1 OAuth client · 2 Firebase Hosting sites · 2 Cloud Run services · 2 Supabase projects.**

> **Ordering note:** 6b's redirect URIs need the Supabase project refs (step 4), and step 4c.3's "enable Google auth" needs this client's id+secret. So the clean order is: **step 4a/4b (create Supabase projects) → step 6 (consent screen + client) → finish step 4c.3 (paste id+secret into Supabase)**.

## 7. Firebase Hosting for the frontend (HTTPS, one site per env)

> **Why not GCS:** a raw GCS bucket website endpoint serves **HTTP only** (HTTPS needs a load balancer + cert + domain), and Google OAuth requires **HTTPS** origins — so coaches couldn't sign in. **Firebase Hosting** gives HTTPS out of the box, SPA rewrites, and a `*.web.app` domain for free, with no LB/domain setup. It attaches to the **same GCP project**, so the "1 project" model holds; two Hosting **sites** give the two envs.

### 7a. Attach Firebase + create the two sites
```bash
npm i -g firebase-tools            # or prefix commands with: npx firebase-tools
firebase login                     # the account that owns the GCP project (personal, for now)

firebase projects:addfirebase "$PROJECT_ID"     # add Firebase to the existing GCP project

# Two Hosting sites. The site id IS the .web.app subdomain — globally unique,
# so adjust if taken. These become your two frontend URLs.
firebase hosting:sites:create mtb-skills-itg  --project "$PROJECT_ID"
firebase hosting:sites:create mtb-skills-prod --project "$PROJECT_ID"
# -> https://mtb-skills-itg.web.app   and   https://mtb-skills-prod.web.app
```
(Hosting multisite is available on the free **Spark** plan — no billing upgrade needed for the pilot.)

### 7b. `firebase.json` (repo root) — SPA rewrites + per-env targets
```json
{
  "hosting": [
    { "target": "itg",  "public": "dist",
      "ignore": ["firebase.json", "**/.*", "**/node_modules/**"],
      "rewrites": [{ "source": "**", "destination": "/index.html" }] },
    { "target": "prod", "public": "dist",
      "ignore": ["firebase.json", "**/.*", "**/node_modules/**"],
      "rewrites": [{ "source": "**", "destination": "/index.html" }] }
  ]
}
```
Map targets → sites (writes `.firebaserc`):
```bash
firebase target:apply hosting itg  mtb-skills-itg  --project "$PROJECT_ID"
firebase target:apply hosting prod mtb-skills-prod --project "$PROJECT_ID"
```

### 7c. Deploy (CI does this per env via WIF; manual form:)
```bash
npm run build
firebase deploy --only hosting:itg --project "$PROJECT_ID"     # or hosting:prod
```

> **These two `https://mtb-skills-{itg,prod}.web.app` URLs are what you add** to the OAuth client's JavaScript origins (step 6b) and to each Cloud Run service's `ALLOWED_ORIGINS` (step 8). Add them to the OAuth client once the sites exist — editing the client anytime is fine.
>
> **CI note:** the deploy workflow authenticates with the WIF service account, so that SA needs `roles/firebasehosting.admin` — already included in `scripts/setup-wif.sh` (re-run it once to pick up the role if you ran an earlier version).

## 8. Cloud Run services

Created on first deploy by CI (`.github/workflows/deploy-backend.yml`, built in increment 3.0). Each env's service (`mtb-api-itg`, `mtb-api-prod`) runs `min-instances=0`, `--allow-unauthenticated`, with:
- env vars: `GOOGLE_CLIENT_ID=$VITE_GOOGLE_CLIENT_ID`, `ALLOWED_ORIGINS=https://mtb-skills-<env>.web.app` (that env's Firebase URL), `STORE_BACKEND=db`
- secrets: `DATABASE_URL=DATABASE_URL_<ENV>:latest`, `SESSION_SECRET=SESSION_SECRET_<ENV>:latest`

## 9. GitHub repo config (Settings → Secrets and variables → Actions)

- **Secrets:** `GCP_PROJECT_ID`, `GCP_WORKLOAD_IDENTITY_PROVIDER`, `GCP_SERVICE_ACCOUNT` (from step 3).
- **Variables:** `VITE_GOOGLE_CLIENT_ID` (public), plus per-env `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` (from step 4c/4d). Use GitHub **Environments** (`itg`, `prod`) to scope the per-env values.

---

## ⚠️ One architecture decision to confirm before increment 3.1

This runbook is written for the **Supabase-Auth + RLS** path (Google login handled by Supabase Auth; authz enforced by Postgres Row-Level Security keyed off `auth.uid()`). That's a **deliberate divergence from swim-coach**, which rolls its own Google-token verification and enforces authz in FastAPI app code with Supabase-as-plain-Postgres.

**Recommendation: take the RLS path** for this app — multi-tenant *minors'* data warrants DB-enforced authorization (a backstop if app code has a bug), and it means less custom token code. The trade is a divergence from swim-coach's exact pattern.

If you'd rather mirror swim-coach exactly (app-layer authz, backend verifies Google ID-token `aud`, no `auth.uid()` RLS): the GCP/WIF/Firebase/Cloud Run steps above are **identical**; only two things change — skip the Supabase Google-provider enable (step 4c.3) and the OAuth redirect URIs become the app origins (GIS ID-token flow) rather than the Supabase callback. This decision affects increment 3.1's backend code, **not** the 3.0 infra, so setup can proceed either way.

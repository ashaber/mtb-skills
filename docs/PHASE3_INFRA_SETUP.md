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
| Artifact Registry / Cloud Run / GCS | swim-coach's | **New**, mtb-namespaced |

## Account ownership (decided 2026-08)

Resources are split across two Google accounts:

| Layer | Account | Why |
|---|---|---|
| **Supabase** (ITG + prod) | **`andrew@idahomtb.org`** (the 501(c)3) | fresh free-tier 2-project allotment; nonprofit infra under the nonprofit account (step 4) |
| **GCP** (WIF, Cloud Run, GCS, Artifact Registry) | personal (`mtb-skills-ashaber`) **for now** | already stood up; **future cleanup:** move under the org via Google for Nonprofits (also brings GCP credits). Do NOT block the pilot on this. |
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
            roles/storage.admin; do
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

1. **Connection strings** (Project Settings → Database → Connection string):
   - **Transaction pooler** (port `6543`) → app traffic. `postgresql://postgres.<ref>:<pw>@<region>.pooler.supabase.com:6543/postgres`
   - **Direct** (port `5432`) → migrations/DDL only.
2. **Project URL + anon key** (Settings → API) → become `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` for that env (GitHub Environment `itg` / `prod`, step 9).
3. **Enable Google auth** (Authentication → Providers → Google → enable): paste the OAuth **client id + secret** from step 6. Add this project's callback `https://<ref>.supabase.co/auth/v1/callback` to the OAuth client's redirect URIs (step 6). *(Supabase-Auth path — see the note at the bottom.)*
4. **Run migrations** against the **direct** URL:
   ```bash
   DIRECT_URL='postgresql://postgres.<ref>:<pw>@<region>.pooler.supabase.com:5432/postgres'
   for f in supabase/migrations/*.sql; do psql "$DIRECT_URL" -v ON_ERROR_STOP=1 -f "$f"; done
   ```
   (CI's `db` job runs the same migrations against a throwaway `postgres:16` on every push, so this should apply cleanly.)

### 4d. Record which strings feed which secret/variable
- `mtb-itg` **pooler** URL → `DATABASE_URL_ITG` secret (step 5)
- `mtb-prod` **pooler** URL → `DATABASE_URL_PROD` secret (step 5)
- each project's **URL + anon key** → `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` in the matching GitHub Environment (step 9)

> **Free-tier note:** unused free projects **pause after ~1 week idle**. During the pilot both stay active from real traffic; if `mtb-itg` ever pauses between test sessions, open its dashboard to resume (a few seconds). Not a concern for `mtb-prod` once teams are live.

## 5. Secret Manager (per env)

This backend needs only the DB URL and a session-signing secret — **no `ANTHROPIC_API_KEY`** (no LLM), unlike swim-coach.

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

GCP Console → APIs & Services → Credentials → **Create OAuth client ID** → Web application:
- **Authorized JavaScript origins:** `http://localhost:5173`, the ITG GCS URL, the prod GCS URL (step 7).
- **Authorized redirect URIs:** each Supabase project's callback: `https://<itg-ref>.supabase.co/auth/v1/callback` and `https://<prod-ref>.supabase.co/auth/v1/callback` (Supabase-Auth path).
- Copy the **client id** → `VITE_GOOGLE_CLIENT_ID` (GitHub repo **variable**); paste **id + secret** into each Supabase project's Google provider (step 4.2).

## 7. GCS buckets for the frontend (one per env)

```bash
for ENV in itg prod; do
  gcloud storage buckets create gs://mtb-web-$ENV --project "$PROJECT_ID" --location="$REGION" --uniform-bucket-level-access
  gcloud storage buckets update gs://mtb-web-$ENV --web-main-page-suffix=index.html --web-error-page=index.html   # SPA fallback
  gcloud storage buckets add-iam-policy-binding gs://mtb-web-$ENV --member=allUsers --role=roles/storage.objectViewer
done
```
(Public read for a static site. Front with an HTTPS load balancer + custom domain when ready; bucket website endpoint is fine for the pilot.)

## 8. Cloud Run services

Created on first deploy by CI (`.github/workflows/deploy-backend.yml`, built in increment 3.0). Each env's service (`mtb-api-itg`, `mtb-api-prod`) runs `min-instances=0`, `--allow-unauthenticated`, with:
- env vars: `GOOGLE_CLIENT_ID=$VITE_GOOGLE_CLIENT_ID`, `ALLOWED_ORIGINS=<that env's GCS URL>`, `STORE_BACKEND=db`
- secrets: `DATABASE_URL=DATABASE_URL_<ENV>:latest`, `SESSION_SECRET=SESSION_SECRET_<ENV>:latest`

## 9. GitHub repo config (Settings → Secrets and variables → Actions)

- **Secrets:** `GCP_PROJECT_ID`, `GCP_WORKLOAD_IDENTITY_PROVIDER`, `GCP_SERVICE_ACCOUNT` (from step 3).
- **Variables:** `VITE_GOOGLE_CLIENT_ID` (public), plus per-env `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` (from step 4.3). Use GitHub **Environments** (`itg`, `prod`) to scope the per-env values.

---

## ⚠️ One architecture decision to confirm before increment 3.1

This runbook is written for the **Supabase-Auth + RLS** path (Google login handled by Supabase Auth; authz enforced by Postgres Row-Level Security keyed off `auth.uid()`). That's a **deliberate divergence from swim-coach**, which rolls its own Google-token verification and enforces authz in FastAPI app code with Supabase-as-plain-Postgres.

**Recommendation: take the RLS path** for this app — multi-tenant *minors'* data warrants DB-enforced authorization (a backstop if app code has a bug), and it means less custom token code. The trade is a divergence from swim-coach's exact pattern.

If you'd rather mirror swim-coach exactly (app-layer authz, backend verifies Google ID-token `aud`, no `auth.uid()` RLS): the GCP/WIF/bucket/Cloud Run steps above are **identical**; only two things change — skip the Supabase Google-provider enable (step 4.2) and the OAuth redirect URIs become the app origins (GIS ID-token flow) rather than the Supabase callback. This decision affects increment 3.1's backend code, **not** the 3.0 infra, so setup can proceed either way.

#!/usr/bin/env bash
#
# setup-wif.sh — Step 3 of docs/PHASE3_INFRA_SETUP.md, as an idempotent script.
#
# Creates the Workload Identity Federation binding that lets the
# ashaber/mtb-skills GitHub repo deploy to Cloud Run / GCS without a
# long-lived key. Safe to re-run: every create is guarded by an existence
# check, and the IAM bindings are idempotent by nature.
#
# Prereqs (steps 0-1 of the runbook): `gcloud auth login`, the project exists,
# and these APIs are enabled: iamcredentials, sts, run, artifactregistry,
# secretmanager, storage. This script verifies the two WIF-critical ones.
#
# Usage:
#   PROJECT_ID=mtb-skills-ashaber REGION=us-central1 REPO=ashaber/mtb-skills \
#     bash scripts/setup-wif.sh
#
#   # optionally also write the two values straight into the repo's Actions secrets:
#   ... bash scripts/setup-wif.sh --set-github-secrets
#
set -euo pipefail

SET_SECRETS=0
[ "${1:-}" = "--set-github-secrets" ] && SET_SECRETS=1

: "${PROJECT_ID:?set PROJECT_ID (e.g. mtb-skills-ashaber)}"
: "${REPO:?set REPO (e.g. ashaber/mtb-skills)}"
REGION="${REGION:-us-central1}"
POOL=github-pool
PROVIDER=github-provider
command -v gcloud >/dev/null || { echo "gcloud not found — install the Cloud SDK" >&2; exit 1; }

# GCP IAM is eventually consistent: a just-created service account can 404 in
# add-iam-policy-binding for a few seconds. Retry such calls with backoff.
retry() {
  local n=0 max=8
  until "$@"; do
    n=$((n + 1))
    [ "$n" -ge "$max" ] && { echo "[wif] gave up after $max attempts: $*" >&2; return 1; }
    echo "    (propagation delay — retry $n/$max in 5s...)" >&2
    sleep 5
  done
}

echo "[wif] project=$PROJECT_ID repo=$REPO"
PROJECT_NUMBER="$(gcloud projects describe "$PROJECT_ID" --format='value(projectNumber)')"
SA="github-deployer@${PROJECT_ID}.iam.gserviceaccount.com"

# 0. sanity: the two APIs WIF cannot work without (step 1 enables all of them)
for api in iamcredentials.googleapis.com sts.googleapis.com; do
  if ! gcloud services list --enabled --project "$PROJECT_ID" --format='value(config.name)' | grep -qx "$api"; then
    echo "[wif] enabling $api (was not enabled)"
    gcloud services enable "$api" --project "$PROJECT_ID"
  fi
done

# 1. pool
if gcloud iam workload-identity-pools describe "$POOL" \
     --location=global --project "$PROJECT_ID" >/dev/null 2>&1; then
  echo "[wif] pool '$POOL' exists — skipping"
else
  echo "[wif] creating pool '$POOL'"
  gcloud iam workload-identity-pools create "$POOL" \
    --location=global --project "$PROJECT_ID" --display-name="GitHub Actions"
fi

# 2. OIDC provider — attribute-condition pins it to THIS repo
if gcloud iam workload-identity-pools providers describe "$PROVIDER" \
     --location=global --workload-identity-pool="$POOL" --project "$PROJECT_ID" >/dev/null 2>&1; then
  echo "[wif] provider '$PROVIDER' exists — skipping (if the repo condition changed, re-run with 'update-oidc' manually)"
else
  echo "[wif] creating OIDC provider '$PROVIDER' pinned to repo '$REPO'"
  gcloud iam workload-identity-pools providers create-oidc "$PROVIDER" \
    --location=global --workload-identity-pool="$POOL" --project "$PROJECT_ID" \
    --issuer-uri="https://token.actions.githubusercontent.com" \
    --attribute-mapping="google.subject=assertion.sub,attribute.repository=assertion.repository" \
    --attribute-condition="assertion.repository=='${REPO}'"
fi

# 3. deployer service account
if gcloud iam service-accounts describe "$SA" --project "$PROJECT_ID" >/dev/null 2>&1; then
  echo "[wif] service account '$SA' exists — skipping"
else
  echo "[wif] creating service account 'github-deployer'"
  gcloud iam service-accounts create github-deployer \
    --project "$PROJECT_ID" --display-name="GitHub Deployer"
fi

# 3b. wait for the SA to be visible before granting it anything (see retry()).
echo "[wif] waiting for service account to propagate..."
retry gcloud iam service-accounts describe "$SA" --project "$PROJECT_ID" >/dev/null

# 4. roles the deploy workflows need (add-iam-policy-binding is idempotent;
#    retried because the SA can still 404 in the policy system briefly)
echo "[wif] granting deploy roles to $SA"
for ROLE in roles/run.admin roles/artifactregistry.writer \
            roles/iam.serviceAccountUser roles/secretmanager.secretAccessor \
            roles/storage.admin; do
  retry gcloud projects add-iam-policy-binding "$PROJECT_ID" \
    --member="serviceAccount:${SA}" --role="$ROLE" --condition=None >/dev/null
  echo "    + $ROLE"
done

# 5. let the repo impersonate the SA via WIF (idempotent)
echo "[wif] binding repo '$REPO' -> impersonate $SA"
retry gcloud iam service-accounts add-iam-policy-binding "$SA" --project "$PROJECT_ID" \
  --role=roles/iam.workloadIdentityUser \
  --member="principalSet://iam.googleapis.com/projects/${PROJECT_NUMBER}/locations/global/workloadIdentityPools/${POOL}/attribute.repository/${REPO}" \
  >/dev/null

PROVIDER_RESOURCE="projects/${PROJECT_NUMBER}/locations/global/workloadIdentityPools/${POOL}/providers/${PROVIDER}"

echo
echo "================ GitHub Actions secrets ================"
echo "GCP_PROJECT_ID                 = ${PROJECT_ID}"
echo "GCP_SERVICE_ACCOUNT            = ${SA}"
echo "GCP_WORKLOAD_IDENTITY_PROVIDER = ${PROVIDER_RESOURCE}"
echo "========================================================"

if [ "$SET_SECRETS" = 1 ]; then
  command -v gh >/dev/null || { echo "gh not found — cannot set secrets" >&2; exit 1; }
  echo "[wif] writing the three secrets into $REPO via gh"
  gh secret set GCP_PROJECT_ID                 --repo "$REPO" --body "$PROJECT_ID"
  gh secret set GCP_SERVICE_ACCOUNT            --repo "$REPO" --body "$SA"
  gh secret set GCP_WORKLOAD_IDENTITY_PROVIDER --repo "$REPO" --body "$PROVIDER_RESOURCE"
  echo "[wif] done — secrets set."
else
  echo "[wif] add these under Settings -> Secrets and variables -> Actions -> Secrets,"
  echo "      or re-run with --set-github-secrets to have gh set them for you."
fi

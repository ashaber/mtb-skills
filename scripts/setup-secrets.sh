#!/usr/bin/env bash
#
# setup-secrets.sh — Step 5 of docs/PHASE3_INFRA_SETUP.md.
#
# Creates the four Secret Manager secrets the backend needs, per env:
#   DATABASE_URL_ITG / DATABASE_URL_PROD   — Supabase transaction-pooler URLs
#   SESSION_SECRET_ITG / SESSION_SECRET_PROD — random token-signing secrets
#
# Idempotent + SAFE to re-run:
#   - a secret that already exists is LEFT AS-IS (never overwritten). This
#     matters especially for SESSION_SECRET — rotating it would invalidate
#     every logged-in coach's session. Rotate deliberately with:
#       gcloud secrets versions add <NAME> --data-file=- --project <PROJECT_ID>
#
# This backend has NO Anthropic key (no LLM), unlike swim-coach.
#
# Usage:
#   PROJECT_ID=mtb-skills-ashaber \
#   ITG_POOLER_URL='postgresql://postgres.<itg-ref>:<pw>@<region>.pooler.supabase.com:6543/postgres' \
#   PROD_POOLER_URL='postgresql://postgres.<prod-ref>:<pw>@<region>.pooler.supabase.com:6543/postgres' \
#     bash scripts/setup-secrets.sh
#
set -euo pipefail

: "${PROJECT_ID:?set PROJECT_ID (e.g. mtb-skills-ashaber)}"
: "${ITG_POOLER_URL:?set ITG_POOLER_URL (Supabase mtb-itg transaction pooler, port 6543)}"
: "${PROD_POOLER_URL:?set PROD_POOLER_URL (Supabase mtb-prod transaction pooler, port 6543)}"
command -v gcloud  >/dev/null || { echo "gcloud not found" >&2; exit 1; }
command -v openssl >/dev/null || { echo "openssl not found" >&2; exit 1; }

# Soft guard: the APP must use the TRANSACTION POOLER (port 6543), not the
# direct connection (5432). Warn, don't block, in case of an intentional edge.
for pair in "ITG:$ITG_POOLER_URL" "PROD:$PROD_POOLER_URL"; do
  env="${pair%%:*}"; url="${pair#*:}"
  case "$url" in
    *:6543/*) : ;;
    *:5432/*) echo "[secrets] WARNING: $env URL uses :5432 (direct). App traffic wants the :6543 transaction pooler — see runbook step 4c.1." >&2 ;;
    *)        echo "[secrets] WARNING: $env URL has no obvious :6543 pooler port — double-check it." >&2 ;;
  esac
done

# create if absent; leave untouched if present.
ensure_secret() {   # $1 = name, $2 = value
  if gcloud secrets describe "$1" --project "$PROJECT_ID" >/dev/null 2>&1; then
    echo "  = $1 exists — left as-is (rotate: gcloud secrets versions add $1 --data-file=- --project $PROJECT_ID)"
  else
    printf '%s' "$2" | gcloud secrets create "$1" \
      --data-file=- --replication-policy=automatic --project "$PROJECT_ID" >/dev/null
    echo "  + created $1"
  fi
}

echo "[secrets] project=$PROJECT_ID"
ensure_secret DATABASE_URL_ITG    "$ITG_POOLER_URL"
ensure_secret DATABASE_URL_PROD   "$PROD_POOLER_URL"
ensure_secret SESSION_SECRET_ITG  "$(openssl rand -hex 32)"
ensure_secret SESSION_SECRET_PROD "$(openssl rand -hex 32)"

echo "[secrets] done. The Cloud Run deploy (step 8 / deploy-backend.yml) mounts these as:"
echo "          DATABASE_URL=DATABASE_URL_<ENV>:latest, SESSION_SECRET=SESSION_SECRET_<ENV>:latest"

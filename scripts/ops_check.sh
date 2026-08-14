#!/usr/bin/env bash
# Point-in-time stack health check for itg + prod: frontend reachable,
# backend alive, backend DB reachable (this is also the practical signal
# for "Supabase is paused" -- a paused project fails the DB connect the
# same way a network partition would), and how far each env's deployed
# commit is behind origin/main. Read-only, no secrets needed -- everything
# here is a plain HTTP GET against already-public endpoints.
#
# Usage: bash scripts/ops_check.sh

set -uo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

FRONTEND_ITG="https://mtb-skills-itg.web.app"
FRONTEND_PROD="https://mtb-skills-prod.web.app"
BACKEND_ITG="https://mtb-api-itg-899076610571.us-central1.run.app"
BACKEND_PROD="https://mtb-api-prod-899076610571.us-central1.run.app"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
NC='\033[0m'

ok()   { echo -e "  ${GREEN}OK${NC}    $1"; }
bad()  { echo -e "  ${RED}FAIL${NC}  $1"; }
warn() { echo -e "  ${YELLOW}WARN${NC}  $1"; }

git -C "${REPO_ROOT}" fetch origin main --quiet 2>/dev/null
MAIN_SHA="$(git -C "${REPO_ROOT}" rev-parse origin/main 2>/dev/null || echo "")"

check_env() {
    local label="$1" frontend="$2" backend="$3"

    echo "== ${label} =="

    local fe_code
    fe_code="$(curl -s -o /dev/null -w '%{http_code}' --max-time 10 "${frontend}/")"
    if [ "${fe_code}" = "200" ]; then ok "frontend ${frontend} (${fe_code})"; else bad "frontend ${frontend} (${fe_code})"; fi

    local health_code
    health_code="$(curl -s -o /dev/null -w '%{http_code}' --max-time 10 "${backend}/health")"
    if [ "${health_code}" = "200" ]; then ok "backend alive (${health_code})"; else bad "backend alive (${health_code})"; fi

    local db_body db_code
    db_body="$(curl -s --max-time 10 "${backend}/health/db")"
    db_code="$(curl -s -o /dev/null -w '%{http_code}' --max-time 10 "${backend}/health/db")"
    if [ "${db_code}" = "200" ]; then
        ok "database reachable (${db_body})"
    else
        bad "database UNREACHABLE -- check if Supabase is paused (${db_code}: ${db_body})"
    fi

    local version_body deployed_sha
    version_body="$(curl -s --max-time 10 "${backend}/version")"
    deployed_sha="$(echo "${version_body}" | grep -o '"commit":"[a-f0-9]*"' | cut -d'"' -f4)"
    if [ -n "${deployed_sha}" ] && [ -n "${MAIN_SHA}" ]; then
        if [ "${deployed_sha}" = "${MAIN_SHA}" ]; then
            ok "deployed commit matches origin/main (${deployed_sha:0:7})"
        else
            local behind
            behind="$(git -C "${REPO_ROOT}" rev-list --count "${deployed_sha}..${MAIN_SHA}" 2>/dev/null || echo "?")"
            warn "deployed ${deployed_sha:0:7}, origin/main is ${MAIN_SHA:0:7} (${behind} commits behind)"
        fi
    else
        warn "could not compare deployed commit (backend said: ${version_body})"
    fi

    echo
}

check_env "ITG"  "${FRONTEND_ITG}"  "${BACKEND_ITG}"
check_env "PROD" "${FRONTEND_PROD}" "${BACKEND_PROD}"

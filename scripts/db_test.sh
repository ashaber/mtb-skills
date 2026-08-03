#!/usr/bin/env bash
# Local runner for the Phase 3.0 DB layer, mirroring the intended CI `db`
# job: spins up postgres:16 in docker, applies the test-only auth shim then
# every supabase/migrations/*.sql in order, re-applies the migrations a
# SECOND time (idempotency check -- must be a clean no-op), grants app_user
# access, then runs tests/db/test_rls.py against it. Tears the container
# down on exit either way. Exits non-zero on any failure.
#
# Usage: bash scripts/db_test.sh

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
VENV_PIP="${REPO_ROOT}/.venv/bin/pip"
VENV_PYTEST="${REPO_ROOT}/.venv/bin/pytest"
CONTAINER_NAME="mtb-db-test-$$"
PG_IMAGE="postgres:16"
PG_USER="postgres"
PG_DB="postgres"

CONTAINER_STARTED=0

cleanup() {
    if [ "${CONTAINER_STARTED}" = "1" ]; then
        echo "[db_test] tearing down ${CONTAINER_NAME}"
        docker rm -f "${CONTAINER_NAME}" >/dev/null 2>&1 || true
    fi
}
trap cleanup EXIT

echo "[db_test] starting ${PG_IMAGE} as ${CONTAINER_NAME}"
docker run -d \
    --name "${CONTAINER_NAME}" \
    -e POSTGRES_USER="${PG_USER}" \
    -e POSTGRES_PASSWORD=postgres \
    -e POSTGRES_DB="${PG_DB}" \
    -e POSTGRES_HOST_AUTH_METHOD=trust \
    -p 127.0.0.1::5432 \
    "${PG_IMAGE}" >/dev/null
CONTAINER_STARTED=1

PG_PORT="$(docker port "${CONTAINER_NAME}" 5432/tcp | head -n1 | cut -d: -f2)"
if [ -z "${PG_PORT}" ]; then
    echo "[db_test] FAIL: could not determine mapped port for ${CONTAINER_NAME}" >&2
    exit 1
fi
echo "[db_test] mapped to host port ${PG_PORT}"

echo "[db_test] waiting for postgres to accept connections..."
READY=0
for _ in $(seq 1 60); do
    if docker exec "${CONTAINER_NAME}" pg_isready -U "${PG_USER}" -d "${PG_DB}" >/dev/null 2>&1; then
        READY=1
        break
    fi
    sleep 1
done
if [ "${READY}" != "1" ]; then
    echo "[db_test] FAIL: postgres did not become ready in time" >&2
    docker logs "${CONTAINER_NAME}" || true
    exit 1
fi
echo "[db_test] postgres is ready"

DB_URL="postgresql://${PG_USER}@localhost:${PG_PORT}/${PG_DB}"

# The host's /usr/bin/psql is a Debian pg_wrapper stub with no
# postgresql-client-<version> package installed behind it, so it can't
# actually connect to anything on this machine. The postgres:16 image
# itself ships a real psql, so every SQL file is applied via `docker exec`
# (stdin) against the running container instead of a host-side psql binary.
run_psql() {
    # $1 = human label, $2 = file path
    echo "[db_test] applying ${1}"
    docker exec -i "${CONTAINER_NAME}" psql -U "${PG_USER}" -d "${PG_DB}" -v ON_ERROR_STOP=1 < "${2}"
}

grant_app_user() {
    echo "[db_test] granting app_user table access"
    docker exec "${CONTAINER_NAME}" psql -U "${PG_USER}" -d "${PG_DB}" -v ON_ERROR_STOP=1 -c \
        "grant select, insert, update on all tables in schema public to app_user;"
}

# 1. test-only auth shim (auth.uid() stand-in + app_user role) -- NOT part
#    of supabase/migrations/, applied only here.
run_psql "tests/db/setup_test_auth.sql" "${REPO_ROOT}/tests/db/setup_test_auth.sql"

# 2. schema + RLS migrations, in filename order, first application.
shopt -s nullglob
MIGRATIONS=("${REPO_ROOT}"/supabase/migrations/*.sql)
shopt -u nullglob
if [ "${#MIGRATIONS[@]}" -eq 0 ]; then
    echo "[db_test] FAIL: no migrations found under supabase/migrations/" >&2
    exit 1
fi
IFS=$'\n' MIGRATIONS=($(sort <<<"${MIGRATIONS[*]}")); unset IFS

echo "[db_test] --- first migration apply ---"
for f in "${MIGRATIONS[@]}"; do
    run_psql "$(basename "${f}") (1st apply)" "${f}"
done

grant_app_user

# 3. IDEMPOTENCY CHECK: re-apply every migration a second time. Must be a
#    clean no-op -- any error here means a migration isn't safely re-runnable.
echo "[db_test] --- second migration apply (idempotency check) ---"
for f in "${MIGRATIONS[@]}"; do
    run_psql "$(basename "${f}") (2nd apply)" "${f}"
done

grant_app_user

# 4. install test deps into the repo .venv (per project convention -- see
#    CLAUDE.md's Test tooling section).
if [ ! -x "${VENV_PIP}" ]; then
    echo "[db_test] FAIL: ${VENV_PIP} not found -- expected repo .venv to already exist" >&2
    exit 1
fi
echo "[db_test] installing tests/db/requirements.txt"
"${VENV_PIP}" install -q -r "${REPO_ROOT}/tests/db/requirements.txt"

# 5. run the RLS test suite against the live container.
echo "[db_test] --- running pytest tests/db ---"
MTB_TEST_DB_URL="${DB_URL}" "${VENV_PYTEST}" "${REPO_ROOT}/tests/db" -v

echo "[db_test] PASS"

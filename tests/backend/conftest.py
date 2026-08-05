"""Shared fixtures for backend/app integration tests that need a live
Postgres (app.db.rls_connection, app.identity -- both require a real RLS-
enforcing database session, not something mockable).

Deliberately separate from tests/api/ (which is DB-free, placeholder-env
only, and runs in any CI job) and from tests/db/ (which tests RLS policy
SQL directly, no Python app code involved). This directory sits between the
two: Python app code (app.db, app.identity) exercised against a live DB.

Reads the connection string from MTB_TEST_DB_URL, same convention as
tests/db/test_rls.py / test_rls_authenticated.py -- point it at a postgres
container with tests/db/setup_test_auth.sql + supabase/migrations/*.sql
already applied. UNLIKE tests/db's fixtures (which raise if unset, because
they're only ever invoked via scripts/db_test.sh), this directory SKIPS
(doesn't error) when MTB_TEST_DB_URL is unset, so a no-DB CI job that
happens to collect this directory doesn't fail the build -- it's the
caller's job to run these against a real container when DB coverage is
wanted (see this task's orchestrator-facing report for the exact docker
invocation used to verify locally).
"""

from __future__ import annotations

import os
import sys
from collections.abc import Iterator
from pathlib import Path

import psycopg
import pytest

BACKEND_DIR = Path(__file__).resolve().parents[2] / "backend"
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))


def _require_test_db_url() -> str:
    url = os.environ.get("MTB_TEST_DB_URL")
    if not url:
        pytest.skip(
            "MTB_TEST_DB_URL not set -- tests/backend needs a live postgres "
            "with tests/db/setup_test_auth.sql + supabase/migrations/*.sql "
            "already applied. Skipped (not failed) so a no-DB CI job can "
            "still collect this directory."
        )
    return url


@pytest.fixture(scope="session")
def db_url() -> str:
    return _require_test_db_url()


@pytest.fixture
def owner_conn(db_url: str) -> Iterator[psycopg.Connection]:
    """Table-owner connection. Seeding only -- bypasses RLS, same role
    tests/db/test_rls*.py call `owner_conn`. Function-scoped (not module/
    session) so each test's inserts are isolated from the next; the whole
    tests/backend suite is small enough that per-test connect overhead
    doesn't matter."""
    with psycopg.connect(db_url, autocommit=True) as conn:
        yield conn

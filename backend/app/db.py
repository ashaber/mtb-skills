"""RLS-enforcing DB session helper.

Phase 3.1's fork-independent core (docs/PHASE3_1_AUTH_HEADSTART.md): in
EITHER architecture fork (frontend -> Supabase directly, or frontend ->
FastAPI -> Supabase), any query this backend runs on a coach's behalf must
be subject to the SAME Row-Level Security policies Supabase itself enforces
for a direct PostgREST call (supabase/migrations/0002_rls.sql) -- otherwise
the backend becomes a privilege-escalation hole: a plain ride-group coach's
request, routed through this backend, must never see or write more than
their own ride group just because the backend's own DB connection happens
to be more privileged than they are.

`rls_connection()` is the one place in this backend allowed to open a raw
DB connection for request-scoped work. It never connects as `postgres`
(which owns every table and therefore bypasses RLS entirely -- see
tests/db/test_rls_authenticated.py's module docstring for the mechanics of
why `SET ROLE` defeats that bypass). Instead it opens a transaction, then:

    SET LOCAL role authenticated;
    SELECT set_config('request.jwt.claims', '{"sub": "...", ...}', true);

-- exactly the mechanism Supabase's own PostgREST/GoTrue stack uses per
request (proven against local Postgres in tests/db/test_rls_authenticated.py
and, for this module specifically, tests/backend/test_db.py). `set_config`
is used instead of a literal `SET LOCAL request.jwt.claims = '...'`
statement so the JSON claims blob can be passed as a proper bound parameter
rather than string-formatted into SQL text.

ASSUMPTION (flagged for orchestrator review): the connecting role must
itself be permitted to `SET ROLE authenticated` -- true for a Postgres
superuser (this repo's local/CI tests connect as the `postgres` superuser
created by the tests/db postgres:16 container) and true for Supabase's own
pooled connection role in production (Supabase's pooler connects as a role
that is a member of `authenticated`/`anon`/`service_role`, mirroring
PostgREST's own connection). If a future deploy's DATABASE_URL ever points
at a role that is NEITHER a superuser NOR a member of `authenticated`, `SET
ROLE authenticated` itself will fail with a permission error (not a silent
RLS bypass) -- fail-loud, not fail-open.
"""

from __future__ import annotations

import json
import time
from collections.abc import Iterator
from contextlib import contextmanager

import psycopg

from app.logging import get_logger

log = get_logger("app.db")


class RlsConnectionError(Exception):
    """Raised when the RLS-scoped session couldn't be established (connect
    failure, or the `SET ROLE authenticated` / claims setup itself failed --
    e.g. the connecting role lacks permission to switch into
    `authenticated`). Never a bare/unhandled exception escapes this module."""


@contextmanager
def rls_connection(database_url: str, sub: str) -> Iterator[psycopg.Connection]:
    """Open a psycopg connection scoped to one Supabase auth user's `sub`
    (the JWT `sub` claim, already verified by
    app.auth.verify_supabase_jwt -- this function trusts its caller to have
    done that verification; it does not re-verify a token itself).

    Everything run against the yielded connection, for the lifetime of the
    `with` block, is subject to RLS exactly as if that user had called
    Supabase's PostgREST directly. On successful exit the transaction
    commits; on any exception it rolls back and the exception propagates
    (wrapped in `RlsConnectionError` only if the failure happened during
    connect/setup, before caller code ever ran -- a failure from caller
    code, e.g. an RLS-denied INSERT, propagates as-is so callers can inspect
    the original `psycopg.Error`).

    `prepare_threshold=None` disables psycopg's server-side prepared
    statements, required for Supabase's transaction-pooler (pgbouncer) in
    production -- see app/config.py's `get_settings()` docstring. Harmless
    against a direct (non-pooled) local/test Postgres too.
    """
    if not sub:
        raise ValueError("sub must be a non-empty string")

    claims = json.dumps({"sub": sub, "role": "authenticated"})

    try:
        # connect_timeout: fail fast on a network partition / unreachable
        # host rather than hang on the OS's own (often multi-minute) TCP
        # connect timeout -- consistent with the global "fail fast" standard
        # and cheap insurance for a request-scoped helper that must not tie
        # up a request indefinitely.
        conn = psycopg.connect(database_url, autocommit=False, prepare_threshold=None, connect_timeout=10)
    except psycopg.Error as exc:
        log.error("db.connect_failed", error=str(exc))
        raise RlsConnectionError(f"could not connect to database: {exc}") from exc

    try:
        try:
            conn.execute("set local role authenticated")
            conn.execute("select set_config('request.jwt.claims', %s, true)", (claims,))
        except psycopg.Error as exc:
            conn.rollback()
            log.error("db.rls_session_setup_failed", error=str(exc))
            raise RlsConnectionError(f"could not establish RLS session: {exc}") from exc

        start = time.monotonic()
        try:
            yield conn
        except Exception:
            conn.rollback()
            raise
        else:
            conn.commit()
        finally:
            duration_ms = round((time.monotonic() - start) * 1000, 2)
            log.info("db.rls_session_closed", duration_ms=duration_ms)
    finally:
        conn.close()

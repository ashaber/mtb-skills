"""Live-Postgres tests for the anonymous engagement→db endpoint (Phase 3
engagement-db increment): `POST /api/engagement` (app/routes.py's
`submit_engagement`), `EngagementIn` (app/schemas.py), and
supabase/migrations/0012_engagement.sql's access model.

Mirrors tests/backend/test_feedback.py's structure exactly -- this is the
same "no persona, anonymous, RLS-bypassing service_connection write"
pattern applied to the OTHER stream that used to post to the Google Sheet
(src/feedback.js's `_flushEngagement`). Like test_feedback.py, these tests
drive the app via TestClient with NO Authorization header at all, and
assert the write lands via `owner_conn` (which bypasses RLS the same way
app.db.service_connection -- the endpoint's own write path -- does).

Also proves the access-model half of 0012_engagement.sql directly: RLS is
enabled on `engagement` with zero policies, and `engagement` gets no grant
to `authenticated` at all (unlike 0003_grants.sql's tables) -- so an
`authenticated`-role session (via app.db.rls_connection, the same helper
every other route uses) can't even reach a policy-evaluation step; the
query is denied at the SQL-privilege layer first.

Requires MTB_TEST_DB_URL pointed at a Postgres with
tests/db/setup_test_auth.sql + every supabase/migrations/*.sql (through
0012_engagement.sql) already applied. Skips (doesn't fail) if unset -- see
tests/backend/conftest.py.
"""

from __future__ import annotations

import importlib
import uuid
from typing import Any

import psycopg
import pytest

from app.db import RlsConnectionError, rls_connection


@pytest.fixture
def client(db_url: str, monkeypatch: pytest.MonkeyPatch):
    """A TestClient over the real FastAPI app, pointed at the live
    MTB_TEST_DB_URL Postgres. No JWT secret setup needed here (unlike
    test_api_rls.py / test_onboarding.py) -- POST /api/engagement takes no
    auth at all, so no test in this file ever mints a token."""
    monkeypatch.setenv("DATABASE_URL", db_url)
    monkeypatch.setenv("SESSION_SECRET", "test-session-secret")
    monkeypatch.setenv("GOOGLE_CLIENT_ID", "test.apps.googleusercontent.com")
    monkeypatch.setenv("SUPABASE_URL", "https://placeholder.supabase.co")

    from fastapi.testclient import TestClient

    from app import main as main_module

    importlib.reload(main_module)
    return TestClient(main_module.app)


def _engagement_row(owner_conn: psycopg.Connection, eng_id: str) -> tuple[Any, ...] | None:
    return owner_conn.execute(
        """
        select id, session_id, session_start, duration_sec, user_name, league, team,
               event_count, events, app_version, user_agent
        from engagement where id = %s
        """,
        (eng_id,),
    ).fetchone()


# --------------------------------------------------------------------------
# Happy paths.
# --------------------------------------------------------------------------


def test_post_engagement_with_events_as_json_string_succeeds_and_row_exists(
    client, owner_conn: psycopg.Connection
) -> None:
    resp = client.post(
        "/api/engagement",
        json={
            "type": "engagement",
            "sessionId": "sess_abc123",
            "sessionStart": "2026-08-07T12:00:00.000Z",
            "durationSec": 90,
            "userName": "Andrew",
            "league": "PNW",
            "team": "Test Team",
            "eventCount": 2,
            "events": '[{"type":"tab_switch","ts":1},{"type":"tab_switch","ts":2}]',
            "appVersion": "3.1.0",
        },
        headers={"User-Agent": "pytest-ua-engagement-string"},
    )

    assert resp.status_code == 201
    body = resp.json()
    assert "id" in body
    uuid.UUID(body["id"])  # a real uuid was returned

    row = _engagement_row(owner_conn, body["id"])
    assert row is not None
    (_id, session_id, session_start, duration_sec, user_name, league, team, event_count, events, app_version, user_agent) = row
    assert session_id == "sess_abc123"
    assert session_start is not None
    assert duration_sec == 90
    assert user_name == "Andrew"
    assert league == "PNW"
    assert team == "Test Team"
    assert event_count == 2
    # events stored as jsonb -- psycopg hands it back already decoded.
    assert events == [{"type": "tab_switch", "ts": 1}, {"type": "tab_switch", "ts": 2}]
    assert app_version == "3.1.0"
    assert user_agent == "pytest-ua-engagement-string"


def test_post_engagement_with_events_as_native_list_succeeds_and_stores_as_jsonb(
    client, owner_conn: psycopg.Connection
) -> None:
    resp = client.post(
        "/api/engagement",
        json={
            "type": "engagement",
            "sessionId": "sess_list",
            "eventCount": 1,
            "events": [{"type": "feedback", "page": "roster"}],
        },
    )

    assert resp.status_code == 201
    row = _engagement_row(owner_conn, resp.json()["id"])
    assert row is not None
    events = row[8]
    assert events == [{"type": "feedback", "page": "roster"}]


def test_post_engagement_with_only_session_id_succeeds(client, owner_conn: psycopg.Connection) -> None:
    """A ping with just a session_id (no events yet) is a legitimate flush
    -- CLAUDE.md task brief: 'an engagement flush with just a session is
    valid'."""
    resp = client.post("/api/engagement", json={"type": "engagement", "sessionId": "sess_bare"})

    assert resp.status_code == 201
    row = _engagement_row(owner_conn, resp.json()["id"])
    assert row is not None
    assert row[1] == "sess_bare"


def test_post_engagement_ignores_unknown_extra_fields(client) -> None:
    """`ConfigDict(extra='ignore')` -- a forward-compat payload key must
    never 400 the ping."""
    resp = client.post(
        "/api/engagement",
        json={"type": "engagement", "sessionId": "sess_extra", "somethingNew": "value"},
    )
    assert resp.status_code == 201


# --------------------------------------------------------------------------
# session_start leniency: an unparseable timestamp stores null, never 400s.
# --------------------------------------------------------------------------


def test_post_engagement_with_unparseable_session_start_stores_null_not_400(
    client, owner_conn: psycopg.Connection
) -> None:
    resp = client.post(
        "/api/engagement",
        json={"type": "engagement", "sessionId": "sess_bad_ts", "sessionStart": "not-a-real-timestamp"},
    )

    assert resp.status_code == 201
    row = _engagement_row(owner_conn, resp.json()["id"])
    assert row is not None
    assert row[2] is None  # session_start stored null, not rejected


def test_post_engagement_with_valid_iso_session_start_stores_timestamp(
    client, owner_conn: psycopg.Connection
) -> None:
    resp = client.post(
        "/api/engagement",
        json={"type": "engagement", "sessionId": "sess_good_ts", "sessionStart": "2026-08-07T09:30:00.000Z"},
    )

    assert resp.status_code == 201
    row = _engagement_row(owner_conn, resp.json()["id"])
    assert row is not None
    assert row[2] is not None


# --------------------------------------------------------------------------
# Validation: totally empty body rejected; oversized events rejected.
# --------------------------------------------------------------------------


def test_post_engagement_with_totally_empty_body_is_400(client) -> None:
    resp = client.post("/api/engagement", json={"type": "engagement"})
    assert resp.status_code == 400


def test_post_engagement_with_no_body_fields_at_all_is_400(client) -> None:
    resp = client.post("/api/engagement", json={})
    assert resp.status_code == 400


def test_post_engagement_with_oversized_events_string_is_400(client) -> None:
    oversized = '[{"type":"x","pad":"' + ("a" * 500_010) + '"}]'
    resp = client.post(
        "/api/engagement",
        json={"type": "engagement", "sessionId": "sess_huge", "events": oversized},
    )
    assert resp.status_code == 400


def test_post_engagement_with_oversized_events_list_is_400(client) -> None:
    # A native list whose re-serialized JSON exceeds the cap, even though no
    # single field looks obviously huge.
    huge_list = [{"type": "tab_switch", "ts": i, "pad": "x" * 200} for i in range(3000)]
    resp = client.post(
        "/api/engagement",
        json={"type": "engagement", "sessionId": "sess_huge_list", "events": huge_list},
    )
    assert resp.status_code == 400


def test_post_engagement_with_malformed_events_string_is_400(client) -> None:
    resp = client.post(
        "/api/engagement",
        json={"type": "engagement", "sessionId": "sess_bad_json", "events": "{not valid json"},
    )
    assert resp.status_code == 400


def test_post_engagement_with_negative_duration_is_400(client) -> None:
    resp = client.post(
        "/api/engagement",
        json={"type": "engagement", "sessionId": "sess_neg", "durationSec": -5},
    )
    assert resp.status_code == 400


def test_post_engagement_with_oversized_optional_text_field_is_400(client) -> None:
    resp = client.post(
        "/api/engagement",
        json={"type": "engagement", "sessionId": "sess_long_name", "userName": "x" * 501},
    )
    assert resp.status_code == 400


# --------------------------------------------------------------------------
# Access model: RLS is ON with NO policies -- an `authenticated`-role
# session (any sub) cannot select from `engagement` at all. Only the
# RLS-bypassing service_connection this endpoint uses can touch the table.
# --------------------------------------------------------------------------


def test_authenticated_role_cannot_select_engagement_table(db_url: str, owner_conn: psycopg.Connection) -> None:
    # Seed one row as the owner so there's something to (fail to) find.
    owner_conn.execute("insert into engagement (session_id) values ('seed row for RLS deny-all check')")

    any_sub = str(uuid.uuid4())
    with pytest.raises((psycopg.errors.InsufficientPrivilege, RlsConnectionError)):
        with rls_connection(db_url, any_sub) as conn:
            conn.execute("select id from engagement").fetchall()


def test_engagement_table_has_no_grant_to_authenticated_role(owner_conn: psycopg.Connection) -> None:
    """Belt-and-suspenders on the same fact the RLS test above proves
    end-to-end: `authenticated` has no SELECT/INSERT/UPDATE/DELETE
    privilege on `engagement` at all (unlike every table 0003_grants.sql
    grants it) -- so it's denied at the SQL-privilege layer, before RLS
    policy evaluation would even become relevant."""
    rows = owner_conn.execute(
        """
        select privilege_type
        from information_schema.role_table_grants
        where table_name = 'engagement' and grantee = 'authenticated'
        """
    ).fetchall()
    assert rows == []

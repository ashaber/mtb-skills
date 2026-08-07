"""Live-Postgres tests for the anonymous feedback→db endpoint (Phase 3
feedback-db increment): `POST /api/feedback` (app/routes.py's
`submit_feedback`), `FeedbackIn` (app/schemas.py), and
supabase/migrations/0011_feedback.sql's access model.

Unlike every other route in app/routes.py, this endpoint takes NO auth --
there is no persona behind a feedback submission (src/feedback.js's 💬
modal), so these tests drive the app via TestClient with NO Authorization
header at all, and assert the write lands via `owner_conn` (which bypasses
RLS the same way app.db.service_connection -- the endpoint's own write
path -- does).

Also proves the access-model half of 0011_feedback.sql directly: RLS is
enabled on `feedback` with zero policies, and `feedback` gets no grant to
`authenticated` at all (unlike 0003_grants.sql's tables) -- so an
`authenticated`-role session (via app.db.rls_connection, the same helper
every other route uses) can't even reach a policy-evaluation step; the
query is denied at the SQL-privilege layer first.

Requires MTB_TEST_DB_URL pointed at a Postgres with
tests/db/setup_test_auth.sql + every supabase/migrations/*.sql (through
0011_feedback.sql) already applied. Skips (doesn't fail) if unset -- see
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
    test_api_rls.py / test_onboarding.py) -- POST /api/feedback takes no
    auth at all, so no test in this file ever mints a token."""
    monkeypatch.setenv("DATABASE_URL", db_url)
    monkeypatch.setenv("SESSION_SECRET", "test-session-secret")
    monkeypatch.setenv("GOOGLE_CLIENT_ID", "test.apps.googleusercontent.com")
    monkeypatch.setenv("SUPABASE_URL", "https://placeholder.supabase.co")

    from fastapi.testclient import TestClient

    from app import main as main_module

    importlib.reload(main_module)
    return TestClient(main_module.app)


def _feedback_row(owner_conn: psycopg.Connection, fb_id: str) -> tuple[Any, ...] | None:
    return owner_conn.execute(
        """
        select id, page, role, user_name, email, league, team, comment, has_drawing,
               screenshot, drawing, app_version, user_agent
        from feedback where id = %s
        """,
        (fb_id,),
    ).fetchone()


# --------------------------------------------------------------------------
# Happy paths -- comment-only, drawing-only, both.
# --------------------------------------------------------------------------


def test_post_feedback_with_comment_no_drawing_succeeds_and_row_exists(
    client, owner_conn: psycopg.Connection
) -> None:
    resp = client.post(
        "/api/feedback",
        json={
            "type": "feedback",
            "page": "roster",
            "role": "Coach",
            "userName": "Andrew",
            "email": "andrew@example.com",
            "league": "PNW",
            "team": "Test Team",
            "comment": "Love the app, one bug on the sheet import.",
            "hasDrawing": False,
        },
        headers={"User-Agent": "pytest-ua-comment-only"},
    )

    assert resp.status_code == 201
    body = resp.json()
    assert "id" in body
    uuid.UUID(body["id"])  # a real uuid was returned

    row = _feedback_row(owner_conn, body["id"])
    assert row is not None
    (
        _id,
        page,
        role,
        user_name,
        email,
        league,
        team,
        comment,
        has_drawing,
        screenshot,
        drawing,
        app_version,
        user_agent,
    ) = row
    assert page == "roster"
    assert role == "Coach"
    assert user_name == "Andrew"
    assert email == "andrew@example.com"
    assert league == "PNW"
    assert team == "Test Team"
    assert comment == "Love the app, one bug on the sheet import."
    assert has_drawing is False
    assert screenshot is None
    assert drawing is None
    assert app_version is None
    # user_agent is captured server-side from the request header, never
    # from anything in the body -- proves that wiring, not just that some
    # value landed.
    assert user_agent == "pytest-ua-comment-only"


def test_post_feedback_with_drawing_no_comment_succeeds(client, owner_conn: psycopg.Connection) -> None:
    tiny_png_data_url = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII="

    resp = client.post(
        "/api/feedback",
        json={
            "type": "feedback",
            "page": "practice",
            "comment": "",
            "hasDrawing": True,
            "drawingUrl": tiny_png_data_url,
            "screenshotUrl": tiny_png_data_url,
        },
    )

    assert resp.status_code == 201
    row = _feedback_row(owner_conn, resp.json()["id"])
    assert row is not None
    assert row[7] is None  # comment normalized blank -> None
    assert row[8] is True  # has_drawing
    assert row[9] == tiny_png_data_url  # screenshot
    assert row[10] == tiny_png_data_url  # drawing


def test_post_feedback_ignores_unknown_extra_fields(client, owner_conn: psycopg.Connection) -> None:
    """`ConfigDict(extra='ignore')` -- a forward-compat payload key the
    frontend sends (e.g. `timestamp`) must never 400 the submission."""
    resp = client.post(
        "/api/feedback",
        json={
            "type": "feedback",
            "timestamp": "2026-08-07T12:00:00.000Z",
            "comment": "extra field should be ignored",
            "sessionId": "sess_12345",
        },
    )
    assert resp.status_code == 201


# --------------------------------------------------------------------------
# Validation: at least one of comment/drawing required.
# --------------------------------------------------------------------------


def test_post_feedback_with_neither_comment_nor_drawing_is_400(client) -> None:
    resp = client.post("/api/feedback", json={"type": "feedback", "page": "guide"})
    assert resp.status_code == 400


def test_post_feedback_with_blank_comment_and_no_drawing_is_400(client) -> None:
    resp = client.post("/api/feedback", json={"type": "feedback", "comment": "   ", "hasDrawing": False})
    assert resp.status_code == 400


# --------------------------------------------------------------------------
# Length caps -- primary spam/abuse guard on an open, unauthenticated write.
# --------------------------------------------------------------------------


def test_post_feedback_with_oversized_comment_is_400(client) -> None:
    resp = client.post(
        "/api/feedback",
        json={"type": "feedback", "comment": "x" * 5001},
    )
    assert resp.status_code == 400


def test_post_feedback_with_comment_at_cap_succeeds(client, owner_conn: psycopg.Connection) -> None:
    resp = client.post(
        "/api/feedback",
        json={"type": "feedback", "comment": "x" * 5000},
    )
    assert resp.status_code == 201


def test_post_feedback_with_oversized_drawing_is_400(client) -> None:
    resp = client.post(
        "/api/feedback",
        json={
            "type": "feedback",
            "hasDrawing": True,
            "drawingUrl": "data:image/png;base64," + ("A" * 3_000_001),
        },
    )
    assert resp.status_code == 400


def test_post_feedback_with_oversized_screenshot_is_400(client) -> None:
    resp = client.post(
        "/api/feedback",
        json={
            "type": "feedback",
            "comment": "screenshot too big",
            "screenshotUrl": "data:image/png;base64," + ("A" * 3_000_001),
        },
    )
    assert resp.status_code == 400


def test_post_feedback_with_oversized_optional_text_field_is_400(client) -> None:
    resp = client.post(
        "/api/feedback",
        json={"type": "feedback", "comment": "hi", "userName": "x" * 501},
    )
    assert resp.status_code == 400


# --------------------------------------------------------------------------
# Access model: RLS is ON with NO policies -- an `authenticated`-role
# session (any sub) cannot select from `feedback` at all. Only the
# RLS-bypassing service_connection this endpoint uses can touch the table.
# --------------------------------------------------------------------------


def test_authenticated_role_cannot_select_feedback_table(db_url: str, owner_conn: psycopg.Connection) -> None:
    # Seed one row as the owner so there's something to (fail to) find.
    owner_conn.execute("insert into feedback (comment) values ('seed row for RLS deny-all check')")

    any_sub = str(uuid.uuid4())
    with pytest.raises((psycopg.errors.InsufficientPrivilege, RlsConnectionError)):
        with rls_connection(db_url, any_sub) as conn:
            conn.execute("select id from feedback").fetchall()


def test_feedback_table_has_no_grant_to_authenticated_role(owner_conn: psycopg.Connection) -> None:
    """Belt-and-suspenders on the same fact the RLS test above proves
    end-to-end: `authenticated` has no SELECT/INSERT/UPDATE/DELETE
    privilege on `feedback` at all (unlike every table 0003_grants.sql
    grants it) -- so it's denied at the SQL-privilege layer, before RLS
    policy evaluation would even become relevant."""
    rows = owner_conn.execute(
        """
        select privilege_type
        from information_schema.role_table_grants
        where table_name = 'feedback' and grantee = 'authenticated'
        """
    ).fetchall()
    assert rows == []

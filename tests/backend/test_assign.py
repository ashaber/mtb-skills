"""Live-Postgres, full-stack integration tests for POST /api/roster/assign
(app/routes.py's `assign_ride_group`) -- an HC/TD reassigning (or
unassigning) a single athlete's `ride_group_id`.

Mirrors tests/backend/test_athletes.py's pattern: mints real Supabase-shaped
HS256 JWTs and drives the actual FastAPI app end to end via TestClient.
Requires MTB_TEST_DB_URL -- see tests/backend/conftest.py; skips (doesn't
fail) if unset.
"""

from __future__ import annotations

import importlib
import time
import uuid
from typing import Any

import jwt
import psycopg
import pytest

TEST_SUPABASE_JWT_SECRET = "test-assign-supabase-jwt-secret-32bytes-minimum"


def _unique(prefix: str) -> str:
    return f"{prefix}-{uuid.uuid4().hex[:10]}"


def _token(sub: uuid.UUID, *, exp_delta: int = 3600) -> str:
    now = int(time.time())
    return jwt.encode(
        {"sub": str(sub), "exp": now + exp_delta, "iat": now, "role": "authenticated"},
        TEST_SUPABASE_JWT_SECRET,
        algorithm="HS256",
    )


def _auth_header(sub: uuid.UUID) -> dict[str, str]:
    return {"Authorization": f"Bearer {_token(sub)}"}


@pytest.fixture
def client(db_url: str, monkeypatch: pytest.MonkeyPatch):
    """Same shape as test_athletes.py's `client` fixture, own JWT secret."""
    monkeypatch.setenv("DATABASE_URL", db_url)
    monkeypatch.setenv("SESSION_SECRET", "test-session-secret")
    monkeypatch.setenv("GOOGLE_CLIENT_ID", "test.apps.googleusercontent.com")
    monkeypatch.setenv("SUPABASE_URL", "https://placeholder.supabase.co")
    monkeypatch.setenv("SUPABASE_JWT_SECRET", TEST_SUPABASE_JWT_SECRET)

    from fastapi.testclient import TestClient

    from app import main as main_module

    importlib.reload(main_module)
    return TestClient(main_module.app)


@pytest.fixture
def seed(owner_conn: psycopg.Connection) -> dict[str, Any]:
    """Team A with two ride groups (A1, A2 -- A1 has a ride-group coach and
    an athlete on it) plus an HC persona, and a wholly separate Team B with
    its own ride group -- enough to prove: HC moves the athlete A1 -> A2,
    HC unassigns, a plain ride-group coach's attempt is denied, and
    assigning to a different team's group is denied."""
    ids = {
        name: uuid.uuid4()
        for name in (
            "league",
            "team_a",
            "team_b",
            "group_a1",
            "group_a2",
            "group_b1",
            "coach_a1_person",
            "coach_a1_auth",
            "hc_a_person",
            "hc_a_auth",
            "athlete_a1",
        )
    }

    owner_conn.execute("insert into league (id, name) values (%s, %s)", (ids["league"], "L"))
    owner_conn.execute(
        "insert into team (id, league_id, name) values (%s, %s, %s)", (ids["team_a"], ids["league"], "Team A")
    )
    owner_conn.execute(
        "insert into team (id, league_id, name) values (%s, %s, %s)", (ids["team_b"], ids["league"], "Team B")
    )
    owner_conn.execute(
        "insert into ride_group (id, team_id, name) values (%s, %s, %s)", (ids["group_a1"], ids["team_a"], "A1")
    )
    owner_conn.execute(
        "insert into ride_group (id, team_id, name) values (%s, %s, %s)", (ids["group_a2"], ids["team_a"], "A2")
    )
    owner_conn.execute(
        "insert into ride_group (id, team_id, name) values (%s, %s, %s)", (ids["group_b1"], ids["team_b"], "B1")
    )
    owner_conn.execute(
        "insert into person (id, team_id, ride_group_id, role, name) values (%s, %s, %s, 'coach', %s)",
        (ids["coach_a1_person"], ids["team_a"], ids["group_a1"], "Coach A1"),
    )
    owner_conn.execute(
        "insert into auth_person (auth_user_id, person_id) values (%s, %s)",
        (ids["coach_a1_auth"], ids["coach_a1_person"]),
    )
    owner_conn.execute(
        "insert into person (id, team_id, ride_group_id, role, name) values (%s, %s, null, 'head_coach', %s)",
        (ids["hc_a_person"], ids["team_a"], "HC A"),
    )
    owner_conn.execute(
        "insert into auth_person (auth_user_id, person_id) values (%s, %s)", (ids["hc_a_auth"], ids["hc_a_person"])
    )
    owner_conn.execute(
        "insert into person (id, team_id, ride_group_id, role, name) values (%s, %s, %s, 'athlete', %s)",
        (ids["athlete_a1"], ids["team_a"], ids["group_a1"], "Athlete A1"),
    )

    return ids


# --------------------------------------------------------------------------
# HC/TD happy paths
# --------------------------------------------------------------------------


def test_hc_reassigns_athlete_to_another_group_on_own_team(
    client, seed: dict[str, Any], owner_conn: psycopg.Connection
) -> None:
    resp = client.post(
        "/api/roster/assign",
        headers=_auth_header(seed["hc_a_auth"]),
        json={"person_id": str(seed["athlete_a1"]), "ride_group_id": str(seed["group_a2"])},
    )

    assert resp.status_code == 200
    body = resp.json()
    assert body["id"] == str(seed["athlete_a1"])
    assert body["ride_group_id"] == str(seed["group_a2"])
    assert body["ride_group_name"] == "A2"

    row = owner_conn.execute(
        "select ride_group_id from person where id = %s", (seed["athlete_a1"],)
    ).fetchone()
    assert row == (seed["group_a2"],)

    # Appears under the new group on a subsequent GET.
    roster = client.get("/api/roster", headers=_auth_header(seed["hc_a_auth"]))
    entry = next(p for p in roster.json() if p["id"] == str(seed["athlete_a1"]))
    assert entry["ride_group_name"] == "A2"


def test_hc_unassigns_athlete(client, seed: dict[str, Any], owner_conn: psycopg.Connection) -> None:
    resp = client.post(
        "/api/roster/assign",
        headers=_auth_header(seed["hc_a_auth"]),
        json={"person_id": str(seed["athlete_a1"]), "ride_group_id": None},
    )

    assert resp.status_code == 200
    body = resp.json()
    assert body["ride_group_id"] is None
    assert body["ride_group_name"] is None

    row = owner_conn.execute(
        "select ride_group_id from person where id = %s", (seed["athlete_a1"],)
    ).fetchone()
    assert row == (None,)


# --------------------------------------------------------------------------
# Denials
# --------------------------------------------------------------------------


def test_ride_group_coach_cannot_assign_to_a_sibling_group(
    client, seed: dict[str, Any], owner_conn: psycopg.Connection
) -> None:
    """A plain ride-group coach can't even SEE a sibling group on their own
    team (ride_group_select's `app_caller_ride_group_ids()` only returns
    their OWN group) -- so this trips the group-scope guard before
    person_update's own HC/TD-only policy would even get evaluated."""
    resp = client.post(
        "/api/roster/assign",
        headers=_auth_header(seed["coach_a1_auth"]),
        json={"person_id": str(seed["athlete_a1"]), "ride_group_id": str(seed["group_a2"])},
    )

    assert resp.status_code == 403
    assert resp.json() == {"error": "cannot assign to that group"}

    # Row untouched.
    row = owner_conn.execute(
        "select ride_group_id from person where id = %s", (seed["athlete_a1"],)
    ).fetchone()
    assert row == (seed["group_a1"],)


def test_ride_group_coach_cannot_unassign_athlete(
    client, seed: dict[str, Any], owner_conn: psycopg.Connection
) -> None:
    """Isolates person_update's own HC/TD-only RLS policy (as opposed to
    the group-scope guard above): unassign never SELECTs a ride_group, so
    this exercises the UPDATE ... RETURNING path directly. A plain
    ride-group coach isn't in `app_caller_hc_team_ids()`, so the UPDATE's
    `using` clause matches zero rows -- denied even for their OWN group's
    athlete."""
    resp = client.post(
        "/api/roster/assign",
        headers=_auth_header(seed["coach_a1_auth"]),
        json={"person_id": str(seed["athlete_a1"]), "ride_group_id": None},
    )

    assert resp.status_code == 403
    assert resp.json() == {"error": "cannot reassign that athlete"}

    row = owner_conn.execute(
        "select ride_group_id from person where id = %s", (seed["athlete_a1"],)
    ).fetchone()
    assert row == (seed["group_a1"],)


def test_hc_cannot_assign_to_another_teams_group(
    client, seed: dict[str, Any], owner_conn: psycopg.Connection
) -> None:
    resp = client.post(
        "/api/roster/assign",
        headers=_auth_header(seed["hc_a_auth"]),
        json={"person_id": str(seed["athlete_a1"]), "ride_group_id": str(seed["group_b1"])},
    )

    assert resp.status_code == 403
    assert resp.json() == {"error": "cannot assign to that group"}

    row = owner_conn.execute(
        "select ride_group_id from person where id = %s", (seed["athlete_a1"],)
    ).fetchone()
    assert row == (seed["group_a1"],)


def test_nonexistent_ride_group_id_is_denied_403(client, seed: dict[str, Any]) -> None:
    resp = client.post(
        "/api/roster/assign",
        headers=_auth_header(seed["hc_a_auth"]),
        json={"person_id": str(seed["athlete_a1"]), "ride_group_id": str(uuid.uuid4())},
    )

    assert resp.status_code == 403
    assert resp.json() == {"error": "cannot assign to that group"}


def test_nonexistent_person_id_is_denied_403(client, seed: dict[str, Any]) -> None:
    resp = client.post(
        "/api/roster/assign",
        headers=_auth_header(seed["hc_a_auth"]),
        json={"person_id": str(uuid.uuid4()), "ride_group_id": str(seed["group_a2"])},
    )

    assert resp.status_code == 403
    assert resp.json() == {"error": "cannot reassign that athlete"}


def test_unauthenticated_request_gets_401(client, seed: dict[str, Any]) -> None:
    resp = client.post(
        "/api/roster/assign",
        json={"person_id": str(seed["athlete_a1"]), "ride_group_id": str(seed["group_a2"])},
    )
    assert resp.status_code == 401


# --------------------------------------------------------------------------
# Request shape
# --------------------------------------------------------------------------


def test_extra_field_in_request_body_is_rejected_400(client, seed: dict[str, Any]) -> None:
    resp = client.post(
        "/api/roster/assign",
        headers=_auth_header(seed["hc_a_auth"]),
        json={
            "person_id": str(seed["athlete_a1"]),
            "ride_group_id": str(seed["group_a2"]),
            "team_id": str(seed["team_a"]),
        },
    )

    assert resp.status_code == 400


def test_missing_ride_group_id_key_is_rejected_400(client, seed: dict[str, Any]) -> None:
    # ride_group_id has no default -- omitting the key entirely (as opposed
    # to sending it as `null`) must 400, not silently no-op.
    resp = client.post(
        "/api/roster/assign",
        headers=_auth_header(seed["hc_a_auth"]),
        json={"person_id": str(seed["athlete_a1"])},
    )

    assert resp.status_code == 400

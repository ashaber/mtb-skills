"""Live-Postgres, full-stack integration tests for D26 (team switcher):
GET /api/me's `team_name` per persona, and the optional `team_id` query
param on GET /api/roster, /api/observations, /api/confirmed-levels,
/api/practices, /api/attendance (app/routes.py's `_resolve_scope_team_id`).

Sets up the exact scenario DEFECTS.md's D26 entry / this increment's task
brief describes: ONE auth user linked (via auth_person) to TWO coach
`person` rows on TWO different teams -- a traveling Team Director, or one
head coach running several schools' programs (real prod example cited in
the task brief: andrew@idahomtb.org, 1 coach persona + 3 team_director
personas across 4 teams). Before this increment, every GET below ran with
no team_id filter in the SQL at all -- RLS alone (which ORs together every
team the caller has any persona on) decided what came back, so this
caller's roster/observations/etc. would be silently merged across both
teams with no way to view one at a time. `team_id` fixes that: omitted,
behavior is unchanged (asserted here too, for regression coverage); given,
it must be one of the caller's own persona team_ids or the route 403s
(never trusting a client-supplied team_id beyond that allowlist).

Mirrors tests/backend/test_athletes.py's / test_identity.py's patterns:
mints real Supabase-shaped HS256 JWTs and drives the actual FastAPI app end
to end via TestClient for the HTTP-level assertions; direct owner_conn
inserts for seeding. Requires MTB_TEST_DB_URL -- see tests/backend/
conftest.py; skips (doesn't fail) if unset.
"""

from __future__ import annotations

import importlib
import time
import uuid
from typing import Any

import jwt
import psycopg
import pytest

TEST_SUPABASE_JWT_SECRET = "test-team-scope-supabase-jwt-secret-32bytes-min"


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
def traveling_coach(owner_conn: psycopg.Connection) -> dict[str, Any]:
    """ONE auth user (`auth_id`) with a coach persona on Team A (as
    team_director) AND a separate coach persona on Team B (as coach) -- the
    D26 scenario. Each team gets one athlete, one observation, and one
    practice, so team-scoped GETs have something team-distinguishing to
    assert on."""
    ids = {
        name: uuid.uuid4()
        for name in (
            "league",
            "team_a",
            "team_b",
            "group_a",
            "group_b",
            "auth",
            "persona_a",
            "persona_b",
            "athlete_a",
            "athlete_b",
            "obs_a",
            "obs_b",
            "practice_a",
            "practice_b",
        )
    }

    owner_conn.execute("insert into league (id, name) values (%s, %s)", (ids["league"], "D26 League"))
    owner_conn.execute(
        "insert into team (id, league_id, name) values (%s, %s, %s)", (ids["team_a"], ids["league"], "Team A")
    )
    owner_conn.execute(
        "insert into team (id, league_id, name) values (%s, %s, %s)", (ids["team_b"], ids["league"], "Team B")
    )
    owner_conn.execute(
        "insert into ride_group (id, team_id, name) values (%s, %s, %s)", (ids["group_a"], ids["team_a"], "Group A")
    )
    owner_conn.execute(
        "insert into ride_group (id, team_id, name) values (%s, %s, %s)", (ids["group_b"], ids["team_b"], "Group B")
    )

    # Traveling coach: team_director on Team A, plain coach on Team B.
    owner_conn.execute(
        "insert into person (id, team_id, ride_group_id, role, name) values (%s, %s, %s, %s, %s)",
        (ids["persona_a"], ids["team_a"], None, "team_director", "Traveling Coach"),
    )
    owner_conn.execute(
        "insert into person (id, team_id, ride_group_id, role, name) values (%s, %s, %s, %s, %s)",
        (ids["persona_b"], ids["team_b"], ids["group_b"], "coach", "Traveling Coach"),
    )
    owner_conn.execute(
        "insert into auth_person (auth_user_id, person_id) values (%s, %s)", (ids["auth"], ids["persona_a"])
    )
    owner_conn.execute(
        "insert into auth_person (auth_user_id, person_id) values (%s, %s)", (ids["auth"], ids["persona_b"])
    )

    # One athlete per team.
    owner_conn.execute(
        "insert into person (id, team_id, ride_group_id, role, name) values (%s, %s, %s, %s, %s)",
        (ids["athlete_a"], ids["team_a"], ids["group_a"], "athlete", "Athlete A"),
    )
    owner_conn.execute(
        "insert into person (id, team_id, ride_group_id, role, name) values (%s, %s, %s, %s, %s)",
        (ids["athlete_b"], ids["team_b"], ids["group_b"], "athlete", "Athlete B"),
    )

    # One observation per team, attributed to that team's persona.
    owner_conn.execute(
        """
        insert into observation (id, athlete_id, team_id, coach_id, ride_group_id, session_date, skill, level_observed)
        values (%s, %s, %s, %s, %s, current_date, 'braking', 3)
        """,
        (ids["obs_a"], ids["athlete_a"], ids["team_a"], ids["persona_a"], ids["group_a"]),
    )
    owner_conn.execute(
        """
        insert into observation (id, athlete_id, team_id, coach_id, ride_group_id, session_date, skill, level_observed)
        values (%s, %s, %s, %s, %s, current_date, 'cornering', 4)
        """,
        (ids["obs_b"], ids["athlete_b"], ids["team_b"], ids["persona_b"], ids["group_b"]),
    )

    # One practice per team.
    owner_conn.execute(
        "insert into practice (id, team_id, ride_group_id, session_date, status, created_by) "
        "values (%s, %s, %s, current_date, 'active', %s)",
        (ids["practice_a"], ids["team_a"], ids["group_a"], ids["persona_a"]),
    )
    owner_conn.execute(
        "insert into practice (id, team_id, ride_group_id, session_date, status, created_by) "
        "values (%s, %s, %s, current_date, 'active', %s)",
        (ids["practice_b"], ids["team_b"], ids["group_b"], ids["persona_b"]),
    )

    return {k: str(v) for k, v in ids.items()}


# --------------------------------------------------------------------------
# GET /api/me -- team_name per persona
# --------------------------------------------------------------------------


def test_get_me_returns_team_name_for_each_persona(client, traveling_coach: dict[str, Any]) -> None:
    resp = client.get("/api/me", headers=_auth_header(uuid.UUID(traveling_coach["auth"])))
    assert resp.status_code == 200
    personas = resp.json()["personas"]
    assert len(personas) == 2
    by_team = {p["team_id"]: p["team_name"] for p in personas}
    assert by_team == {
        traveling_coach["team_a"]: "Team A",
        traveling_coach["team_b"]: "Team B",
    }


# --------------------------------------------------------------------------
# GET /api/roster
# --------------------------------------------------------------------------


def test_roster_without_team_id_is_merged_across_both_teams(client, traveling_coach: dict[str, Any]) -> None:
    """Back-compat / regression check: omitting team_id preserves the
    pre-D26 behavior exactly (RLS-only scoping, no app-level filter)."""
    resp = client.get("/api/roster", headers=_auth_header(uuid.UUID(traveling_coach["auth"])))
    assert resp.status_code == 200
    names = {row["name"] for row in resp.json()}
    assert {"Athlete A", "Athlete B"} <= names


def test_roster_scoped_to_team_a_excludes_team_b(client, traveling_coach: dict[str, Any]) -> None:
    resp = client.get(
        "/api/roster",
        params={"team_id": traveling_coach["team_a"]},
        headers=_auth_header(uuid.UUID(traveling_coach["auth"])),
    )
    assert resp.status_code == 200
    names = {row["name"] for row in resp.json()}
    assert "Athlete A" in names
    assert "Athlete B" not in names
    assert all(row["team_id"] == traveling_coach["team_a"] for row in resp.json())


def test_roster_scoped_to_team_b_excludes_team_a(client, traveling_coach: dict[str, Any]) -> None:
    resp = client.get(
        "/api/roster",
        params={"team_id": traveling_coach["team_b"]},
        headers=_auth_header(uuid.UUID(traveling_coach["auth"])),
    )
    assert resp.status_code == 200
    names = {row["name"] for row in resp.json()}
    assert "Athlete B" in names
    assert "Athlete A" not in names


def test_roster_scoped_to_a_team_the_caller_does_not_belong_to_is_denied(
    client, traveling_coach: dict[str, Any], owner_conn: psycopg.Connection
) -> None:
    other_league = uuid.uuid4()
    other_team = uuid.uuid4()
    owner_conn.execute("insert into league (id, name) values (%s, %s)", (other_league, "Other League"))
    owner_conn.execute(
        "insert into team (id, league_id, name) values (%s, %s, %s)", (other_team, other_league, "Someone Else's Team")
    )

    resp = client.get(
        "/api/roster",
        params={"team_id": str(other_team)},
        headers=_auth_header(uuid.UUID(traveling_coach["auth"])),
    )
    assert resp.status_code == 403
    assert resp.json() == {"error": "not your team"}


# --------------------------------------------------------------------------
# GET /api/observations, /api/practices -- same team_id scoping
# --------------------------------------------------------------------------


def test_observations_scoped_to_team_a_excludes_team_bs_observation(client, traveling_coach: dict[str, Any]) -> None:
    resp = client.get(
        "/api/observations",
        params={"team_id": traveling_coach["team_a"]},
        headers=_auth_header(uuid.UUID(traveling_coach["auth"])),
    )
    assert resp.status_code == 200
    obs = resp.json()
    assert all(o["team_id"] == traveling_coach["team_a"] for o in obs)
    assert any(o["id"] == traveling_coach["obs_a"] for o in obs)
    assert not any(o["id"] == traveling_coach["obs_b"] for o in obs)


def test_practices_scoped_to_team_b_excludes_team_as_practice(client, traveling_coach: dict[str, Any]) -> None:
    resp = client.get(
        "/api/practices",
        params={"team_id": traveling_coach["team_b"]},
        headers=_auth_header(uuid.UUID(traveling_coach["auth"])),
    )
    assert resp.status_code == 200
    practices = resp.json()
    assert all(p["team_id"] == traveling_coach["team_b"] for p in practices)
    assert any(p["id"] == traveling_coach["practice_b"] for p in practices)
    assert not any(p["id"] == traveling_coach["practice_a"] for p in practices)


def test_attendance_scope_combines_with_existing_practice_id_filter(
    client, traveling_coach: dict[str, Any], owner_conn: psycopg.Connection
) -> None:
    """attendance already had an optional practice_id filter -- team_id must
    compose with it (both applied), not replace it."""
    attendance_id = uuid.uuid4()
    owner_conn.execute(
        """
        insert into attendance (id, practice_id, person_id, team_id, ride_group_id, status, marked_by)
        values (%s, %s, %s, %s, %s, 'attending', %s)
        """,
        (
            attendance_id,
            traveling_coach["practice_a"],
            traveling_coach["athlete_a"],
            traveling_coach["team_a"],
            traveling_coach["group_a"],
            traveling_coach["persona_a"],
        ),
    )

    resp = client.get(
        "/api/attendance",
        params={"practice_id": traveling_coach["practice_a"], "team_id": traveling_coach["team_a"]},
        headers=_auth_header(uuid.UUID(traveling_coach["auth"])),
    )
    assert resp.status_code == 200
    rows = resp.json()
    assert len(rows) == 1
    assert rows[0]["id"] == str(attendance_id)

    # Same practice_id but the OTHER team -> filtered out entirely (practice
    # A's attendance row has team_id = team_a, so team_id=team_b excludes it).
    resp2 = client.get(
        "/api/attendance",
        params={"practice_id": traveling_coach["practice_a"], "team_id": traveling_coach["team_b"]},
        headers=_auth_header(uuid.UUID(traveling_coach["auth"])),
    )
    assert resp2.status_code == 200
    assert resp2.json() == []

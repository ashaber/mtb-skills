"""Live-Postgres, full-stack integration tests for the `/api/*` routes
(app/routes.py, app/deps.py) -- the crown-jewel proof that Postgres RLS
enforces multi-coach visibility all the way through the HTTP layer, not
just at the `app.db.rls_connection` unit level (that's already covered by
tests/backend/test_db.py).

Mints REAL Supabase-shaped JWTs with pyjwt, signed with the same
`SUPABASE_JWT_SECRET` the app is configured with in this file's `client`
fixture, and drives the actual FastAPI app end to end via `TestClient`:
Bearer token -> app.deps.get_caller -> app.routes.* -> app.db.rls_connection
-> Postgres RLS. No mocked deps anywhere in this file -- this is the real
request path a browser (via the future frontend sync layer) would exercise.

Requires MTB_TEST_DB_URL pointed at a Postgres with
tests/db/setup_test_auth.sql + every supabase/migrations/*.sql already
applied, and `authenticated`'s table grants in place (0003_grants.sql)
-- same prerequisite as tests/backend/test_db.py, see this directory's
conftest.py. Skips (doesn't fail) if unset.
"""

from __future__ import annotations

import importlib
import time
import uuid
from typing import Any

import jwt
import psycopg
import pytest

# Fixed test-only secret this file signs and configures the app with --
# unrelated to any real Supabase project's secret. Deliberately >= 32 bytes
# to avoid pyjwt's InsecureKeyLengthWarning.
TEST_SUPABASE_JWT_SECRET = "test-api-rls-supabase-jwt-secret-32bytes-min"


def _token(sub: uuid.UUID, *, exp_delta: int = 3600) -> str:
    """A real HS256 JWT shaped like a Supabase session token: `sub` (the
    `auth.users.id`) and a future `exp`, signed with
    TEST_SUPABASE_JWT_SECRET -- the exact secret the `client` fixture below
    configures the running app with."""
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
    """A TestClient over the real FastAPI app, pointed at the live
    MTB_TEST_DB_URL Postgres and configured with TEST_SUPABASE_JWT_SECRET.
    Reloads app.main so create_app() re-reads this env on every test --
    mirrors tests/api/conftest.py's client fixture, kept separate from it
    (that one is deliberately DB-free / placeholder-env only)."""
    monkeypatch.setenv("DATABASE_URL", db_url)
    monkeypatch.setenv("SESSION_SECRET", "test-session-secret")
    monkeypatch.setenv("GOOGLE_CLIENT_ID", "test.apps.googleusercontent.com")
    monkeypatch.setenv("SUPABASE_URL", "https://placeholder.supabase.co")  # required; JWKS unused (tokens are HS256)
    monkeypatch.setenv("SUPABASE_JWT_SECRET", TEST_SUPABASE_JWT_SECRET)  # HS256 path for the test tokens

    from fastapi.testclient import TestClient

    from app import main as main_module

    importlib.reload(main_module)
    return TestClient(main_module.app)


@pytest.fixture
def seed(owner_conn: psycopg.Connection) -> dict[str, Any]:
    """Team T with two ride groups (A1, A2, each with their own coach +
    athlete + a pre-existing observation) plus an HC persona, and a wholly
    separate Team B (its own coach + athlete + observation) -- proves BOTH
    intra-team isolation (A1's coach can't see A2's rows) AND cross-team
    isolation (neither A1 nor A2 can see Team B), through the full HTTP
    stack, in one seed. Mirrors the seeding style in
    tests/backend/test_db.py's `seed` fixture."""
    ids = {
        name: uuid.uuid4()
        for name in (
            "league",
            "team_t",
            "team_b",
            "group_a1",
            "group_a2",
            "group_b",
            "coach_a1_person",
            "coach_a1_auth",
            "coach_a2_person",
            "coach_a2_auth",
            "hc_person",
            "hc_auth",
            "coach_b_person",
            "coach_b_auth",
            "athlete_a1",
            "athlete_a2",
            "athlete_b",
            "obs_a1",
            "obs_a2",
            "obs_b",
        )
    }

    owner_conn.execute("insert into league (id, name) values (%s, %s)", (ids["league"], "L"))
    owner_conn.execute(
        "insert into team (id, league_id, name) values (%s, %s, %s)", (ids["team_t"], ids["league"], "Team T")
    )
    owner_conn.execute(
        "insert into team (id, league_id, name) values (%s, %s, %s)", (ids["team_b"], ids["league"], "Team B")
    )
    owner_conn.execute(
        "insert into ride_group (id, team_id, name) values (%s, %s, %s)", (ids["group_a1"], ids["team_t"], "A1")
    )
    owner_conn.execute(
        "insert into ride_group (id, team_id, name) values (%s, %s, %s)", (ids["group_a2"], ids["team_t"], "A2")
    )
    owner_conn.execute(
        "insert into ride_group (id, team_id, name) values (%s, %s, %s)", (ids["group_b"], ids["team_b"], "B")
    )

    def _person(person_id: uuid.UUID, team_id: uuid.UUID, ride_group_id: uuid.UUID | None, role: str, name: str) -> None:
        owner_conn.execute(
            "insert into person (id, team_id, ride_group_id, role, name) values (%s, %s, %s, %s, %s)",
            (person_id, team_id, ride_group_id, role, name),
        )

    def _auth(auth_id: uuid.UUID, person_id: uuid.UUID) -> None:
        owner_conn.execute("insert into auth_person (auth_user_id, person_id) values (%s, %s)", (auth_id, person_id))

    _person(ids["coach_a1_person"], ids["team_t"], ids["group_a1"], "coach", "Coach A1")
    _auth(ids["coach_a1_auth"], ids["coach_a1_person"])
    _person(ids["coach_a2_person"], ids["team_t"], ids["group_a2"], "coach", "Coach A2")
    _auth(ids["coach_a2_auth"], ids["coach_a2_person"])
    _person(ids["hc_person"], ids["team_t"], None, "head_coach", "Head Coach")
    _auth(ids["hc_auth"], ids["hc_person"])
    _person(ids["coach_b_person"], ids["team_b"], ids["group_b"], "coach", "Coach B")
    _auth(ids["coach_b_auth"], ids["coach_b_person"])
    _person(ids["athlete_a1"], ids["team_t"], ids["group_a1"], "athlete", "Athlete A1")
    _person(ids["athlete_a2"], ids["team_t"], ids["group_a2"], "athlete", "Athlete A2")
    _person(ids["athlete_b"], ids["team_b"], ids["group_b"], "athlete", "Athlete B")

    owner_conn.execute(
        """
        insert into observation
            (id, athlete_id, team_id, coach_id, ride_group_id, session_date, skill, level_observed, notes)
        values (%s, %s, %s, %s, %s, current_date, 'cornering', 2, 'seed a1')
        """,
        (ids["obs_a1"], ids["athlete_a1"], ids["team_t"], ids["coach_a1_person"], ids["group_a1"]),
    )
    owner_conn.execute(
        """
        insert into observation
            (id, athlete_id, team_id, coach_id, ride_group_id, session_date, skill, level_observed, notes)
        values (%s, %s, %s, %s, %s, current_date, 'braking', 3, 'seed a2')
        """,
        (ids["obs_a2"], ids["athlete_a2"], ids["team_t"], ids["coach_a2_person"], ids["group_a2"]),
    )
    owner_conn.execute(
        """
        insert into observation
            (id, athlete_id, team_id, coach_id, ride_group_id, session_date, skill, level_observed, notes)
        values (%s, %s, %s, %s, %s, current_date, 'body_position', 4, 'seed b')
        """,
        (ids["obs_b"], ids["athlete_b"], ids["team_b"], ids["coach_b_person"], ids["group_b"]),
    )

    return ids


# --------------------------------------------------------------------------
# GET /api/me
# --------------------------------------------------------------------------


def test_get_me_returns_coach_a1s_own_persona(client, seed: dict[str, Any]) -> None:
    resp = client.get("/api/me", headers=_auth_header(seed["coach_a1_auth"]))

    assert resp.status_code == 200
    personas = resp.json()["personas"]
    assert len(personas) == 1
    assert personas[0] == {
        "person_id": str(seed["coach_a1_person"]),
        "role": "coach",
        "team_id": str(seed["team_t"]),
        "ride_group_id": str(seed["group_a1"]),
        "name": "Coach A1",
    }


# --------------------------------------------------------------------------
# GET /api/observations -- ride-group scoping and team-wide HC scoping.
# --------------------------------------------------------------------------


def test_get_observations_scoped_to_coach_a1s_ride_group_only(client, seed: dict[str, Any]) -> None:
    resp = client.get("/api/observations", headers=_auth_header(seed["coach_a1_auth"]))

    assert resp.status_code == 200
    ids = {row["id"] for row in resp.json()}
    assert ids == {str(seed["obs_a1"])}


def test_hc_token_sees_whole_team_but_not_other_team(client, seed: dict[str, Any]) -> None:
    resp = client.get("/api/observations", headers=_auth_header(seed["hc_auth"]))

    assert resp.status_code == 200
    ids = {row["id"] for row in resp.json()}
    assert ids == {str(seed["obs_a1"]), str(seed["obs_a2"])}
    assert str(seed["obs_b"]) not in ids


# --------------------------------------------------------------------------
# POST /api/observations -- own-group succeeds; sibling-group and
# cross-team are denied by RLS through the HTTP layer.
# --------------------------------------------------------------------------


def test_post_observation_for_own_group_athlete_succeeds_and_is_attributed_correctly(
    client, seed: dict[str, Any]
) -> None:
    resp = client.post(
        "/api/observations",
        headers=_auth_header(seed["coach_a1_auth"]),
        json={"athlete_id": str(seed["athlete_a1"]), "skill": "body_position", "level_observed": 3},
    )

    assert resp.status_code == 201
    body = resp.json()
    assert body["athlete_id"] == str(seed["athlete_a1"])
    assert body["team_id"] == str(seed["team_t"])
    assert body["ride_group_id"] == str(seed["group_a1"])
    assert body["coach_id"] == str(seed["coach_a1_person"])
    assert body["skill"] == "body_position"
    assert body["level_observed"] == 3

    # Visible on a subsequent GET by the same coach -- proves the INSERT
    # actually committed, not just that the response looked right.
    listing = client.get("/api/observations", headers=_auth_header(seed["coach_a1_auth"]))
    assert body["id"] in {row["id"] for row in listing.json()}


def test_post_observation_with_client_id_is_idempotent(client, seed: dict[str, Any]) -> None:
    """Offline-first sync: the client mints the observation id, so re-pushing
    the same id (e.g. a pull followed by a re-sync) is a no-op, not a dup."""
    obs_id = str(uuid.uuid4())
    payload = {
        "id": obs_id,
        "athlete_id": str(seed["athlete_a1"]),
        "skill": "braking",
        "level_observed": 2,
    }
    first = client.post("/api/observations", headers=_auth_header(seed["coach_a1_auth"]), json=payload)
    assert first.status_code == 201
    assert first.json()["id"] == obs_id

    # replay the exact same push
    second = client.post("/api/observations", headers=_auth_header(seed["coach_a1_auth"]), json=payload)
    assert second.status_code in (200, 201)
    assert second.json()["id"] == obs_id

    # exactly one row with that id, not two
    listing = client.get("/api/observations", headers=_auth_header(seed["coach_a1_auth"]))
    assert [row["id"] for row in listing.json()].count(obs_id) == 1


def test_post_observation_for_sibling_ride_group_athlete_is_denied(client, seed: dict[str, Any]) -> None:
    resp = client.post(
        "/api/observations",
        headers=_auth_header(seed["coach_a1_auth"]),
        json={"athlete_id": str(seed["athlete_a2"]), "skill": "cornering", "level_observed": 3},
    )

    assert resp.status_code == 403
    assert resp.json() == {"error": "cannot record for that athlete"}


def test_post_observation_for_other_teams_athlete_is_denied(client, seed: dict[str, Any]) -> None:
    resp = client.post(
        "/api/observations",
        headers=_auth_header(seed["coach_a1_auth"]),
        json={"athlete_id": str(seed["athlete_b"]), "skill": "cornering", "level_observed": 3},
    )

    assert resp.status_code == 403
    assert resp.json() == {"error": "cannot record for that athlete"}


def test_hc_can_post_observation_for_a_ride_group_that_isnt_their_own(client, seed: dict[str, Any]) -> None:
    resp = client.post(
        "/api/observations",
        headers=_auth_header(seed["hc_auth"]),
        json={"athlete_id": str(seed["athlete_a2"]), "skill": "braking", "level_observed": 2},
    )

    assert resp.status_code == 201
    body = resp.json()
    assert body["ride_group_id"] == str(seed["group_a2"])
    assert body["coach_id"] == str(seed["hc_person"])


# --------------------------------------------------------------------------
# POST /api/confirmed-levels -- LWW upsert by (athlete_id, skill), and the
# same RLS denial behavior as observations.
# --------------------------------------------------------------------------


def test_confirmed_level_post_upserts_lww_not_a_duplicate_row(client, seed: dict[str, Any]) -> None:
    first = client.post(
        "/api/confirmed-levels",
        headers=_auth_header(seed["coach_a1_auth"]),
        json={"athlete_id": str(seed["athlete_a1"]), "skill": "cornering", "level": 2},
    )
    assert first.status_code == 200
    first_body = first.json()
    assert first_body["level"] == 2
    assert first_body["coach_id"] == str(seed["coach_a1_person"])

    second = client.post(
        "/api/confirmed-levels",
        headers=_auth_header(seed["coach_a1_auth"]),
        json={"athlete_id": str(seed["athlete_a1"]), "skill": "cornering", "level": 4},
    )
    assert second.status_code == 200
    second_body = second.json()
    assert second_body["id"] == first_body["id"], "LWW upsert must update the same row, not insert a new one"
    assert second_body["level"] == 4
    assert second_body["confirmed_at"] >= first_body["confirmed_at"]

    listing = client.get("/api/confirmed-levels", headers=_auth_header(seed["coach_a1_auth"]))
    matching = [
        row for row in listing.json() if row["athlete_id"] == str(seed["athlete_a1"]) and row["skill"] == "cornering"
    ]
    assert len(matching) == 1
    assert matching[0]["level"] == 4


def test_confirmed_level_post_for_other_teams_athlete_is_denied(client, seed: dict[str, Any]) -> None:
    resp = client.post(
        "/api/confirmed-levels",
        headers=_auth_header(seed["coach_a1_auth"]),
        json={"athlete_id": str(seed["athlete_b"]), "skill": "braking", "level": 3},
    )

    assert resp.status_code == 403
    assert resp.json() == {"error": "cannot record for that athlete"}


# --------------------------------------------------------------------------
# GET /api/roster -- same ride-group / team scoping as observations.
# --------------------------------------------------------------------------


def test_get_roster_scoped_to_coach_a1s_ride_group_only(client, seed: dict[str, Any]) -> None:
    resp = client.get("/api/roster", headers=_auth_header(seed["coach_a1_auth"]))

    assert resp.status_code == 200
    names = {row["name"] for row in resp.json()}
    assert names == {"Coach A1", "Athlete A1"}


def test_get_roster_for_hc_sees_whole_team_not_other_team(client, seed: dict[str, Any]) -> None:
    resp = client.get("/api/roster", headers=_auth_header(seed["hc_auth"]))

    assert resp.status_code == 200
    names = {row["name"] for row in resp.json()}
    assert names == {"Coach A1", "Coach A2", "Head Coach", "Athlete A1", "Athlete A2"}
    assert "Coach B" not in names
    assert "Athlete B" not in names


# --------------------------------------------------------------------------
# Unrecognized-but-verified caller -- proves the 403 path works through the
# HTTP layer too (not just the tests/api mocked-deps version), for a `sub`
# with no auth_person row at all.
# --------------------------------------------------------------------------


def test_unlinked_auth_user_gets_403_not_a_coach(client, seed: dict[str, Any]) -> None:
    resp = client.get("/api/me", headers=_auth_header(uuid.uuid4()))

    assert resp.status_code == 403
    assert resp.json() == {"error": "not a recognized coach"}

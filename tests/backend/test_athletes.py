"""Live-Postgres, full-stack integration tests for POST /api/athletes
(app/routes.py's `create_athlete`) -- a ride-group coach (or HC/TD) adding
ONE walk-up athlete to a ride group, per docs/PHASE3_RECONCILIATION_PLAN.md
decision (a). Also covers `tags` (supabase/migrations/0007_person_tags.sql)
round-tripping through POST /api/roster/import + GET /api/roster, and a
direct-RLS proof of supabase/migrations/0008_coach_add_athlete_rls.sql's
new INSERT policy (bypassing the HTTP layer, straight through
app.db.rls_connection -- mirrors tests/backend/test_db.py's style).

Mirrors tests/backend/test_api_rls.py's / test_roster_import.py's pattern:
mints real Supabase-shaped HS256 JWTs and drives the actual FastAPI app end
to end via TestClient. Requires MTB_TEST_DB_URL -- see tests/backend/
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

from app.db import rls_connection

TEST_SUPABASE_JWT_SECRET = "test-athletes-supabase-jwt-secret-32bytes-minimum"


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
    """Same shape as test_api_rls.py's / test_roster_import.py's `client`
    fixture, own JWT secret."""
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
    """Team A with two ride groups (A1, A2 -- each with their own
    ride-group coach) plus an HC persona, and a wholly separate Team B with
    its own ride group -- enough to prove: own-group add succeeds,
    sibling-group add is denied, cross-team group add is denied, and HC can
    add to any group on their own team."""
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
            "coach_a2_person",
            "coach_a2_auth",
            "hc_a_person",
            "hc_a_auth",
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
        "insert into person (id, team_id, ride_group_id, role, name) values (%s, %s, %s, 'coach', %s)",
        (ids["coach_a2_person"], ids["team_a"], ids["group_a2"], "Coach A2"),
    )
    owner_conn.execute(
        "insert into auth_person (auth_user_id, person_id) values (%s, %s)",
        (ids["coach_a2_auth"], ids["coach_a2_person"]),
    )
    owner_conn.execute(
        "insert into person (id, team_id, ride_group_id, role, name) values (%s, %s, null, 'head_coach', %s)",
        (ids["hc_a_person"], ids["team_a"], "HC A"),
    )
    owner_conn.execute(
        "insert into auth_person (auth_user_id, person_id) values (%s, %s)", (ids["hc_a_auth"], ids["hc_a_person"])
    )

    return ids


# --------------------------------------------------------------------------
# POST /api/athletes -- happy path + scoping, via the real HTTP layer.
# --------------------------------------------------------------------------


def test_ride_group_coach_adds_athlete_to_own_group(
    client, seed: dict[str, Any], owner_conn: psycopg.Connection
) -> None:
    name = _unique("Walkup Athlete")

    resp = client.post(
        "/api/athletes",
        headers=_auth_header(seed["coach_a1_auth"]),
        json={"name": name, "ride_group_id": str(seed["group_a1"]), "grade": 7, "category": "7th"},
    )

    assert resp.status_code == 201
    body = resp.json()
    assert body["name"] == name
    assert body["role"] == "athlete"
    assert body["team_id"] == str(seed["team_a"])
    assert body["ride_group_id"] == str(seed["group_a1"])
    assert body["ride_group_name"] == "A1"  # denormalized from the group
    assert body["grade"] == 7
    assert body["category"] == "7th"
    assert body["tags"] == []

    row = owner_conn.execute(
        "select role, team_id, ride_group_id from person where id = %s", (uuid.UUID(body["id"]),)
    ).fetchone()
    assert row == ("athlete", seed["team_a"], seed["group_a1"])

    # Visible on a subsequent GET by the same coach.
    roster = client.get("/api/roster", headers=_auth_header(seed["coach_a1_auth"]))
    assert name in {p["name"] for p in roster.json()}


def test_ride_group_coach_cannot_add_athlete_to_a_group_they_dont_coach(client, seed: dict[str, Any]) -> None:
    resp = client.post(
        "/api/athletes",
        headers=_auth_header(seed["coach_a1_auth"]),
        json={"name": _unique("Should Not Add"), "ride_group_id": str(seed["group_a2"])},
    )

    assert resp.status_code == 403
    assert resp.json() == {"error": "cannot add to that group"}


def test_ride_group_coach_cannot_add_athlete_to_another_teams_group(client, seed: dict[str, Any]) -> None:
    resp = client.post(
        "/api/athletes",
        headers=_auth_header(seed["coach_a1_auth"]),
        json={"name": _unique("Cross Team"), "ride_group_id": str(seed["group_b1"])},
    )

    assert resp.status_code == 403
    assert resp.json() == {"error": "cannot add to that group"}


def test_hc_adds_athlete_to_any_group_on_their_team(
    client, seed: dict[str, Any], owner_conn: psycopg.Connection
) -> None:
    name = _unique("HC Added Athlete")

    resp = client.post(
        "/api/athletes",
        headers=_auth_header(seed["hc_a_auth"]),
        json={"name": name, "ride_group_id": str(seed["group_a2"])},
    )

    assert resp.status_code == 201
    body = resp.json()
    assert body["role"] == "athlete"
    assert body["ride_group_id"] == str(seed["group_a2"])

    row = owner_conn.execute(
        "select role, team_id from person where id = %s", (uuid.UUID(body["id"]),)
    ).fetchone()
    assert row == ("athlete", seed["team_a"])


def test_nonexistent_ride_group_id_is_denied_403(client, seed: dict[str, Any]) -> None:
    resp = client.post(
        "/api/athletes",
        headers=_auth_header(seed["coach_a1_auth"]),
        json={"name": _unique("Ghost Group"), "ride_group_id": str(uuid.uuid4())},
    )

    assert resp.status_code == 403
    assert resp.json() == {"error": "cannot add to that group"}


def test_unauthenticated_request_gets_401(client, seed: dict[str, Any]) -> None:
    resp = client.post("/api/athletes", json={"name": "X", "ride_group_id": str(seed["group_a1"])})
    assert resp.status_code == 401


# --------------------------------------------------------------------------
# A client can't sneak `role` (or any other unknown field) past this
# endpoint -- it only ever creates athletes.
# --------------------------------------------------------------------------


def test_role_field_in_request_body_is_rejected_400(client, seed: dict[str, Any]) -> None:
    resp = client.post(
        "/api/athletes",
        headers=_auth_header(seed["coach_a1_auth"]),
        json={"name": _unique("Sneaky Coach"), "ride_group_id": str(seed["group_a1"]), "role": "coach"},
    )

    assert resp.status_code == 400


def test_team_id_field_in_request_body_is_rejected_400(client, seed: dict[str, Any]) -> None:
    resp = client.post(
        "/api/athletes",
        headers=_auth_header(seed["coach_a1_auth"]),
        json={
            "name": _unique("Sneaky Team"),
            "ride_group_id": str(seed["group_a1"]),
            "team_id": str(seed["team_b"]),
        },
    )

    assert resp.status_code == 400


def test_blank_name_rejected_400(client, seed: dict[str, Any]) -> None:
    resp = client.post(
        "/api/athletes",
        headers=_auth_header(seed["coach_a1_auth"]),
        json={"name": "   ", "ride_group_id": str(seed["group_a1"])},
    )

    assert resp.status_code == 400


# --------------------------------------------------------------------------
# Direct-RLS proof of supabase/migrations/0008_coach_add_athlete_rls.sql --
# straight through app.db.rls_connection, bypassing the HTTP layer/route
# entirely, so this proves the DATABASE denies it (not just that the route
# happens not to expose a way to try it).
# --------------------------------------------------------------------------


def test_rls_denies_coach_inserting_a_coach_role_person_into_own_group(
    db_url: str, seed: dict[str, Any]
) -> None:
    """The new policy's `role = 'athlete'` clause is load-bearing -- a
    ride-group coach still cannot insert a `role = 'coach'` person, even
    into their own group, even though the ride_group_id + team_id would
    otherwise satisfy the policy."""
    new_id = uuid.uuid4()
    with pytest.raises(psycopg.Error):
        with rls_connection(db_url, str(seed["coach_a1_auth"])) as conn:
            conn.execute(
                "insert into person (id, team_id, ride_group_id, role, name) values (%s, %s, %s, 'coach', %s)",
                (new_id, seed["team_a"], seed["group_a1"], _unique("Sneaky Coach Row")),
            )


def test_rls_denies_coach_inserting_athlete_into_another_teams_group(db_url: str, seed: dict[str, Any]) -> None:
    """team_id/ride_group_id are pinned together -- app_caller_ride_group_ids()
    never returns group_b1 for coach_a1 at all, so this is denied before the
    team_id pin even matters, but proves the end result regardless."""
    new_id = uuid.uuid4()
    with pytest.raises(psycopg.Error):
        with rls_connection(db_url, str(seed["coach_a1_auth"])) as conn:
            conn.execute(
                "insert into person (id, team_id, ride_group_id, role, name) values (%s, %s, %s, 'athlete', %s)",
                (new_id, seed["team_b"], seed["group_b1"], _unique("Cross Team Row")),
            )


def test_rls_denies_mismatched_team_id_and_ride_group_id_pairing(db_url: str, seed: dict[str, Any]) -> None:
    """A caller pairing their OWN ride_group_id with an unrelated team_id
    (the "spoofed team_id" case the migration's comment calls out) is
    denied by the team_id pin, even though ride_group_id alone would pass
    app_caller_ride_group_ids()."""
    new_id = uuid.uuid4()
    with pytest.raises(psycopg.Error):
        with rls_connection(db_url, str(seed["coach_a1_auth"])) as conn:
            conn.execute(
                "insert into person (id, team_id, ride_group_id, role, name) values (%s, %s, %s, 'athlete', %s)",
                (new_id, seed["team_b"], seed["group_a1"], _unique("Spoofed Team Row")),
            )


def test_rls_allows_coach_inserting_athlete_into_own_group_directly(
    db_url: str, seed: dict[str, Any], owner_conn: psycopg.Connection
) -> None:
    """Positive control for the three denial tests above -- proves the
    policy actually grants the intended case, not just that everything is
    denied."""
    new_id = uuid.uuid4()
    name = _unique("Direct RLS Athlete")
    with rls_connection(db_url, str(seed["coach_a1_auth"])) as conn:
        conn.execute(
            "insert into person (id, team_id, ride_group_id, role, name) values (%s, %s, %s, 'athlete', %s)",
            (new_id, seed["team_a"], seed["group_a1"], name),
        )

    row = owner_conn.execute("select role, team_id, ride_group_id from person where id = %s", (new_id,)).fetchone()
    assert row == ("athlete", seed["team_a"], seed["group_a1"])


# --------------------------------------------------------------------------
# tags (supabase/migrations/0007_person_tags.sql) round-trip through
# POST /api/roster/import + GET /api/roster.
# --------------------------------------------------------------------------


def test_imported_tags_round_trip_through_get_roster(
    client, seed: dict[str, Any], owner_conn: psycopg.Connection
) -> None:
    name = _unique("Tagged Coach")

    resp = client.post(
        "/api/roster/import",
        headers=_auth_header(seed["hc_a_auth"]),
        json={"rows": [{"name": name, "role": "coach", "tags": ["Lead", " Sweep ", "lead"]}]},
    )
    assert resp.status_code == 200
    assert resp.json()["people_created"] == 1

    row = owner_conn.execute("select tags from person where team_id = %s and name = %s", (seed["team_a"], name)).fetchone()
    assert sorted(row[0]) == ["lead", "sweep"]

    roster = client.get("/api/roster", headers=_auth_header(seed["hc_a_auth"]))
    entry = next(p for p in roster.json() if p["name"] == name)
    assert sorted(entry["tags"]) == ["lead", "sweep"]


def test_reimport_replaces_tags(client, seed: dict[str, Any], owner_conn: psycopg.Connection) -> None:
    name = _unique("Retagged Coach")

    first = client.post(
        "/api/roster/import",
        headers=_auth_header(seed["hc_a_auth"]),
        json={"rows": [{"name": name, "role": "coach", "tags": ["lead"]}]},
    )
    assert first.status_code == 200
    assert first.json()["people_created"] == 1

    second = client.post(
        "/api/roster/import",
        headers=_auth_header(seed["hc_a_auth"]),
        json={"rows": [{"name": name, "role": "coach", "tags": ["sweep", "floater"]}]},
    )
    assert second.status_code == 200
    assert second.json()["people_updated"] == 1

    row = owner_conn.execute("select tags from person where team_id = %s and name = %s", (seed["team_a"], name)).fetchone()
    assert sorted(row[0]) == ["floater", "sweep"]


def test_imported_row_with_no_tags_defaults_to_empty_list(
    client, seed: dict[str, Any], owner_conn: psycopg.Connection
) -> None:
    name = _unique("Untagged Athlete")

    resp = client.post(
        "/api/roster/import",
        headers=_auth_header(seed["hc_a_auth"]),
        json={"rows": [{"name": name, "role": "athlete"}]},
    )
    assert resp.status_code == 200
    assert resp.json()["people_created"] == 1

    row = owner_conn.execute("select tags from person where team_id = %s and name = %s", (seed["team_a"], name)).fetchone()
    assert row[0] == []


def test_roster_carries_ride_group_name_and_null_for_ungrouped(client, seed: dict[str, Any]) -> None:
    # GET /api/roster denormalizes each person's ride_group name so the
    # frontend can show/filter by group without a second round-trip. The HC
    # (ride_group_id null) must come back with ride_group_name null, not an
    # error or a stray name.
    roster = {p["name"]: p for p in client.get("/api/roster", headers=_auth_header(seed["hc_a_auth"])).json()}

    assert roster["Coach A1"]["ride_group_name"] == "A1"  # grouped -> group name
    assert roster["Coach A2"]["ride_group_name"] == "A2"
    assert roster["HC A"]["ride_group_id"] is None
    assert roster["HC A"]["ride_group_name"] is None  # ungrouped -> null, no error

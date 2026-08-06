"""Live-Postgres, full-stack integration tests for POST /api/roster/import
(app/roster.py, app/routes.py's `import_roster` route) -- the HC/TD bulk
roster-upsert endpoint that a future frontend CSV/Google-Sheet importer
(CLAUDE.md's Phase 2b) will POST already-parsed rows to.

Mirrors tests/backend/test_api_rls.py's / test_onboarding.py's pattern:
mints real Supabase-shaped HS256 JWTs, drives the actual FastAPI app end to
end via TestClient (Bearer token -> app.deps.get_caller -> app.routes.
import_roster -> app.roster.import_roster -> Postgres RLS), and separately
exercises app.onboarding.bootstrap_link directly to prove an HC-imported
coach email actually feeds first-login onboarding end to end.

Requires MTB_TEST_DB_URL pointed at a Postgres with
tests/db/setup_test_auth.sql + every supabase/migrations/*.sql already
applied. Skips (doesn't fail) if unset -- see tests/backend/conftest.py.

owner_conn is autocommit and function-scoped but NOT per-test-data-isolated
(rows inserted by one test remain visible to later tests in the same run --
same caveat tests/backend/test_api_rls.py and test_onboarding.py document).
Every test below therefore mints fresh per-test names/emails/external_ids
(via `_unique`) so a test's assertions never accidentally match a different
test's leftover rows.
"""

from __future__ import annotations

import importlib
import time
import uuid
from typing import Any

import jwt
import psycopg
import pytest

from app.db import service_connection
from app.onboarding import bootstrap_link

TEST_SUPABASE_JWT_SECRET = "test-roster-import-supabase-jwt-secret-32bytes-min"


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
    """Same shape as test_api_rls.py's `client` fixture, own JWT secret."""
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
    """Team A (an HC persona + a ride-group coach persona, one pre-existing
    ride group) and a wholly separate Team B (its own HC persona) -- proves
    both "HC can import onto their own team" and "a second team's HC
    importing never touches Team A"."""
    ids: dict[str, Any] = {
        name: uuid.uuid4()
        for name in (
            "league",
            "team_a",
            "team_b",
            "group_a_existing",
            "hc_a_person",
            "hc_a_auth",
            "coach_a_person",
            "coach_a_auth",
            "hc_b_person",
            "hc_b_auth",
        )
    }
    ids["hc_a_email"] = f"{_unique('hc-a')}@x.example"
    ids["hc_b_email"] = f"{_unique('hc-b')}@x.example"

    owner_conn.execute("insert into league (id, name) values (%s, %s)", (ids["league"], "L"))
    owner_conn.execute(
        "insert into team (id, league_id, name) values (%s, %s, %s)", (ids["team_a"], ids["league"], "Team A")
    )
    owner_conn.execute(
        "insert into team (id, league_id, name) values (%s, %s, %s)", (ids["team_b"], ids["league"], "Team B")
    )
    owner_conn.execute(
        "insert into ride_group (id, team_id, name) values (%s, %s, %s)",
        (ids["group_a_existing"], ids["team_a"], _unique("Existing Group")),
    )
    owner_conn.execute(
        "insert into person (id, team_id, ride_group_id, role, name, email) values (%s, %s, null, 'head_coach', %s, %s)",
        (ids["hc_a_person"], ids["team_a"], "HC A", ids["hc_a_email"]),
    )
    owner_conn.execute(
        "insert into auth_person (auth_user_id, person_id) values (%s, %s)", (ids["hc_a_auth"], ids["hc_a_person"])
    )
    owner_conn.execute(
        "insert into person (id, team_id, ride_group_id, role, name) values (%s, %s, %s, 'coach', %s)",
        (ids["coach_a_person"], ids["team_a"], ids["group_a_existing"], "Ride Group Coach A"),
    )
    owner_conn.execute(
        "insert into auth_person (auth_user_id, person_id) values (%s, %s)",
        (ids["coach_a_auth"], ids["coach_a_person"]),
    )
    owner_conn.execute(
        "insert into person (id, team_id, ride_group_id, role, name, email) values (%s, %s, null, 'head_coach', %s, %s)",
        (ids["hc_b_person"], ids["team_b"], "HC B", ids["hc_b_email"]),
    )
    owner_conn.execute(
        "insert into auth_person (auth_user_id, person_id) values (%s, %s)", (ids["hc_b_auth"], ids["hc_b_person"])
    )

    return ids


def _people_by_team(owner_conn: psycopg.Connection, team_id: uuid.UUID, names: list[str]) -> list[tuple]:
    return owner_conn.execute(
        """
        select name, role, email, external_id, ride_group_id
        from person
        where team_id = %s and name = any(%s)
        order by name
        """,
        (team_id, names),
    ).fetchall()


# --------------------------------------------------------------------------
# Happy path: mixed roster import creates people + ride groups.
# --------------------------------------------------------------------------


def test_hc_imports_mixed_roster_creates_people_and_groups(
    client, seed: dict[str, Any], owner_conn: psycopg.Connection
) -> None:
    group1 = _unique("Group One")
    group2 = _unique("Group Two")
    coach1_name, coach2_name = _unique("Coach One"), _unique("Coach Two")
    athlete1_name, athlete2_name, athlete3_name = (
        _unique("Athlete One"),
        _unique("Athlete Two"),
        _unique("Athlete Three"),
    )
    coach1_email = f"{_unique('coach1')}@x.example"
    coach2_email = f"{_unique('coach2')}@x.example"

    rows = [
        {"name": coach1_name, "role": "coach", "email": coach1_email, "ride_group": group1},
        {"name": coach2_name, "role": "coach", "email": coach2_email, "ride_group": group2},
        {"name": athlete1_name, "role": "athlete", "ride_group": group1},
        {"name": athlete2_name, "role": "athlete", "ride_group": group1},
        {"name": athlete3_name, "role": "athlete", "ride_group": group2},
    ]

    resp = client.post("/api/roster/import", headers=_auth_header(seed["hc_a_auth"]), json={"rows": rows})

    assert resp.status_code == 200
    body = resp.json()
    assert body == {"people_created": 5, "people_updated": 0, "groups_created": 2, "skipped": []}

    groups = owner_conn.execute(
        "select id, name from ride_group where team_id = %s and name = any(%s)",
        (seed["team_a"], [group1, group2]),
    ).fetchall()
    assert len(groups) == 2
    group_id_by_name = {name: gid for gid, name in groups}

    people = _people_by_team(
        owner_conn, seed["team_a"], [coach1_name, coach2_name, athlete1_name, athlete2_name, athlete3_name]
    )
    assert len(people) == 5
    by_name = {row[0]: row for row in people}
    assert by_name[coach1_name][1] == "coach"
    assert by_name[coach1_name][2] == coach1_email
    assert by_name[coach1_name][4] == group_id_by_name[group1]
    assert by_name[athlete3_name][1] == "athlete"
    assert by_name[athlete3_name][4] == group_id_by_name[group2]


def test_reimport_same_rows_is_idempotent_no_duplicates(
    client, seed: dict[str, Any], owner_conn: psycopg.Connection
) -> None:
    group1 = _unique("Group Reimport")
    name = _unique("Reimport Athlete")
    rows = [{"name": name, "role": "athlete", "ride_group": group1}]

    first = client.post("/api/roster/import", headers=_auth_header(seed["hc_a_auth"]), json={"rows": rows})
    assert first.status_code == 200
    assert first.json() == {"people_created": 1, "people_updated": 0, "groups_created": 1, "skipped": []}

    second = client.post("/api/roster/import", headers=_auth_header(seed["hc_a_auth"]), json={"rows": rows})
    assert second.status_code == 200
    assert second.json() == {"people_created": 0, "people_updated": 1, "groups_created": 0, "skipped": []}

    people = owner_conn.execute(
        "select count(*) from person where team_id = %s and name = %s", (seed["team_a"], name)
    ).fetchone()
    assert people[0] == 1
    groups = owner_conn.execute(
        "select count(*) from ride_group where team_id = %s and name = %s", (seed["team_a"], group1)
    ).fetchone()
    assert groups[0] == 1


# --------------------------------------------------------------------------
# Merge-key precedence: external_id (exact) then email (case-insensitive).
# --------------------------------------------------------------------------


def test_external_id_merge_updates_existing_person_on_name_change(
    client, seed: dict[str, Any], owner_conn: psycopg.Connection
) -> None:
    ext_id = _unique("ext")
    original_name = _unique("Original Name")
    changed_name = _unique("Changed Name")

    first = client.post(
        "/api/roster/import",
        headers=_auth_header(seed["hc_a_auth"]),
        json={"rows": [{"name": original_name, "role": "athlete", "external_id": ext_id}]},
    )
    assert first.status_code == 200
    assert first.json()["people_created"] == 1

    second = client.post(
        "/api/roster/import",
        headers=_auth_header(seed["hc_a_auth"]),
        json={"rows": [{"name": changed_name, "role": "athlete", "external_id": ext_id}]},
    )
    assert second.status_code == 200
    assert second.json() == {"people_created": 0, "people_updated": 1, "groups_created": 0, "skipped": []}

    rows = owner_conn.execute(
        "select name from person where team_id = %s and external_id = %s", (seed["team_a"], ext_id)
    ).fetchall()
    assert [r[0] for r in rows] == [changed_name]


def test_email_and_name_merge_is_case_insensitive(
    client, seed: dict[str, Any], owner_conn: psycopg.Connection
) -> None:
    # Re-importing the SAME person (email + name both agree, just different
    # casing on both) updates in place -- no duplicate. This is the merge
    # key's happy path and the basis of idempotent re-import.
    email = f"{_unique('casey')}@x.example"
    name = _unique("Casey Coach")

    first = client.post(
        "/api/roster/import",
        headers=_auth_header(seed["hc_a_auth"]),
        json={"rows": [{"name": name, "role": "coach", "email": email}]},
    )
    assert first.status_code == 200
    assert first.json()["people_created"] == 1

    second = client.post(
        "/api/roster/import",
        headers=_auth_header(seed["hc_a_auth"]),
        json={"rows": [{"name": name.upper(), "role": "coach", "email": email.upper()}]},
    )
    assert second.status_code == 200
    assert second.json() == {"people_created": 0, "people_updated": 1, "groups_created": 0, "skipped": []}

    rows = owner_conn.execute(
        "select count(*) from person where team_id = %s and lower(email) = lower(%s)", (seed["team_a"], email)
    ).fetchone()
    assert rows[0] == 1


def test_same_email_different_name_stays_two_people(
    client, seed: dict[str, Any], owner_conn: psycopg.Connection
) -> None:
    # PitZone family email: a parent-coach and their athlete can share one
    # email. Email alone must NOT collapse them -- different names => two
    # people. (Regression test for the roster-scramble bug.)
    shared = f"{_unique('family')}@x.example"
    parent = _unique("Parent Coach")
    kid = _unique("Kid Athlete")

    resp = client.post(
        "/api/roster/import",
        headers=_auth_header(seed["hc_a_auth"]),
        json={"rows": [
            {"name": parent, "role": "coach", "email": shared},
            {"name": kid, "role": "athlete", "email": shared},
        ]},
    )
    assert resp.status_code == 200
    assert resp.json()["people_created"] == 2

    rows = owner_conn.execute(
        "select name, role from person where team_id = %s and lower(email) = lower(%s) order by name",
        (seed["team_a"], shared),
    ).fetchall()
    assert len(rows) == 2
    assert {(r[0], r[1]) for r in rows} == {(parent, "coach"), (kid, "athlete")}


def test_same_name_different_email_stays_two_people_in_their_own_groups(
    client, seed: dict[str, Any], owner_conn: psycopg.Connection
) -> None:
    # Two DIFFERENT people who share a name but have different emails must
    # NOT collapse -- and each keeps its OWN ride group. This is the exact
    # failure that scattered the Droid roster (two "Hayden Upton"s in
    # different groups).
    name = _unique("Hayden Upton")
    resp = client.post(
        "/api/roster/import",
        headers=_auth_header(seed["hc_a_auth"]),
        json={"rows": [
            {"name": name, "role": "coach", "email": f"{_unique('h1')}@x.example", "ride_group": "Droid"},
            {"name": name, "role": "coach", "email": f"{_unique('h2')}@x.example", "ride_group": "Leia"},
        ]},
    )
    assert resp.status_code == 200
    assert resp.json()["people_created"] == 2

    rows = owner_conn.execute(
        """
        select rg.name from person p join ride_group rg on rg.id = p.ride_group_id
        where p.team_id = %s and lower(p.name) = lower(%s)
        order by rg.name
        """,
        (seed["team_a"], name),
    ).fetchall()
    assert [r[0] for r in rows] == ["Droid", "Leia"]


def test_no_email_row_name_matches_only_an_emailless_candidate(
    client, seed: dict[str, Any], owner_conn: psycopg.Connection
) -> None:
    # A row without an email falls back to name -- but only against a
    # candidate that ALSO has no email. It must not overwrite a same-named
    # person who carries a distinct email.
    name = _unique("Emailless Ernie")

    # An emailed person of this name exists first.
    client.post(
        "/api/roster/import",
        headers=_auth_header(seed["hc_a_auth"]),
        json={"rows": [{"name": name, "role": "athlete", "email": f"{_unique('e')}@x.example"}]},
    )
    # A no-email row of the same name must create a NEW person (not merge
    # into the emailed one).
    second = client.post(
        "/api/roster/import",
        headers=_auth_header(seed["hc_a_auth"]),
        json={"rows": [{"name": name, "role": "athlete"}]},
    )
    assert second.json()["people_created"] == 1

    # Re-importing the no-email row again now merges into the email-less one
    # (idempotent), not the emailed one.
    third = client.post(
        "/api/roster/import",
        headers=_auth_header(seed["hc_a_auth"]),
        json={"rows": [{"name": name, "role": "athlete"}]},
    )
    assert third.json()["people_updated"] == 1

    total = owner_conn.execute(
        "select count(*) from person where team_id = %s and lower(name) = lower(%s)", (seed["team_a"], name)
    ).fetchone()
    assert total[0] == 2  # the emailed one + the single email-less one


# --------------------------------------------------------------------------
# Authorization: HC succeeds; a ride-group coach (non-HC/TD) is denied;
# imports always land on the caller's OWN team.
# --------------------------------------------------------------------------


def test_ride_group_coach_is_denied_403(client, seed: dict[str, Any]) -> None:
    resp = client.post(
        "/api/roster/import",
        headers=_auth_header(seed["coach_a_auth"]),
        json={"rows": [{"name": _unique("Should Not Import"), "role": "athlete"}]},
    )

    assert resp.status_code == 403
    assert resp.json() == {"error": "roster import is head-coach/team-director only"}


def test_hc_import_never_touches_a_different_teams_data(
    client, seed: dict[str, Any], owner_conn: psycopg.Connection
) -> None:
    name = _unique("Team B Only Athlete")

    resp = client.post(
        "/api/roster/import",
        headers=_auth_header(seed["hc_b_auth"]),
        json={"rows": [{"name": name, "role": "athlete"}]},
    )
    assert resp.status_code == 200
    assert resp.json()["people_created"] == 1

    on_team_a = owner_conn.execute(
        "select count(*) from person where team_id = %s and name = %s", (seed["team_a"], name)
    ).fetchone()
    assert on_team_a[0] == 0

    on_team_b = owner_conn.execute(
        "select count(*) from person where team_id = %s and name = %s", (seed["team_b"], name)
    ).fetchone()
    assert on_team_b[0] == 1


def test_unauthenticated_request_gets_401(client, seed: dict[str, Any]) -> None:
    resp = client.post("/api/roster/import", json={"rows": [{"name": "X"}]})
    assert resp.status_code == 401


# --------------------------------------------------------------------------
# Request-body validation.
# --------------------------------------------------------------------------


def test_empty_rows_list_rejected_400(client, seed: dict[str, Any]) -> None:
    resp = client.post("/api/roster/import", headers=_auth_header(seed["hc_a_auth"]), json={"rows": []})
    assert resp.status_code == 400


def test_invalid_role_rejected_400(client, seed: dict[str, Any]) -> None:
    resp = client.post(
        "/api/roster/import",
        headers=_auth_header(seed["hc_a_auth"]),
        json={"rows": [{"name": _unique("Bad Role"), "role": "wizard"}]},
    )
    assert resp.status_code == 400


def test_blank_role_defaults_to_athlete(client, seed: dict[str, Any], owner_conn: psycopg.Connection) -> None:
    name = _unique("Blank Role")
    resp = client.post(
        "/api/roster/import",
        headers=_auth_header(seed["hc_a_auth"]),
        json={"rows": [{"name": name, "role": ""}]},
    )
    assert resp.status_code == 200

    row = owner_conn.execute(
        "select role from person where team_id = %s and name = %s", (seed["team_a"], name)
    ).fetchone()
    assert row[0] == "athlete"


# --------------------------------------------------------------------------
# Grade / category (supabase/migrations/0006_person_grade_category.sql) --
# round-trip through import AND back out through GET /api/roster; a
# non-numeric grade is dropped (null), never a 400.
# --------------------------------------------------------------------------


def test_imported_athlete_grade_and_category_round_trip_through_get_roster(
    client, seed: dict[str, Any], owner_conn: psycopg.Connection
) -> None:
    name = _unique("Grade Athlete")

    resp = client.post(
        "/api/roster/import",
        headers=_auth_header(seed["hc_a_auth"]),
        json={"rows": [{"name": name, "role": "athlete", "grade": 8, "category": "8th"}]},
    )
    assert resp.status_code == 200
    assert resp.json()["people_created"] == 1

    row = owner_conn.execute(
        "select grade, category from person where team_id = %s and name = %s", (seed["team_a"], name)
    ).fetchone()
    assert row == (8, "8th")

    roster = client.get("/api/roster", headers=_auth_header(seed["hc_a_auth"]))
    assert roster.status_code == 200
    entry = next(p for p in roster.json() if p["name"] == name)
    assert entry["grade"] == 8
    assert entry["category"] == "8th"


def test_reimport_updates_grade_and_category(
    client, seed: dict[str, Any], owner_conn: psycopg.Connection
) -> None:
    name = _unique("Regrade Athlete")

    first = client.post(
        "/api/roster/import",
        headers=_auth_header(seed["hc_a_auth"]),
        json={"rows": [{"name": name, "role": "athlete", "grade": 6, "category": "6th"}]},
    )
    assert first.status_code == 200
    assert first.json()["people_created"] == 1

    second = client.post(
        "/api/roster/import",
        headers=_auth_header(seed["hc_a_auth"]),
        json={"rows": [{"name": name, "role": "athlete", "grade": 7, "category": "7th"}]},
    )
    assert second.status_code == 200
    assert second.json()["people_updated"] == 1

    row = owner_conn.execute(
        "select grade, category from person where team_id = %s and name = %s", (seed["team_a"], name)
    ).fetchone()
    assert row == (7, "7th")


def test_non_numeric_grade_is_dropped_not_a_400(
    client, seed: dict[str, Any], owner_conn: psycopg.Connection
) -> None:
    name = _unique("Bad Grade Athlete")

    resp = client.post(
        "/api/roster/import",
        headers=_auth_header(seed["hc_a_auth"]),
        json={"rows": [{"name": name, "role": "athlete", "grade": "N/A", "category": "7th"}]},
    )
    assert resp.status_code == 200
    assert resp.json()["people_created"] == 1

    row = owner_conn.execute(
        "select grade, category from person where team_id = %s and name = %s", (seed["team_a"], name)
    ).fetchone()
    assert row == (None, "7th")


def test_blank_grade_and_category_are_null(
    client, seed: dict[str, Any], owner_conn: psycopg.Connection
) -> None:
    name = _unique("Blank Grade Coach")

    resp = client.post(
        "/api/roster/import",
        headers=_auth_header(seed["hc_a_auth"]),
        json={"rows": [{"name": name, "role": "coach", "grade": "", "category": "  "}]},
    )
    assert resp.status_code == 200
    assert resp.json()["people_created"] == 1

    row = owner_conn.execute(
        "select grade, category from person where team_id = %s and name = %s", (seed["team_a"], name)
    ).fetchone()
    assert row == (None, None)


# --------------------------------------------------------------------------
# Onboarding tie-in: an HC-imported coach email actually feeds first-login
# bootstrap_link -- proving import -> onboarding works end to end, not just
# that the person row exists.
# --------------------------------------------------------------------------


def test_imported_coach_email_feeds_onboarding_bootstrap_link(
    client, db_url: str, seed: dict[str, Any], owner_conn: psycopg.Connection
) -> None:
    coach_name = _unique("Onboarding Coach")
    coach_email = f"{_unique('onboard')}@x.example"

    resp = client.post(
        "/api/roster/import",
        headers=_auth_header(seed["hc_a_auth"]),
        json={"rows": [{"name": coach_name, "role": "coach", "email": coach_email}]},
    )
    assert resp.status_code == 200
    assert resp.json()["people_created"] == 1

    imported_person_id = owner_conn.execute(
        "select id from person where team_id = %s and email = %s", (seed["team_a"], coach_email)
    ).fetchone()[0]

    fresh_sub = uuid.uuid4()
    links_created = bootstrap_link(db_url, str(fresh_sub), coach_email)

    assert links_created == 1
    linked = owner_conn.execute(
        "select person_id from auth_person where auth_user_id = %s", (fresh_sub,)
    ).fetchone()
    assert linked[0] == imported_person_id

    # And the newly-linked sub can now actually authenticate as that coach
    # through the real HTTP path.
    me = client.get("/api/me", headers=_auth_header(fresh_sub))
    assert me.status_code == 200
    assert me.json()["personas"][0]["person_id"] == str(imported_person_id)


def test_service_connection_import(db_url: str) -> None:
    """Sanity: service_connection itself still works as documented (used
    only indirectly here, via bootstrap_link above) -- guards against a
    future change to app.db breaking this test file's onboarding tie-in
    silently."""
    with service_connection(db_url) as conn:
        result = conn.execute("select 1").fetchone()
    assert result == (1,)

"""Live-Postgres tests for Phase 3.1 first-login onboarding
(docs/PHASE3_1_ONBOARDING.md): `app.onboarding.bootstrap_link` and its
wiring into `app.deps.get_caller` via `GET /api/me`.

Mirrors tests/backend/test_api_rls.py's pattern: mints real Supabase-shaped
HS256 JWTs (now including an `email` claim) and drives the actual FastAPI
app end to end via TestClient -- Bearer token -> app.deps.get_caller
(-> app.onboarding.bootstrap_link on first login) -> app.routes.get_me.

Requires MTB_TEST_DB_URL pointed at a Postgres with
tests/db/setup_test_auth.sql + every supabase/migrations/*.sql (through
0005_person_email.sql) already applied. Skips (doesn't fail) if unset --
see tests/backend/conftest.py.
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

TEST_SUPABASE_JWT_SECRET = "test-onboarding-supabase-jwt-secret-32bytes-min"


def _token(sub: uuid.UUID, *, email: str | None, exp_delta: int = 3600) -> str:
    """A real HS256 JWT shaped like a Supabase session token, optionally
    carrying an `email` claim -- mirrors test_api_rls.py's `_token`, extended
    with the claim this onboarding flow reads."""
    now = int(time.time())
    payload: dict[str, Any] = {"sub": str(sub), "exp": now + exp_delta, "iat": now, "role": "authenticated"}
    if email is not None:
        payload["email"] = email
    return jwt.encode(payload, TEST_SUPABASE_JWT_SECRET, algorithm="HS256")


def _auth_header(sub: uuid.UUID, *, email: str | None) -> dict[str, str]:
    return {"Authorization": f"Bearer {_token(sub, email=email)}"}


@pytest.fixture
def client(db_url: str, monkeypatch: pytest.MonkeyPatch):
    """A TestClient over the real FastAPI app, pointed at the live
    MTB_TEST_DB_URL Postgres -- same shape as test_api_rls.py's `client`
    fixture, kept separate (this file owns its own JWT secret constant)."""
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
    """One team with a ride group. A coach `person` carrying a unique-per-
    test email (no auth_person link yet -- this is the "first login,
    pre-authorized by email" case). An ATHLETE `person` on the SAME team
    sharing the SAME email (the family-PitZone-email case the bootstrap must
    never link). A second, unrelated team's coach with a DIFFERENT email
    (proves the match is by email, not "any coach"). No auth_person rows
    exist for any of these at the start of a test.

    Emails are minted fresh per test (not a fixed literal like
    'coach@x.com') because `owner_conn` is autocommit and function-scoped --
    it isolates each test's *connection*, not its *data*: rows inserted by
    one test are NOT rolled back and remain visible to every later test in
    the same run (same pattern tests/backend/test_api_rls.py relies on,
    which is why that file always asserts against specific known ids rather
    than "the only row"). A shared literal email here would make
    bootstrap_link match an ever-growing set of coach rows across the suite;
    a unique email per test keeps each test's match set exactly one row."""
    unique = uuid.uuid4().hex
    ids: dict[str, Any] = {
        name: uuid.uuid4()
        for name in (
            "league",
            "team",
            "group",
            "coach_person",
            "coach_auth",
            "athlete_person",
            "other_team",
            "other_group",
            "other_coach_person",
            "other_coach_auth",
        )
    }
    ids["coach_email"] = f"coach-{unique}@x.example"
    ids["other_email"] = f"other-{unique}@y.example"

    owner_conn.execute("insert into league (id, name) values (%s, %s)", (ids["league"], "L"))
    owner_conn.execute(
        "insert into team (id, league_id, name) values (%s, %s, %s)", (ids["team"], ids["league"], "Team")
    )
    owner_conn.execute(
        "insert into ride_group (id, team_id, name) values (%s, %s, %s)", (ids["group"], ids["team"], "Group")
    )
    owner_conn.execute(
        "insert into person (id, team_id, ride_group_id, role, name, email) values (%s, %s, %s, 'coach', %s, %s)",
        (ids["coach_person"], ids["team"], ids["group"], "Coach X", ids["coach_email"]),
    )
    owner_conn.execute(
        "insert into person (id, team_id, ride_group_id, role, name, email) values (%s, %s, %s, 'athlete', %s, %s)",
        (ids["athlete_person"], ids["team"], ids["group"], "Athlete Sharing Email", ids["coach_email"]),
    )

    owner_conn.execute(
        "insert into team (id, league_id, name) values (%s, %s, %s)", (ids["other_team"], ids["league"], "Other Team")
    )
    owner_conn.execute(
        "insert into ride_group (id, team_id, name) values (%s, %s, %s)",
        (ids["other_group"], ids["other_team"], "Other Group"),
    )
    owner_conn.execute(
        "insert into person (id, team_id, ride_group_id, role, name, email) values (%s, %s, %s, 'coach', %s, %s)",
        (ids["other_coach_person"], ids["other_team"], ids["other_group"], "Coach Other", ids["other_email"]),
    )

    return ids


def _auth_person_rows(owner_conn: psycopg.Connection, sub: uuid.UUID) -> list[tuple]:
    return owner_conn.execute(
        "select auth_user_id, person_id from auth_person where auth_user_id = %s", (sub,)
    ).fetchall()


# --------------------------------------------------------------------------
# GET /api/me -- first login auto-links the coach persona via bootstrap_link.
# --------------------------------------------------------------------------


def test_first_login_with_matching_email_links_and_returns_coach_persona(
    client, seed: dict[str, Any], owner_conn: psycopg.Connection
) -> None:
    sub = uuid.uuid4()
    assert _auth_person_rows(owner_conn, sub) == []

    resp = client.get("/api/me", headers=_auth_header(sub, email=seed["coach_email"]))

    assert resp.status_code == 200
    personas = resp.json()["personas"]
    assert len(personas) == 1
    assert personas[0]["person_id"] == str(seed["coach_person"])
    assert personas[0]["role"] == "coach"

    # The link was actually created, not just resolved in-memory.
    assert _auth_person_rows(owner_conn, sub) == [(sub, seed["coach_person"])]


def test_second_login_is_idempotent_no_duplicate_link(
    client, seed: dict[str, Any], owner_conn: psycopg.Connection
) -> None:
    sub = uuid.uuid4()

    first = client.get("/api/me", headers=_auth_header(sub, email=seed["coach_email"]))
    assert first.status_code == 200

    second = client.get("/api/me", headers=_auth_header(sub, email=seed["coach_email"]))
    assert second.status_code == 200
    assert second.json() == first.json()

    assert _auth_person_rows(owner_conn, sub) == [(sub, seed["coach_person"])]


def test_a_persona_added_after_first_login_is_picked_up_on_next_me_call(
    client, seed: dict[str, Any], owner_conn: psycopg.Connection
) -> None:
    """DEFECTS.md D31: a coach who already has >=1 linked persona previously
    never re-triggered bootstrap_link on later logins, so a `person` row
    added after their first sign-in (a second team, a promotion) sat
    unlinked forever without a manual auth_person insert. Fixed by running
    bootstrap_link unconditionally inside GET /api/me itself (not
    get_caller, which backs every route) -- reproduce end to end."""
    sub = uuid.uuid4()

    first = client.get("/api/me", headers=_auth_header(sub, email=seed["coach_email"]))
    assert first.status_code == 200
    assert [p["person_id"] for p in first.json()["personas"]] == [str(seed["coach_person"])]

    # A second team's coach row added later, sharing the SAME email --
    # exactly the "HC adds a second team/role for an already-active coach"
    # scenario from D31. No manual auth_person insert here; this is what
    # the fix is supposed to make unnecessary.
    new_team = uuid.uuid4()
    new_group = uuid.uuid4()
    new_person = uuid.uuid4()
    owner_conn.execute(
        "insert into team (id, league_id, name) values (%s, %s, %s)",
        (new_team, seed["league"], "Second Team"),
    )
    owner_conn.execute(
        "insert into ride_group (id, team_id, name) values (%s, %s, %s)",
        (new_group, new_team, "Second Group"),
    )
    owner_conn.execute(
        "insert into person (id, team_id, ride_group_id, role, name, email) values (%s, %s, %s, 'coach', %s, %s)",
        (new_person, new_team, new_group, "Coach X (second team)", seed["coach_email"]),
    )

    second = client.get("/api/me", headers=_auth_header(sub, email=seed["coach_email"]))
    assert second.status_code == 200
    second_person_ids = {p["person_id"] for p in second.json()["personas"]}
    assert second_person_ids == {str(seed["coach_person"]), str(new_person)}

    assert sorted(pid for _, pid in _auth_person_rows(owner_conn, sub)) == sorted(
        [seed["coach_person"], new_person]
    )


def test_login_with_unknown_email_gets_403_and_creates_no_link(
    client, seed: dict[str, Any], owner_conn: psycopg.Connection
) -> None:
    sub = uuid.uuid4()

    resp = client.get("/api/me", headers=_auth_header(sub, email="nobody@x.com"))

    assert resp.status_code == 403
    assert resp.json() == {"error": "not a recognized coach"}
    assert _auth_person_rows(owner_conn, sub) == []


def test_login_with_no_email_claim_gets_403_and_creates_no_link(
    client, seed: dict[str, Any], owner_conn: psycopg.Connection
) -> None:
    sub = uuid.uuid4()

    resp = client.get("/api/me", headers=_auth_header(sub, email=None))

    assert resp.status_code == 403
    assert resp.json() == {"error": "not a recognized coach"}
    assert _auth_person_rows(owner_conn, sub) == []


def test_login_with_shared_family_email_never_links_the_athlete(
    client, seed: dict[str, Any], owner_conn: psycopg.Connection
) -> None:
    """seed["coach_email"] is shared by a coach AND an athlete person row --
    the login must resolve to the coach persona only; the athlete row must
    never gain an auth_person link, whatever the outcome."""
    sub = uuid.uuid4()

    resp = client.get("/api/me", headers=_auth_header(sub, email=seed["coach_email"]))

    assert resp.status_code == 200
    linked_person_ids = {row[1] for row in _auth_person_rows(owner_conn, sub)}
    assert linked_person_ids == {seed["coach_person"]}
    assert seed["athlete_person"] not in linked_person_ids


# --------------------------------------------------------------------------
# app.onboarding.bootstrap_link -- direct unit-ish coverage via
# service_connection, independent of the HTTP layer above.
# --------------------------------------------------------------------------


def test_bootstrap_link_returns_zero_for_falsy_email(db_url: str, seed: dict[str, Any]) -> None:
    assert bootstrap_link(db_url, str(uuid.uuid4()), None) == 0
    assert bootstrap_link(db_url, str(uuid.uuid4()), "") == 0


def test_bootstrap_link_creates_exactly_one_link_and_excludes_athlete(
    db_url: str, seed: dict[str, Any], owner_conn: psycopg.Connection
) -> None:
    sub = uuid.uuid4()

    created = bootstrap_link(db_url, str(sub), seed["coach_email"])

    assert created == 1
    rows = _auth_person_rows(owner_conn, sub)
    assert rows == [(sub, seed["coach_person"])]


def test_bootstrap_link_is_idempotent_across_repeated_calls(
    db_url: str, seed: dict[str, Any], owner_conn: psycopg.Connection
) -> None:
    sub = uuid.uuid4()

    first = bootstrap_link(db_url, str(sub), seed["coach_email"])
    second = bootstrap_link(db_url, str(sub), seed["coach_email"])

    assert first == 1
    assert second == 0
    assert len(_auth_person_rows(owner_conn, sub)) == 1


def test_bootstrap_link_is_case_insensitive_on_email(
    db_url: str, seed: dict[str, Any], owner_conn: psycopg.Connection
) -> None:
    sub = uuid.uuid4()

    created = bootstrap_link(db_url, str(sub), seed["coach_email"].upper())

    assert created == 1
    assert _auth_person_rows(owner_conn, sub) == [(sub, seed["coach_person"])]


def test_bootstrap_link_unknown_email_creates_nothing(db_url: str, seed: dict[str, Any]) -> None:
    assert bootstrap_link(db_url, str(uuid.uuid4()), "nobody@nowhere.com") == 0


def test_bootstrap_link_never_links_a_different_teams_coach_by_accident(
    db_url: str, seed: dict[str, Any], owner_conn: psycopg.Connection
) -> None:
    """Sanity check that matching is strictly by email, not "any coach
    anywhere" -- the other team's coach has a different email and must not
    be linked when we bootstrap for seed["coach_email"]."""
    sub = uuid.uuid4()

    bootstrap_link(db_url, str(sub), seed["coach_email"])

    linked_person_ids = {row[1] for row in _auth_person_rows(owner_conn, sub)}
    assert seed["other_coach_person"] not in linked_person_ids


def test_service_connection_bypasses_rls_as_the_owner_role(db_url: str, seed: dict[str, Any]) -> None:
    """Direct sanity check on the bypass itself: a plain service_connection
    (no SET ROLE authenticated) can read a `person` row with no auth_person
    link and no RLS-granting session state at all -- proving it runs
    privileged, exactly as documented, so bootstrap_link's SELECT is even
    possible in the first place."""
    with service_connection(db_url) as conn:
        row = conn.execute("select id, role from person where id = %s", (seed["coach_person"],)).fetchone()
    assert row is not None
    assert row[1] == "coach"

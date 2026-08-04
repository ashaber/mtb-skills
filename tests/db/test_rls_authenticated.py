"""RLS enforcement tests invoked the way REAL Supabase invokes it.

tests/db/test_rls.py already proves the full isolation matrix from
docs/PHASE3_TEAM_VISIBILITY_PLAN.md holds against this repo's own
`app_user` + `test_login_as()` test shim. This file proves the SAME matrix
holds under the actual mechanism Supabase's PostgREST/GoTrue stack uses per
request:

    SET ROLE authenticated;
    SET request.jwt.claims = '{"sub": "<uuid>", "role": "authenticated"}';

rather than the custom `test_login_as()` helper function. This is the
crown-jewel verification for Phase 3.1: it confirms our RLS policies (and
supabase/migrations/0003_grants.sql's table grants, without which the
`authenticated` role couldn't even reach a policy-evaluation step) hold up
against the REAL invocation mechanism, not just our own stand-in for it.

Two distinct connection identities matter here, same split as test_rls.py:
  - `owner_conn` -- the migration-applying role (table owner / superuser).
    Owners bypass RLS entirely, so this is used ONLY to seed fixture data,
    never to assert access control.
  - a fresh connection per assertion that does `SET ROLE authenticated` --
    proven in manual testing (see PR description / orchestrator notes) that
    switching role away from the owning superuser role genuinely subjects
    the session to RLS: Postgres's RLS-bypass check is keyed on the
    *current* role (which `SET ROLE` changes), not the role that opened the
    connection. `authenticated` itself has no login/superuser/bypassrls
    attributes (tests/db/setup_test_auth.sql creates it NOLOGIN), so once
    switched into it, RLS is fully enforced -- exactly Supabase's own
    pooled-connection-impersonates-authenticated model.

Reads the connection string from MTB_TEST_DB_URL (same convention as
test_rls.py; both are run by scripts/db_test.sh against the same live
postgres container, after tests/db/setup_test_auth.sql +
supabase/migrations/*.sql have been applied).
"""

from __future__ import annotations

import json
import os
import uuid
from collections.abc import Iterator
from dataclasses import dataclass, field

import psycopg
import pytest


def _require_test_db_url() -> str:
    url = os.environ.get("MTB_TEST_DB_URL")
    if not url:
        raise RuntimeError(
            "MTB_TEST_DB_URL is not set. test_rls_authenticated.py needs a "
            "running postgres with supabase/migrations/*.sql and "
            "tests/db/setup_test_auth.sql already applied -- run via "
            "scripts/db_test.sh rather than pytest directly."
        )
    return url


@pytest.fixture(scope="module")
def db_url() -> str:
    return _require_test_db_url()


@pytest.fixture(scope="module")
def owner_conn(db_url: str) -> Iterator[psycopg.Connection]:
    """Table-owner connection. Seeding only -- bypasses RLS."""
    with psycopg.connect(db_url, autocommit=True) as conn:
        yield conn


def _login_as(db_url: str, sub: uuid.UUID | None) -> psycopg.Connection:
    """Open a fresh connection (as the same role MTB_TEST_DB_URL connects
    as -- the migration-owning superuser locally, mirroring the privileged
    pooled role Supabase's backend connects as), `SET ROLE authenticated`,
    and -- unless `sub` is None (the anonymous/no-JWT case) -- set the
    `request.jwt.claims` GUC exactly as PostgREST does per request. This is
    deliberately NOT the test_rls.py shim's `test_login_as()` helper: the
    whole point of this module is to exercise the real
    SET ROLE + request.jwt.claims mechanism end to end.
    """
    conn = psycopg.connect(db_url, autocommit=True)
    conn.execute("set role authenticated")
    if sub is not None:
        claims = json.dumps({"sub": str(sub), "role": "authenticated"})
        conn.execute("select set_config('request.jwt.claims', %s, false)", (claims,))
    return conn


@dataclass
class Seed:
    league_id: uuid.UUID
    team_a_id: uuid.UUID
    team_b_id: uuid.UUID
    group_a1_id: uuid.UUID
    group_a2_id: uuid.UUID
    group_b1_id: uuid.UUID

    coach_a1_person: uuid.UUID
    coach_a1_auth: uuid.UUID
    coach_a2_person: uuid.UUID
    coach_a2_auth: uuid.UUID
    coach_b1_person: uuid.UUID
    coach_b1_auth: uuid.UUID

    hc_a_person: uuid.UUID
    hc_a_auth: uuid.UUID

    league_staff_person: uuid.UUID
    league_staff_auth: uuid.UUID

    athlete_a1_id: uuid.UUID
    athlete_a2_id: uuid.UUID
    athlete_b1_id: uuid.UUID

    obs_a1_id: uuid.UUID
    obs_a2_id: uuid.UUID
    obs_b1_id: uuid.UUID

    no_persona_auth: uuid.UUID = field(default_factory=uuid.uuid4)


@pytest.fixture(scope="module")
def seed(owner_conn: psycopg.Connection) -> Seed:
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
            "coach_b1_person",
            "coach_b1_auth",
            "hc_a_person",
            "hc_a_auth",
            "league_staff_person",
            "league_staff_auth",
            "athlete_a1",
            "athlete_a2",
            "athlete_b1",
            "obs_a1",
            "obs_a2",
            "obs_b1",
        )
    }

    owner_conn.execute(
        "insert into league (id, name) values (%s, %s)",
        (ids["league"], "Test League (authenticated-role suite)"),
    )
    owner_conn.execute(
        "insert into team (id, league_id, name) values (%s, %s, %s)",
        (ids["team_a"], ids["league"], "Team A"),
    )
    owner_conn.execute(
        "insert into team (id, league_id, name) values (%s, %s, %s)",
        (ids["team_b"], ids["league"], "Team B"),
    )
    owner_conn.execute(
        "insert into ride_group (id, team_id, name) values (%s, %s, %s)",
        (ids["group_a1"], ids["team_a"], "A - Group 1"),
    )
    owner_conn.execute(
        "insert into ride_group (id, team_id, name) values (%s, %s, %s)",
        (ids["group_a2"], ids["team_a"], "A - Group 2"),
    )
    owner_conn.execute(
        "insert into ride_group (id, team_id, name) values (%s, %s, %s)",
        (ids["group_b1"], ids["team_b"], "B - Group 1"),
    )

    def _insert_person(
        person_id: uuid.UUID,
        team_id: uuid.UUID,
        ride_group_id: uuid.UUID | None,
        role: str,
        name: str,
    ) -> None:
        owner_conn.execute(
            """
            insert into person (id, team_id, ride_group_id, role, name)
            values (%s, %s, %s, %s, %s)
            """,
            (person_id, team_id, ride_group_id, role, name),
        )

    def _link_auth(auth_user_id: uuid.UUID, person_id: uuid.UUID) -> None:
        owner_conn.execute(
            "insert into auth_person (auth_user_id, person_id) values (%s, %s)",
            (auth_user_id, person_id),
        )

    _insert_person(ids["coach_a1_person"], ids["team_a"], ids["group_a1"], "coach", "Coach A1")
    _link_auth(ids["coach_a1_auth"], ids["coach_a1_person"])

    _insert_person(ids["coach_a2_person"], ids["team_a"], ids["group_a2"], "coach", "Coach A2")
    _link_auth(ids["coach_a2_auth"], ids["coach_a2_person"])

    _insert_person(ids["coach_b1_person"], ids["team_b"], ids["group_b1"], "coach", "Coach B1")
    _link_auth(ids["coach_b1_auth"], ids["coach_b1_person"])

    _insert_person(ids["hc_a_person"], ids["team_a"], None, "head_coach", "HC A")
    _link_auth(ids["hc_a_auth"], ids["hc_a_person"])

    # league_staff's person row is anchored on team_a (schema requires a
    # team_id on every person row) but the RLS policy expands their scope to
    # the whole league via team.league_id -- see 0002_rls.sql.
    _insert_person(ids["league_staff_person"], ids["team_a"], None, "league_staff", "League Staff")
    _link_auth(ids["league_staff_auth"], ids["league_staff_person"])

    _insert_person(ids["athlete_a1"], ids["team_a"], ids["group_a1"], "athlete", "Athlete A1")
    _insert_person(ids["athlete_a2"], ids["team_a"], ids["group_a2"], "athlete", "Athlete A2")
    _insert_person(ids["athlete_b1"], ids["team_b"], ids["group_b1"], "athlete", "Athlete B1")

    owner_conn.execute(
        """
        insert into observation
            (id, athlete_id, team_id, coach_id, ride_group_id, session_date, skill, level_observed, notes)
        values (%s, %s, %s, %s, %s, current_date, 'cornering', 2, 'seed')
        """,
        (ids["obs_a1"], ids["athlete_a1"], ids["team_a"], ids["coach_a1_person"], ids["group_a1"]),
    )
    owner_conn.execute(
        """
        insert into observation
            (id, athlete_id, team_id, coach_id, ride_group_id, session_date, skill, level_observed, notes)
        values (%s, %s, %s, %s, %s, current_date, 'braking', 3, 'seed')
        """,
        (ids["obs_a2"], ids["athlete_a2"], ids["team_a"], ids["coach_a2_person"], ids["group_a2"]),
    )
    owner_conn.execute(
        """
        insert into observation
            (id, athlete_id, team_id, coach_id, ride_group_id, session_date, skill, level_observed, notes)
        values (%s, %s, %s, %s, %s, current_date, 'body_position', 4, 'seed')
        """,
        (ids["obs_b1"], ids["athlete_b1"], ids["team_b"], ids["coach_b1_person"], ids["group_b1"]),
    )

    return Seed(
        league_id=ids["league"],
        team_a_id=ids["team_a"],
        team_b_id=ids["team_b"],
        group_a1_id=ids["group_a1"],
        group_a2_id=ids["group_a2"],
        group_b1_id=ids["group_b1"],
        coach_a1_person=ids["coach_a1_person"],
        coach_a1_auth=ids["coach_a1_auth"],
        coach_a2_person=ids["coach_a2_person"],
        coach_a2_auth=ids["coach_a2_auth"],
        coach_b1_person=ids["coach_b1_person"],
        coach_b1_auth=ids["coach_b1_auth"],
        hc_a_person=ids["hc_a_person"],
        hc_a_auth=ids["hc_a_auth"],
        league_staff_person=ids["league_staff_person"],
        league_staff_auth=ids["league_staff_auth"],
        athlete_a1_id=ids["athlete_a1"],
        athlete_a2_id=ids["athlete_a2"],
        athlete_b1_id=ids["athlete_b1"],
        obs_a1_id=ids["obs_a1"],
        obs_a2_id=ids["obs_a2"],
        obs_b1_id=ids["obs_b1"],
    )


# ---------------------------------------------------------------------------
# Ride-group coach
# ---------------------------------------------------------------------------


def test_ride_group_coach_sees_only_own_group_observations(db_url: str, seed: Seed) -> None:
    with _login_as(db_url, seed.coach_a1_auth) as conn:
        rows = conn.execute("select id from observation").fetchall()
        assert {r[0] for r in rows} == {seed.obs_a1_id}


def test_ride_group_coach_cannot_see_other_group_in_same_team(db_url: str, seed: Seed) -> None:
    with _login_as(db_url, seed.coach_a1_auth) as conn:
        rows = conn.execute("select id from observation where id = %s", (seed.obs_a2_id,)).fetchall()
        assert rows == [], "coach A1 must see zero rows for group A2's observation"


def test_ride_group_coach_cannot_see_other_team(db_url: str, seed: Seed) -> None:
    with _login_as(db_url, seed.coach_a1_auth) as conn:
        rows = conn.execute("select id from observation where id = %s", (seed.obs_b1_id,)).fetchall()
        assert rows == [], "coach A1 must see zero rows for team B's observation"


def test_ride_group_coach_can_insert_for_own_group(db_url: str, seed: Seed) -> None:
    new_id = uuid.uuid4()
    with _login_as(db_url, seed.coach_a1_auth) as conn:
        conn.execute(
            """
            insert into observation
                (id, athlete_id, team_id, coach_id, ride_group_id, session_date, skill, level_observed)
            values (%s, %s, %s, %s, %s, current_date, 'cornering', 3)
            """,
            (new_id, seed.athlete_a1_id, seed.team_a_id, seed.coach_a1_person, seed.group_a1_id),
        )
        row = conn.execute("select id from observation where id = %s", (new_id,)).fetchone()
        assert row is not None


def test_ride_group_coach_cannot_insert_for_other_group_same_team(db_url: str, seed: Seed) -> None:
    new_id = uuid.uuid4()
    with _login_as(db_url, seed.coach_a1_auth) as conn:
        with pytest.raises(psycopg.Error):
            conn.execute(
                """
                insert into observation
                    (id, athlete_id, team_id, coach_id, ride_group_id, session_date, skill, level_observed)
                values (%s, %s, %s, %s, %s, current_date, 'cornering', 3)
                """,
                (new_id, seed.athlete_a2_id, seed.team_a_id, seed.coach_a1_person, seed.group_a2_id),
            )


def test_ride_group_coach_cannot_insert_for_other_team(db_url: str, seed: Seed) -> None:
    new_id = uuid.uuid4()
    with _login_as(db_url, seed.coach_a1_auth) as conn:
        with pytest.raises(psycopg.Error):
            conn.execute(
                """
                insert into observation
                    (id, athlete_id, team_id, coach_id, ride_group_id, session_date, skill, level_observed)
                values (%s, %s, %s, %s, %s, current_date, 'cornering', 3)
                """,
                (new_id, seed.athlete_b1_id, seed.team_b_id, seed.coach_a1_person, seed.group_b1_id),
            )


def test_ride_group_coach_can_write_confirmed_level_for_own_group(db_url: str, seed: Seed) -> None:
    new_id = uuid.uuid4()
    with _login_as(db_url, seed.coach_a1_auth) as conn:
        conn.execute(
            """
            insert into confirmed_level (id, athlete_id, team_id, coach_id, ride_group_id, skill, level)
            values (%s, %s, %s, %s, %s, 'braking', 3)
            """,
            (new_id, seed.athlete_a1_id, seed.team_a_id, seed.coach_a1_person, seed.group_a1_id),
        )
        row = conn.execute("select id from confirmed_level where id = %s", (new_id,)).fetchone()
        assert row is not None


def test_ride_group_coach_cannot_write_confirmed_level_for_other_group(db_url: str, seed: Seed) -> None:
    new_id = uuid.uuid4()
    with _login_as(db_url, seed.coach_a1_auth) as conn:
        with pytest.raises(psycopg.Error):
            conn.execute(
                """
                insert into confirmed_level (id, athlete_id, team_id, coach_id, ride_group_id, skill, level)
                values (%s, %s, %s, %s, %s, 'braking', 3)
                """,
                (new_id, seed.athlete_a2_id, seed.team_a_id, seed.coach_a1_person, seed.group_a2_id),
            )


# ---------------------------------------------------------------------------
# Head Coach / Team Director
# ---------------------------------------------------------------------------


def test_hc_sees_whole_team_not_other_team(db_url: str, seed: Seed) -> None:
    with _login_as(db_url, seed.hc_a_auth) as conn:
        rows = conn.execute("select id from observation").fetchall()
        ids = {r[0] for r in rows}
        assert {seed.obs_a1_id, seed.obs_a2_id} <= ids
        assert seed.obs_b1_id not in ids


def test_hc_can_insert_anywhere_in_own_team(db_url: str, seed: Seed) -> None:
    new_id = uuid.uuid4()
    with _login_as(db_url, seed.hc_a_auth) as conn:
        conn.execute(
            """
            insert into observation
                (id, athlete_id, team_id, coach_id, ride_group_id, session_date, skill, level_observed)
            values (%s, %s, %s, %s, %s, current_date, 'body_position', 5)
            """,
            (new_id, seed.athlete_a2_id, seed.team_a_id, seed.hc_a_person, seed.group_a2_id),
        )
        row = conn.execute("select id from observation where id = %s", (new_id,)).fetchone()
        assert row is not None


def test_hc_cannot_insert_into_other_team(db_url: str, seed: Seed) -> None:
    new_id = uuid.uuid4()
    with _login_as(db_url, seed.hc_a_auth) as conn:
        with pytest.raises(psycopg.Error):
            conn.execute(
                """
                insert into observation
                    (id, athlete_id, team_id, coach_id, ride_group_id, session_date, skill, level_observed)
                values (%s, %s, %s, %s, %s, current_date, 'body_position', 5)
                """,
                (new_id, seed.athlete_b1_id, seed.team_b_id, seed.hc_a_person, seed.group_b1_id),
            )


def test_hc_sees_own_team_roster_not_other_team(db_url: str, seed: Seed) -> None:
    with _login_as(db_url, seed.hc_a_auth) as conn:
        rows = conn.execute("select id from person where team_id = %s", (seed.team_a_id,)).fetchall()
        person_ids = {r[0] for r in rows}
        assert seed.coach_a1_person in person_ids
        assert seed.coach_a2_person in person_ids
        assert seed.athlete_a1_id in person_ids

        other_team_rows = conn.execute(
            "select id from person where id = %s", (seed.coach_b1_person,)
        ).fetchall()
        assert other_team_rows == []


# ---------------------------------------------------------------------------
# League staff -- read-only across the whole league
# ---------------------------------------------------------------------------


def test_league_staff_selects_across_both_teams(db_url: str, seed: Seed) -> None:
    with _login_as(db_url, seed.league_staff_auth) as conn:
        rows = conn.execute("select id from observation").fetchall()
        ids = {r[0] for r in rows}
        assert {seed.obs_a1_id, seed.obs_a2_id, seed.obs_b1_id} <= ids


def test_league_staff_insert_denied(db_url: str, seed: Seed) -> None:
    new_id = uuid.uuid4()
    with _login_as(db_url, seed.league_staff_auth) as conn:
        with pytest.raises(psycopg.Error):
            conn.execute(
                """
                insert into observation
                    (id, athlete_id, team_id, coach_id, ride_group_id, session_date, skill, level_observed)
                values (%s, %s, %s, %s, %s, current_date, 'cornering', 1)
                """,
                (new_id, seed.athlete_a1_id, seed.team_a_id, seed.league_staff_person, seed.group_a1_id),
            )


# ---------------------------------------------------------------------------
# No auth_person row -- a valid Supabase auth.users login that has no
# coach/athlete persona at all (e.g. not yet linked/provisioned).
# ---------------------------------------------------------------------------


def test_sub_with_no_auth_person_row_sees_nothing(db_url: str, seed: Seed) -> None:
    stray_sub = uuid.uuid4()
    with _login_as(db_url, stray_sub) as conn:
        rows = conn.execute("select id from observation").fetchall()
        assert rows == []
        rows = conn.execute("select id from person").fetchall()
        assert rows == []


def test_sub_with_no_auth_person_row_insert_denied(db_url: str, seed: Seed) -> None:
    stray_sub = uuid.uuid4()
    new_id = uuid.uuid4()
    with _login_as(db_url, stray_sub) as conn:
        with pytest.raises(psycopg.Error):
            conn.execute(
                """
                insert into observation
                    (id, athlete_id, team_id, coach_id, ride_group_id, session_date, skill, level_observed)
                values (%s, %s, %s, %s, %s, current_date, 'cornering', 1)
                """,
                (new_id, seed.athlete_a1_id, seed.team_a_id, seed.coach_a1_person, seed.group_a1_id),
            )


# ---------------------------------------------------------------------------
# Anonymous -- SET ROLE authenticated but no request.jwt.claims at all
# (auth.uid() is null). Distinct from "no auth_person row": here auth.uid()
# itself resolves to nothing.
# ---------------------------------------------------------------------------


def test_anonymous_authenticated_role_sees_nothing(db_url: str, seed: Seed) -> None:
    with _login_as(db_url, None) as conn:
        rows = conn.execute("select id from observation").fetchall()
        assert rows == []


def test_anonymous_authenticated_role_insert_denied(db_url: str, seed: Seed) -> None:
    new_id = uuid.uuid4()
    with _login_as(db_url, None) as conn:
        with pytest.raises(psycopg.Error):
            conn.execute(
                """
                insert into observation
                    (id, athlete_id, team_id, coach_id, ride_group_id, session_date, skill, level_observed)
                values (%s, %s, %s, %s, %s, current_date, 'cornering', 1)
                """,
                (new_id, seed.athlete_a1_id, seed.team_a_id, seed.coach_a1_person, seed.group_a1_id),
            )


# ---------------------------------------------------------------------------
# auth_person is itself RLS-protected (0004): a caller sees only their OWN
# auth_user_id -> person_id mapping, and writes are default-denied.
# ---------------------------------------------------------------------------


def test_auth_person_caller_sees_only_own_mapping(db_url: str, seed: Seed) -> None:
    with _login_as(db_url, seed.coach_a1_auth) as conn:
        rows = conn.execute("select auth_user_id from auth_person").fetchall()
        assert {r[0] for r in rows} == {seed.coach_a1_auth}, (
            "a caller must see only their own auth_person row, not other users' mappings"
        )


def test_auth_person_stranger_sees_nothing(db_url: str, seed: Seed) -> None:
    with _login_as(db_url, uuid.uuid4()) as conn:
        count = conn.execute("select count(*) from auth_person").fetchone()[0]
        assert count == 0, "a sub with no auth_person row must see zero mappings"


def test_auth_person_insert_denied_for_authenticated(db_url: str, seed: Seed) -> None:
    with _login_as(db_url, seed.coach_a1_auth) as conn:
        with pytest.raises(psycopg.Error):
            conn.execute(
                "insert into auth_person (auth_user_id, person_id) values (%s, %s)",
                (uuid.uuid4(), seed.coach_a1_person),
            )

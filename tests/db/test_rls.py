"""RLS enforcement tests for the Phase 3.0 database layer.

Exercises the AuthZ matrix from docs/PHASE3_TEAM_VISIBILITY_PLAN.md against a
real postgres instance with supabase/migrations/*.sql + the test-only
tests/db/setup_test_auth.sql shim applied (see scripts/db_test.sh, which
drives this end to end).

Two distinct connection roles matter here:
  - `owner_conn` -- the migration-applying role (table owner / superuser).
    Owners bypass RLS entirely, so this is used ONLY to seed fixture data,
    never to assert access control.
  - `app_user` -- a plain, non-owner role (created by setup_test_auth.sql)
    that RLS actually applies to. Every assertion below runs as `app_user`,
    "logged in" as a given fake auth_user_id via the shim's
    `select test_login_as(<uuid>)`.

Reads the connection string from MTB_TEST_DB_URL.
"""

from __future__ import annotations

import os
import uuid
from collections.abc import Iterator
from dataclasses import dataclass, field

import psycopg
import pytest
from psycopg.conninfo import conninfo_to_dict


def _require_test_db_url() -> str:
    url = os.environ.get("MTB_TEST_DB_URL")
    if not url:
        raise RuntimeError(
            "MTB_TEST_DB_URL is not set. test_rls.py needs a running "
            "postgres with supabase/migrations/*.sql and "
            "tests/db/setup_test_auth.sql already applied -- run via "
            "scripts/db_test.sh rather than pytest directly."
        )
    return url


def _app_user_params(base_dsn: str) -> dict[str, object]:
    """Connection params for the same server/db as MTB_TEST_DB_URL, but as
    the non-owner `app_user` role. app_user has no password (the docker
    postgres in scripts/db_test.sh runs with trust auth for local testing
    only) so any inherited password is dropped."""
    params = conninfo_to_dict(base_dsn)
    params["user"] = "app_user"
    params.pop("password", None)
    return params


@pytest.fixture(scope="module")
def db_url() -> str:
    return _require_test_db_url()


@pytest.fixture(scope="module")
def owner_conn(db_url: str) -> Iterator[psycopg.Connection]:
    """Table-owner connection. Seeding only -- bypasses RLS."""
    with psycopg.connect(db_url, autocommit=True) as conn:
        yield conn


def _login_as(db_url: str, auth_user_id: uuid.UUID | None) -> psycopg.Connection:
    """Open a fresh app_user connection, optionally 'logged in' as
    auth_user_id via the test shim's session-level GUC. auth_user_id=None
    leaves the caller anonymous (auth.uid() returns null), exercising the
    default-deny path."""
    conn = psycopg.connect(**_app_user_params(db_url), autocommit=True)
    if auth_user_id is not None:
        conn.execute("select test_login_as(%s)", (str(auth_user_id),))
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

    confirmed_a1_id: uuid.UUID = field(default_factory=uuid.uuid4)


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
            "confirmed_a1",
        )
    }

    owner_conn.execute(
        "insert into league (id, name) values (%s, %s)",
        (ids["league"], "Test League"),
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
    # the whole league via team.league_id -- see 0002_rls.sql's
    # app_caller_league_ids()/app_caller_readable_team_ids() comment block.
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

    owner_conn.execute(
        """
        insert into confirmed_level (id, athlete_id, team_id, coach_id, ride_group_id, skill, level)
        values (%s, %s, %s, %s, %s, 'cornering', 2)
        """,
        (ids["confirmed_a1"], ids["athlete_a1"], ids["team_a"], ids["coach_a1_person"], ids["group_a1"]),
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
        confirmed_a1_id=ids["confirmed_a1"],
    )


# ---------------------------------------------------------------------------
# Ride-group coach
# ---------------------------------------------------------------------------


def test_ride_group_coach_sees_own_group_observations(db_url: str, seed: Seed) -> None:
    with _login_as(db_url, seed.coach_a1_auth) as conn:
        rows = conn.execute("select id from observation where id = %s", (seed.obs_a1_id,)).fetchall()
        assert [r[0] for r in rows] == [seed.obs_a1_id]


def test_ride_group_coach_cannot_see_other_group_in_same_team(db_url: str, seed: Seed) -> None:
    with _login_as(db_url, seed.coach_a1_auth) as conn:
        rows = conn.execute("select id from observation where id = %s", (seed.obs_a2_id,)).fetchall()
        assert rows == [], "coach A1 must see zero rows for group A2's observation"


def test_ride_group_coach_cannot_see_other_team(db_url: str, seed: Seed) -> None:
    with _login_as(db_url, seed.coach_a1_auth) as conn:
        rows = conn.execute("select id from observation where id = %s", (seed.obs_b1_id,)).fetchall()
        assert rows == [], "coach A1 must see zero rows for team B's observation"


def test_ride_group_coach_unscoped_select_only_returns_own_group(db_url: str, seed: Seed) -> None:
    """Belt-and-braces: an unfiltered SELECT (not keyed by id) must still
    only surface the caller's own ride group -- confirms RLS filters rows,
    it isn't just that our WHERE clause happened to miss them above."""
    with _login_as(db_url, seed.coach_a1_auth) as conn:
        rows = conn.execute("select id from observation").fetchall()
        assert {r[0] for r in rows} == {seed.obs_a1_id}


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


def test_hc_sees_all_groups_across_own_team(db_url: str, seed: Seed) -> None:
    # Superset, not exact-equal: earlier tests in this module may have
    # inserted additional rows into team A's groups (e.g.
    # test_ride_group_coach_can_insert_for_own_group) -- those are
    # legitimately visible to the HC too, since HC sees the whole team.
    # obs_b1 (team B) must NOT be present -- that's the actual assertion of
    # interest for team isolation.
    with _login_as(db_url, seed.hc_a_auth) as conn:
        rows = conn.execute("select id from observation").fetchall()
        ids = {r[0] for r in rows}
        assert {seed.obs_a1_id, seed.obs_a2_id} <= ids
        assert seed.obs_b1_id not in ids


def test_hc_cannot_see_other_team(db_url: str, seed: Seed) -> None:
    with _login_as(db_url, seed.hc_a_auth) as conn:
        rows = conn.execute("select id from observation where id = %s", (seed.obs_b1_id,)).fetchall()
        assert rows == []


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


def test_hc_can_update_across_team(db_url: str, seed: Seed) -> None:
    with _login_as(db_url, seed.hc_a_auth) as conn:
        conn.execute(
            "update observation set notes = %s where id = %s",
            ("updated by hc", seed.obs_a2_id),
        )
        row = conn.execute("select notes from observation where id = %s", (seed.obs_a2_id,)).fetchone()
        assert row is not None and row[0] == "updated by hc"


def test_hc_sees_own_team_roster(db_url: str, seed: Seed) -> None:
    with _login_as(db_url, seed.hc_a_auth) as conn:
        rows = conn.execute("select id from person where team_id = %s", (seed.team_a_id,)).fetchall()
        person_ids = {r[0] for r in rows}
        assert seed.coach_a1_person in person_ids
        assert seed.coach_a2_person in person_ids
        assert seed.athlete_a1_id in person_ids


def test_hc_cannot_see_other_team_roster(db_url: str, seed: Seed) -> None:
    with _login_as(db_url, seed.hc_a_auth) as conn:
        rows = conn.execute("select id from person where id = %s", (seed.coach_b1_person,)).fetchall()
        assert rows == []


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


def test_league_staff_update_denied(db_url: str, seed: Seed) -> None:
    # No UPDATE policy matches league_staff on `observation` (only a SELECT
    # policy exists for that role) -- RLS treats this like a WHERE clause
    # that matches nothing: the UPDATE succeeds as a statement but affects
    # zero rows, it does not raise. Assert both: cursor.rowcount == 0, and
    # (reading back as the owner, bypassing RLS) the value truly didn't
    # change.
    with _login_as(db_url, seed.league_staff_auth) as conn:
        cur = conn.execute(
            "update observation set notes = %s where id = %s",
            ("should not stick", seed.obs_a1_id),
        )
        assert cur.rowcount == 0
    with psycopg.connect(db_url, autocommit=True) as owner:
        row = owner.execute("select notes from observation where id = %s", (seed.obs_a1_id,)).fetchone()
        assert row is not None and row[0] != "should not stick"


def test_league_staff_cannot_write_confirmed_level(db_url: str, seed: Seed) -> None:
    new_id = uuid.uuid4()
    with _login_as(db_url, seed.league_staff_auth) as conn:
        with pytest.raises(psycopg.Error):
            conn.execute(
                """
                insert into confirmed_level (id, athlete_id, team_id, coach_id, ride_group_id, skill, level)
                values (%s, %s, %s, %s, %s, 'cornering', 1)
                """,
                (new_id, seed.athlete_a1_id, seed.team_a_id, seed.league_staff_person, seed.group_a1_id),
            )


# ---------------------------------------------------------------------------
# Cross-team / anonymous default-deny
# ---------------------------------------------------------------------------


def test_anonymous_sees_nothing(db_url: str, seed: Seed) -> None:
    with _login_as(db_url, None) as conn:
        rows = conn.execute("select id from observation").fetchall()
        assert rows == []


def test_anonymous_insert_denied(db_url: str, seed: Seed) -> None:
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

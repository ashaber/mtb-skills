"""Integration tests for app.db.rls_connection against a live Postgres.

Proves the session helper itself enforces RLS -- not just that the raw SQL
mechanism works (that's tests/db/test_rls_authenticated.py's job) but that
THIS backend's Python wrapper around it does the right `SET LOCAL role` /
`request.jwt.claims` setup, commits on success, rolls back on error, and
that two different coaches' `sub`s genuinely see different data through the
exact same function.
"""

from __future__ import annotations

import uuid

import psycopg
import pytest

from app.db import RlsConnectionError, rls_connection


@pytest.fixture
def seed(owner_conn: psycopg.Connection) -> dict[str, uuid.UUID]:
    """Two ride groups on one team, one coach each, one observation each --
    enough to prove group-A's coach sees group A's row and not group B's,
    through app.db.rls_connection specifically."""
    ids = {
        name: uuid.uuid4()
        for name in (
            "league",
            "team",
            "group_a",
            "group_b",
            "coach_a_person",
            "coach_a_auth",
            "coach_b_person",
            "coach_b_auth",
            "athlete_a",
            "athlete_b",
            "obs_a",
            "obs_b",
        )
    }
    owner_conn.execute("insert into league (id, name) values (%s, %s)", (ids["league"], "L"))
    owner_conn.execute(
        "insert into team (id, league_id, name) values (%s, %s, %s)",
        (ids["team"], ids["league"], "T"),
    )
    owner_conn.execute(
        "insert into ride_group (id, team_id, name) values (%s, %s, %s)",
        (ids["group_a"], ids["team"], "Group A"),
    )
    owner_conn.execute(
        "insert into ride_group (id, team_id, name) values (%s, %s, %s)",
        (ids["group_b"], ids["team"], "Group B"),
    )
    owner_conn.execute(
        "insert into person (id, team_id, ride_group_id, role, name) values (%s, %s, %s, 'coach', %s)",
        (ids["coach_a_person"], ids["team"], ids["group_a"], "Coach A"),
    )
    owner_conn.execute(
        "insert into auth_person (auth_user_id, person_id) values (%s, %s)",
        (ids["coach_a_auth"], ids["coach_a_person"]),
    )
    owner_conn.execute(
        "insert into person (id, team_id, ride_group_id, role, name) values (%s, %s, %s, 'coach', %s)",
        (ids["coach_b_person"], ids["team"], ids["group_b"], "Coach B"),
    )
    owner_conn.execute(
        "insert into auth_person (auth_user_id, person_id) values (%s, %s)",
        (ids["coach_b_auth"], ids["coach_b_person"]),
    )
    owner_conn.execute(
        "insert into person (id, team_id, ride_group_id, role, name) values (%s, %s, %s, 'athlete', %s)",
        (ids["athlete_a"], ids["team"], ids["group_a"], "Athlete A"),
    )
    owner_conn.execute(
        "insert into person (id, team_id, ride_group_id, role, name) values (%s, %s, %s, 'athlete', %s)",
        (ids["athlete_b"], ids["team"], ids["group_b"], "Athlete B"),
    )
    owner_conn.execute(
        """
        insert into observation
            (id, athlete_id, team_id, coach_id, ride_group_id, session_date, skill, level_observed, notes)
        values (%s, %s, %s, %s, %s, current_date, 'cornering', 2, 'group a seed')
        """,
        (ids["obs_a"], ids["athlete_a"], ids["team"], ids["coach_a_person"], ids["group_a"]),
    )
    owner_conn.execute(
        """
        insert into observation
            (id, athlete_id, team_id, coach_id, ride_group_id, session_date, skill, level_observed, notes)
        values (%s, %s, %s, %s, %s, current_date, 'braking', 3, 'group b seed')
        """,
        (ids["obs_b"], ids["athlete_b"], ids["team"], ids["coach_b_person"], ids["group_b"]),
    )
    return ids


def test_rls_connection_scopes_select_to_callers_ride_group(db_url: str, seed: dict[str, uuid.UUID]) -> None:
    with rls_connection(db_url, str(seed["coach_a_auth"])) as conn:
        rows = conn.execute("select id from observation").fetchall()
        assert {r[0] for r in rows} == {seed["obs_a"]}


def test_rls_connection_different_subs_see_different_rows(db_url: str, seed: dict[str, uuid.UUID]) -> None:
    with rls_connection(db_url, str(seed["coach_a_auth"])) as conn_a:
        rows_a = {r[0] for r in conn_a.execute("select id from observation").fetchall()}
    with rls_connection(db_url, str(seed["coach_b_auth"])) as conn_b:
        rows_b = {r[0] for r in conn_b.execute("select id from observation").fetchall()}

    assert rows_a == {seed["obs_a"]}
    assert rows_b == {seed["obs_b"]}
    assert rows_a.isdisjoint(rows_b)


def test_rls_connection_cross_group_insert_raises(db_url: str, seed: dict[str, uuid.UUID]) -> None:
    new_id = uuid.uuid4()
    with pytest.raises(psycopg.Error):
        with rls_connection(db_url, str(seed["coach_a_auth"])) as conn:
            conn.execute(
                """
                insert into observation
                    (id, athlete_id, team_id, coach_id, ride_group_id, session_date, skill, level_observed)
                values (%s, %s, %s, %s, %s, current_date, 'cornering', 3)
                """,
                (new_id, seed["athlete_b"], seed["team"], seed["coach_a_person"], seed["group_b"]),
            )


def test_rls_connection_own_group_insert_commits_and_is_visible_after(
    db_url: str, seed: dict[str, uuid.UUID], owner_conn: psycopg.Connection
) -> None:
    new_id = uuid.uuid4()
    with rls_connection(db_url, str(seed["coach_a_auth"])) as conn:
        conn.execute(
            """
            insert into observation
                (id, athlete_id, team_id, coach_id, ride_group_id, session_date, skill, level_observed)
            values (%s, %s, %s, %s, %s, current_date, 'cornering', 4)
            """,
            (new_id, seed["athlete_a"], seed["team"], seed["coach_a_person"], seed["group_a"]),
        )

    # Commits on successful exit -- readable afterward by the (RLS-bypassing)
    # owner connection, proving the transaction wasn't left open/rolled back.
    row = owner_conn.execute("select id from observation where id = %s", (new_id,)).fetchone()
    assert row is not None


def test_rls_connection_raised_exception_rolls_back(
    db_url: str, seed: dict[str, uuid.UUID], owner_conn: psycopg.Connection
) -> None:
    new_id = uuid.uuid4()

    class _Boom(Exception):
        pass

    with pytest.raises(_Boom):
        with rls_connection(db_url, str(seed["coach_a_auth"])) as conn:
            conn.execute(
                """
                insert into observation
                    (id, athlete_id, team_id, coach_id, ride_group_id, session_date, skill, level_observed)
                values (%s, %s, %s, %s, %s, current_date, 'cornering', 4)
                """,
                (new_id, seed["athlete_a"], seed["team"], seed["coach_a_person"], seed["group_a"]),
            )
            raise _Boom("simulated failure after a successful insert")

    row = owner_conn.execute("select id from observation where id = %s", (new_id,)).fetchone()
    assert row is None, "insert must have been rolled back, not committed"


def test_rls_connection_rejects_empty_sub() -> None:
    with pytest.raises(ValueError):
        with rls_connection("postgresql://unused", ""):
            pass  # pragma: no cover - ValueError raises before connecting


def test_rls_connection_bad_database_url_raises_rlsconnectionerror() -> None:
    with pytest.raises(RlsConnectionError):
        with rls_connection("postgresql://nobody@127.0.0.1:1/does-not-exist", str(uuid.uuid4())):
            pass  # pragma: no cover - connect() fails before this runs

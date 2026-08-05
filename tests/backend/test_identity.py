"""Integration tests for app.identity against a live Postgres, run through
app.db.rls_connection (see that module's docstring for why persona lookup
itself goes through the same RLS-scoped session every other query uses).

Covers docs/PHASE3_1_AUTH_HEADSTART.md's identity target: "a shared-email
fixture (one auth_user_id linked to a coach on team A AND an athlete --
athlete must be ignored; and a >1-coach case)."
"""

from __future__ import annotations

import uuid

import psycopg
import pytest

from app.db import rls_connection
from app.identity import (
    MultiplePersonasError,
    NoPersonaError,
    Persona,
    resolve_personas,
    select_persona,
)


@pytest.fixture
def league_and_teams(owner_conn: psycopg.Connection) -> dict[str, uuid.UUID]:
    ids = {name: uuid.uuid4() for name in ("league", "team_a", "team_b", "group_a")}
    owner_conn.execute("insert into league (id, name) values (%s, %s)", (ids["league"], "L"))
    owner_conn.execute(
        "insert into team (id, league_id, name) values (%s, %s, %s)", (ids["team_a"], ids["league"], "Team A")
    )
    owner_conn.execute(
        "insert into team (id, league_id, name) values (%s, %s, %s)", (ids["team_b"], ids["league"], "Team B")
    )
    owner_conn.execute(
        "insert into ride_group (id, team_id, name) values (%s, %s, %s)", (ids["group_a"], ids["team_a"], "Group A")
    )
    return ids


def _insert_person(
    conn: psycopg.Connection,
    person_id: uuid.UUID,
    team_id: uuid.UUID,
    ride_group_id: uuid.UUID | None,
    role: str,
    name: str,
) -> None:
    conn.execute(
        "insert into person (id, team_id, ride_group_id, role, name) values (%s, %s, %s, %s, %s)",
        (person_id, team_id, ride_group_id, role, name),
    )


def test_shared_email_resolves_only_the_coach_persona_not_the_athlete(
    db_url: str, owner_conn: psycopg.Connection, league_and_teams: dict[str, uuid.UUID]
) -> None:
    """The documented shared-family-email case: a PitZone email is
    family-level, so the SAME auth_user_id can be linked to a parent's
    coach `person` row AND their kid's athlete `person` row. Login must
    resolve to the coach persona only -- athletes never log in."""
    shared_auth_id = uuid.uuid4()
    coach_person = uuid.uuid4()
    athlete_person = uuid.uuid4()

    _insert_person(
        owner_conn, coach_person, league_and_teams["team_a"], league_and_teams["group_a"], "coach", "Parent Coach"
    )
    _insert_person(
        owner_conn, athlete_person, league_and_teams["team_a"], league_and_teams["group_a"], "athlete", "Kid Athlete"
    )
    owner_conn.execute(
        "insert into auth_person (auth_user_id, person_id) values (%s, %s)", (shared_auth_id, coach_person)
    )
    owner_conn.execute(
        "insert into auth_person (auth_user_id, person_id) values (%s, %s)", (shared_auth_id, athlete_person)
    )

    with rls_connection(db_url, str(shared_auth_id)) as conn:
        personas = resolve_personas(conn, str(shared_auth_id))

    assert len(personas) == 1
    persona = select_persona(personas)
    assert persona.person_id == str(coach_person)
    assert persona.role == "coach"
    assert persona.ride_group_id == str(league_and_teams["group_a"])


def test_multiple_coach_personas_raises_multiplepersonaserror_with_full_list(
    db_url: str, owner_conn: psycopg.Connection, league_and_teams: dict[str, uuid.UUID]
) -> None:
    """A traveling coach on two teams (plan doc's resolved "multi-team
    coaches" question) -- >1 coach persona must raise, carrying every
    persona found, so the caller can render a "which hat" picker."""
    traveling_auth_id = uuid.uuid4()
    hc_person = uuid.uuid4()
    coach_person = uuid.uuid4()

    _insert_person(owner_conn, hc_person, league_and_teams["team_a"], None, "head_coach", "HC on Team A")
    _insert_person(
        owner_conn, coach_person, league_and_teams["team_b"], None, "coach", "Also coaches Team B"
    )
    owner_conn.execute(
        "insert into auth_person (auth_user_id, person_id) values (%s, %s)", (traveling_auth_id, hc_person)
    )
    owner_conn.execute(
        "insert into auth_person (auth_user_id, person_id) values (%s, %s)", (traveling_auth_id, coach_person)
    )

    with rls_connection(db_url, str(traveling_auth_id)) as conn:
        personas = resolve_personas(conn, str(traveling_auth_id))

    assert len(personas) == 2

    with pytest.raises(MultiplePersonasError) as excinfo:
        select_persona(personas)
    assert {p.person_id for p in excinfo.value.personas} == {str(hc_person), str(coach_person)}


def test_no_auth_person_row_raises_nopersonaerror(db_url: str) -> None:
    """A verified Supabase login (real `sub`) with no `auth_person` row at
    all -- not yet provisioned as any coach."""
    stray_auth_id = uuid.uuid4()

    with rls_connection(db_url, str(stray_auth_id)) as conn:
        personas = resolve_personas(conn, str(stray_auth_id))

    assert personas == []
    with pytest.raises(NoPersonaError):
        select_persona(personas)


def test_athlete_only_auth_person_row_raises_nopersonaerror(
    db_url: str, owner_conn: psycopg.Connection, league_and_teams: dict[str, uuid.UUID]
) -> None:
    """Belt-and-braces: even a real (non-shared) athlete-only link resolves
    to zero coach personas, not an accidental athlete persona."""
    athlete_only_auth_id = uuid.uuid4()
    athlete_person = uuid.uuid4()
    _insert_person(
        owner_conn, athlete_person, league_and_teams["team_a"], league_and_teams["group_a"], "athlete", "Solo Athlete"
    )
    owner_conn.execute(
        "insert into auth_person (auth_user_id, person_id) values (%s, %s)", (athlete_only_auth_id, athlete_person)
    )

    with rls_connection(db_url, str(athlete_only_auth_id)) as conn:
        personas = resolve_personas(conn, str(athlete_only_auth_id))

    assert personas == []
    with pytest.raises(NoPersonaError):
        select_persona(personas)


def test_select_persona_returns_the_single_persona() -> None:
    only = Persona(person_id="p1", role="coach", team_id="t1", ride_group_id="g1", name="Solo Coach")
    assert select_persona([only]) is only

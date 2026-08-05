"""`/api/*` data endpoints -- the RLS-enforced round trip.

Every route below depends on `Depends(get_caller)` (app/deps.py) for who's
calling, and opens its OWN `app.db.rls_connection(settings.database_url,
caller.sub)` for the actual query -- this is the ONLY way any of these
routes touch the database. There is no privileged/raw connection anywhere
in this module: RLS (supabase/migrations/0002_rls.sql) is what actually
decides which rows a caller can read or write, not application logic here.
Application logic only picks WHICH rows to ask for / what to attribute a
write to -- the database is the authorization backstop for all of it.

Response shapes mirror app/schema.md's Observation / ConfirmedLevel field
lists, plus the Phase-3 `person`/`Persona` shape from app/identity.py.
"""

from __future__ import annotations

import uuid
from datetime import date, datetime
from typing import Any

import psycopg
from fastapi import APIRouter, Depends, HTTPException

from app import roster
from app.config import Settings
from app.db import rls_connection
from app.deps import Caller, get_caller, get_settings_dep
from app.identity import Persona
from app.logging import get_logger
from app.schemas import ConfirmedLevelIn, ObservationIn, RosterImportIn

log = get_logger("app.routes")

router = APIRouter(prefix="/api")


# ==========================================================================
# Row -> JSON helpers. psycopg hands back native Python types (uuid.UUID,
# datetime.date, datetime.datetime) that aren't directly JSON-serializable
# by FastAPI's default encoder for a plain `dict` return, so every row is
# converted explicitly here rather than relying on a response_model to do
# it implicitly -- keeps the DB row shape -> wire shape mapping visible in
# one place per resource.
# ==========================================================================


def _uuid_or_none(value: Any) -> str | None:
    return str(value) if value is not None else None


def _persona_to_dict(persona: Persona) -> dict[str, Any]:
    return {
        "person_id": persona.person_id,
        "role": persona.role,
        "team_id": persona.team_id,
        "ride_group_id": persona.ride_group_id,
        "name": persona.name,
    }


def _observation_row_to_dict(row: tuple) -> dict[str, Any]:
    (obs_id, athlete_id, team_id, coach_id, ride_group_id, session_date, skill, level_observed, notes) = row
    return {
        "id": str(obs_id),
        "athlete_id": str(athlete_id),
        "team_id": str(team_id),
        "coach_id": _uuid_or_none(coach_id),
        "ride_group_id": _uuid_or_none(ride_group_id),
        "session_date": session_date.isoformat() if isinstance(session_date, date) else session_date,
        "skill": skill,
        "level_observed": level_observed,
        "notes": notes,
    }


def _confirmed_level_row_to_dict(row: tuple) -> dict[str, Any]:
    (cl_id, athlete_id, team_id, coach_id, ride_group_id, skill, level, confirmed_at) = row
    return {
        "id": str(cl_id),
        "athlete_id": str(athlete_id),
        "team_id": str(team_id),
        "coach_id": _uuid_or_none(coach_id),
        "ride_group_id": _uuid_or_none(ride_group_id),
        "skill": skill,
        "level": level,
        "confirmed_at": confirmed_at.isoformat() if isinstance(confirmed_at, datetime) else confirmed_at,
    }


def _person_row_to_dict(row: tuple) -> dict[str, Any]:
    (person_id, team_id, ride_group_id, role, name, external_id) = row
    return {
        "id": str(person_id),
        "team_id": str(team_id),
        "ride_group_id": _uuid_or_none(ride_group_id),
        "role": role,
        "name": name,
        "external_id": external_id,
    }


# ==========================================================================
# Write attribution -- shared by POST /api/observations and POST
# /api/confirmed-levels. Both derive team_id/ride_group_id/coach_id from
# the target athlete's own `person` row rather than trusting anything the
# client sent, and both do it inside the SAME `rls_connection` the write
# itself runs in (per the task brief: "Server derives team_id +
# ride_group_id from the athlete's person row (SELECT within the same
# rls_connection -- the coach can only see the athlete if in-scope)").
# ==========================================================================


class _AthleteNotInScope(Exception):
    """The athlete_id either doesn't exist or RLS's `person_select` policy
    hides it from this caller -- indistinguishable from this backend's
    point of view, and deliberately so (never confirm/deny existence of a
    row a caller can't see). Always surfaces as 403."""


def _resolve_athlete_scope(conn: psycopg.Connection, athlete_id: uuid.UUID) -> tuple[uuid.UUID, uuid.UUID | None]:
    """`(team_id, ride_group_id)` of the athlete `person` row, as visible to
    the caller through THIS connection's RLS scope. Raises
    `_AthleteNotInScope` if the SELECT returns zero rows -- either the id
    doesn't exist at all, or it does but RLS filtered it out because the
    caller can't see that athlete (out-of-group)."""
    row = conn.execute(
        "select team_id, ride_group_id from person where id = %s and role = 'athlete'",
        (athlete_id,),
    ).fetchone()
    if row is None:
        raise _AthleteNotInScope(str(athlete_id))
    return row[0], row[1]


def _select_attributing_coach(personas: list[Persona], athlete_ride_group_id: uuid.UUID | None) -> Persona:
    """Which of the caller's persona(s) a write is attributed to
    (`coach_id`). Prefers the persona whose own `ride_group_id` matches
    the athlete's (the common case: a ride-group coach recording their own
    group's athlete). Falls back to the caller's first/sole persona when
    no ride-group match is found -- covers an HC/TD persona (whose own
    `ride_group_id` is null by design, see 0001_schema.sql) recording for
    an athlete in a specific group, and the pilot's one-team-per-coach
    common case generally. `get_caller` guarantees `personas` is non-empty
    before a route ever reaches this function.

    # TODO 3.x: once X-Persona-Id lands (app/deps.py's TODO), a caller
    # with multiple non-matching personas should be required to
    # disambiguate explicitly rather than silently falling back to the
    # first one.
    """
    target = str(athlete_ride_group_id) if athlete_ride_group_id is not None else None
    for persona in personas:
        if persona.ride_group_id is not None and persona.ride_group_id == target:
            return persona
    return personas[0]


# ==========================================================================
# GET /api/me
# ==========================================================================


@router.get("/me")
def get_me(caller: Caller = Depends(get_caller)) -> dict[str, Any]:
    return {"personas": [_persona_to_dict(p) for p in caller.personas]}


# ==========================================================================
# observations
# ==========================================================================


@router.get("/observations")
def list_observations(
    caller: Caller = Depends(get_caller),
    settings: Settings = Depends(get_settings_dep),
) -> list[dict[str, Any]]:
    with rls_connection(settings.database_url, caller.sub) as conn:
        rows = conn.execute(
            """
            select id, athlete_id, team_id, coach_id, ride_group_id,
                   session_date, skill, level_observed, notes
            from observation
            order by session_date desc, created_at desc
            """
        ).fetchall()
    return [_observation_row_to_dict(row) for row in rows]


@router.post("/observations", status_code=201)
def create_observation(
    body: ObservationIn,
    caller: Caller = Depends(get_caller),
    settings: Settings = Depends(get_settings_dep),
) -> dict[str, Any]:
    session_date = body.session_date or date.today()
    obs_id = body.id or uuid.uuid4()

    with rls_connection(settings.database_url, caller.sub) as conn:
        try:
            team_id, ride_group_id = _resolve_athlete_scope(conn, body.athlete_id)
        except _AthleteNotInScope as exc:
            log.warn("observations.athlete_not_in_scope", athlete_id=str(body.athlete_id), sub=caller.sub)
            raise HTTPException(status_code=403, detail="cannot record for that athlete") from exc

        coach = _select_attributing_coach(caller.personas, ride_group_id)

        try:
            # Client-minted id + `on conflict do nothing` makes a re-pushed
            # observation an idempotent no-op (append-only sync, union by id)
            # rather than a duplicate. `do nothing` (not `do update`) also
            # means a client can never overwrite an existing row it doesn't
            # own -- a colliding id just no-ops.
            row = conn.execute(
                """
                insert into observation
                    (id, athlete_id, team_id, coach_id, ride_group_id, session_date, skill, level_observed, notes)
                values (%s, %s, %s, %s, %s, %s, %s, %s, %s)
                on conflict (id) do nothing
                returning id, athlete_id, team_id, coach_id, ride_group_id,
                          session_date, skill, level_observed, notes
                """,
                (
                    obs_id,
                    body.athlete_id,
                    team_id,
                    coach.person_id,
                    ride_group_id,
                    session_date,
                    body.skill.value,
                    body.level_observed,
                    body.notes,
                ),
            ).fetchone()

            if row is None:
                # id already existed -> idempotent replay if it's the caller's
                # own row (visible under RLS); otherwise the id belongs to a
                # row they can't see -> 409, never leaking whose it is.
                row = conn.execute(
                    """
                    select id, athlete_id, team_id, coach_id, ride_group_id,
                           session_date, skill, level_observed, notes
                    from observation where id = %s
                    """,
                    (obs_id,),
                ).fetchone()
        except psycopg.Error as exc:
            log.warn("observations.insert_denied", athlete_id=str(body.athlete_id), sub=caller.sub, error=str(exc))
            raise HTTPException(status_code=403, detail="cannot record for that athlete") from exc

    if row is None:
        raise HTTPException(status_code=409, detail="observation id already exists")

    return _observation_row_to_dict(row)


# ==========================================================================
# confirmed-levels
# ==========================================================================


@router.get("/confirmed-levels")
def list_confirmed_levels(
    caller: Caller = Depends(get_caller),
    settings: Settings = Depends(get_settings_dep),
) -> list[dict[str, Any]]:
    with rls_connection(settings.database_url, caller.sub) as conn:
        rows = conn.execute(
            """
            select id, athlete_id, team_id, coach_id, ride_group_id, skill, level, confirmed_at
            from confirmed_level
            order by confirmed_at desc
            """
        ).fetchall()
    return [_confirmed_level_row_to_dict(row) for row in rows]


@router.post("/confirmed-levels")
def upsert_confirmed_level(
    body: ConfirmedLevelIn,
    caller: Caller = Depends(get_caller),
    settings: Settings = Depends(get_settings_dep),
) -> dict[str, Any]:
    with rls_connection(settings.database_url, caller.sub) as conn:
        try:
            team_id, ride_group_id = _resolve_athlete_scope(conn, body.athlete_id)
        except _AthleteNotInScope as exc:
            log.warn("confirmed_levels.athlete_not_in_scope", athlete_id=str(body.athlete_id), sub=caller.sub)
            raise HTTPException(status_code=403, detail="cannot record for that athlete") from exc

        coach = _select_attributing_coach(caller.personas, ride_group_id)

        try:
            # LWW upsert by (athlete_id, skill): the caller's RLS-visible
            # scope for confirmed_level SELECT is the same ride-group/team
            # scope the INSERT/UPDATE policies grant writes for, so "no
            # existing row visible" and "no existing row at all" coincide
            # for any caller actually authorized to touch this athlete+skill.
            existing = conn.execute(
                """
                select id from confirmed_level
                where athlete_id = %s and skill = %s
                order by confirmed_at desc
                limit 1
                """,
                (body.athlete_id, body.skill.value),
            ).fetchone()

            if existing is not None:
                row = conn.execute(
                    """
                    update confirmed_level
                    set level = %s, confirmed_at = now(), coach_id = %s
                    where id = %s
                    returning id, athlete_id, team_id, coach_id, ride_group_id, skill, level, confirmed_at
                    """,
                    (body.level, coach.person_id, existing[0]),
                ).fetchone()
            else:
                row = conn.execute(
                    """
                    insert into confirmed_level (athlete_id, team_id, coach_id, ride_group_id, skill, level)
                    values (%s, %s, %s, %s, %s, %s)
                    returning id, athlete_id, team_id, coach_id, ride_group_id, skill, level, confirmed_at
                    """,
                    (body.athlete_id, team_id, coach.person_id, ride_group_id, body.skill.value, body.level),
                ).fetchone()
        except psycopg.Error as exc:
            log.warn(
                "confirmed_levels.upsert_denied", athlete_id=str(body.athlete_id), sub=caller.sub, error=str(exc)
            )
            raise HTTPException(status_code=403, detail="cannot record for that athlete") from exc

    if row is None:  # pragma: no cover - RETURNING always yields a row on a successful INSERT/UPDATE
        raise HTTPException(status_code=403, detail="cannot record for that athlete")

    return _confirmed_level_row_to_dict(row)


# ==========================================================================
# roster
# ==========================================================================


@router.get("/roster")
def list_roster(
    caller: Caller = Depends(get_caller),
    settings: Settings = Depends(get_settings_dep),
) -> list[dict[str, Any]]:
    with rls_connection(settings.database_url, caller.sub) as conn:
        rows = conn.execute(
            """
            select id, team_id, ride_group_id, role, name, external_id
            from person
            order by name
            """
        ).fetchall()
    return [_person_row_to_dict(row) for row in rows]


# ==========================================================================
# roster import -- HC/TD bulk upsert (app/roster.py does the actual merge
# logic; this route's job is entirely "which team is this caller allowed to
# import into" + wiring the RLS-scoped connection).
# ==========================================================================

_HC_TD_ROLES = ("head_coach", "team_director")


@router.post("/roster/import")
def import_roster(
    body: RosterImportIn,
    caller: Caller = Depends(get_caller),
    settings: Settings = Depends(get_settings_dep),
) -> dict[str, Any]:
    # Target team is ALWAYS derived from the caller's own HC/TD persona --
    # never from anything in the request body (app/roster.py's module
    # docstring / RosterRowIn's docstring: rows carry no team_id at all, so
    # there is no vector for a client to name a different team here, even
    # before RLS would deny the resulting write anyway).
    hc_td_team_ids = {p.team_id for p in caller.personas if p.role in _HC_TD_ROLES}

    if not hc_td_team_ids:
        log.warn("roster.import_denied_not_hc", sub=caller.sub)
        raise HTTPException(status_code=403, detail="roster import is head-coach/team-director only")

    if len(hc_td_team_ids) > 1:
        # TODO 3.x: multi-team HC support -- accept an explicit team_id in
        # the request body (validated against the caller's own HC/TD
        # team_ids) once a coach can lead more than one team in the pilot.
        # Out of scope for now (CLAUDE.md's Phase 3 pilot is one-team-per-
        # coach in the common case; this is the rare traveling-TD case
        # app/identity.py's MultiplePersonasError already anticipates).
        log.warn("roster.import_ambiguous_team", sub=caller.sub, team_count=len(hc_td_team_ids))
        raise HTTPException(status_code=400, detail="specify which team")

    (team_id,) = hc_td_team_ids

    with rls_connection(settings.database_url, caller.sub) as conn:
        try:
            summary = roster.import_roster(conn, uuid.UUID(team_id), body.rows)
        except psycopg.Error as exc:
            # Shouldn't happen -- team_id is the caller's own HC/TD team, so
            # RLS's person_insert/person_update/ride_group_insert policies
            # (all "team_id in caller's own HC/TD teams") should always
            # allow this. Denied anyway (defense in depth) -> 403, never a
            # raw 500 for what is fundamentally an authorization outcome.
            log.warn("roster.import_denied", sub=caller.sub, team_id=team_id, error=str(exc))
            raise HTTPException(status_code=403, detail="cannot import roster for that team") from exc

    return summary

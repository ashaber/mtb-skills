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
from app.schemas import AssignRideGroupIn, AthleteIn, ConfirmedLevelIn, ObservationIn, RosterImportIn

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


def _person_row_to_dict(row: tuple, ride_group_name: str | None = None) -> dict[str, Any]:
    # `row` is always the 9-column person tuple; `ride_group_name` is the
    # denormalized name of that person's ride_group (LEFT JOINed in
    # list_roster / looked up in create_athlete) so the frontend can show
    # and filter by group without a second round-trip. It is None for a
    # person with no ride_group (HC/TD/league_staff rows whose
    # ride_group_id is null), and is itself RLS-coherent: a ride_group is
    # visible exactly when the person on it is (person_select and
    # ride_group_select share the same group/team scoping in 0002_rls.sql).
    (person_id, team_id, ride_group_id, role, name, external_id, grade, category, tags) = row
    return {
        "id": str(person_id),
        "team_id": str(team_id),
        "ride_group_id": _uuid_or_none(ride_group_id),
        "ride_group_name": ride_group_name,
        "role": role,
        "name": name,
        "external_id": external_id,
        "grade": grade,
        "category": category,
        "tags": list(tags) if tags is not None else [],
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
    """`(team_id, ride_group_id)` of the assessment TARGET's `person` row, as
    visible to the caller through THIS connection's RLS scope. Raises
    `_AthleteNotInScope` if the SELECT returns zero rows -- either the id
    doesn't exist at all, or it does but RLS filtered it out because the
    caller can't see that person (out-of-group).

    Note: this intentionally does NOT filter `role = 'athlete'`. Coaches are
    assessable too (a coach demonstrates the same rubric skills), so any
    person the caller can see under `person_select` -- athlete OR coach in
    their ride group / team -- is a valid target. RLS's
    observation_insert/confirmed_level_insert policies (keyed on
    ride_group_id/team_id, not role) are what still bound WHO a caller may
    record for; nothing here needs to re-check the target's role."""
    row = conn.execute(
        "select team_id, ride_group_id from person where id = %s",
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
        except psycopg.errors.InsufficientPrivilege as exc:
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
        except psycopg.errors.InsufficientPrivilege as exc:
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
        # LEFT JOIN ride_group so each person carries its group's name (or
        # null). Under RLS the join can only surface a ride_group the caller
        # is already allowed to see (ride_group_select shares person_select's
        # scoping), so this never leaks a group name the caller couldn't
        # otherwise read.
        rows = conn.execute(
            """
            select p.id, p.team_id, p.ride_group_id, p.role, p.name,
                   p.external_id, p.grade, p.category, p.tags, rg.name
            from person p
            left join ride_group rg on rg.id = p.ride_group_id
            order by p.name
            """
        ).fetchall()
    return [_person_row_to_dict(row[:9], ride_group_name=row[9]) for row in rows]


# ==========================================================================
# athletes -- a coach adding a single walk-up athlete to their own ride
# group (docs/PHASE3_RECONCILIATION_PLAN.md decision (a);
# supabase/migrations/0008_coach_add_athlete_rls.sql is the actual authz).
# ==========================================================================


@router.post("/athletes", status_code=201)
def create_athlete(
    body: AthleteIn,
    caller: Caller = Depends(get_caller),
    settings: Settings = Depends(get_settings_dep),
) -> dict[str, Any]:
    with rls_connection(settings.database_url, caller.sub) as conn:
        # team_id is ALWAYS derived from the target ride_group row itself,
        # never taken from the request body (AthleteIn has no team_id field
        # at all) -- this SELECT runs through the caller's own RLS scope, so
        # a ride_group the caller can't see (not their own group, and they
        # aren't HC/TD on that team) returns zero rows here, same as
        # _resolve_athlete_scope's "doesn't exist vs. hidden by RLS" posture
        # above -- indistinguishable from this backend's point of view, and
        # deliberately so.
        group_row = conn.execute(
            "select team_id, name from ride_group where id = %s",
            (body.ride_group_id,),
        ).fetchone()
        if group_row is None:
            log.warn("athletes.ride_group_not_in_scope", ride_group_id=str(body.ride_group_id), sub=caller.sub)
            raise HTTPException(status_code=403, detail="cannot add to that group")

        team_id, ride_group_name = group_row
        person_id = uuid.uuid4()

        try:
            # role is hardcoded 'athlete' here -- AthleteIn has no role
            # field for a client to override it with (see its docstring).
            # The actual authorization decision (is THIS caller allowed to
            # insert an athlete into THIS ride_group_id/team_id pair) is
            # made by Postgres RLS (0008_coach_add_athlete_rls.sql for a
            # plain ride-group coach, 0002_rls.sql's person_insert for
            # HC/TD), not by anything in this route.
            row = conn.execute(
                """
                insert into person (id, team_id, ride_group_id, role, name, grade, category)
                values (%s, %s, %s, 'athlete', %s, %s, %s)
                returning id, team_id, ride_group_id, role, name, external_id, grade, category, tags
                """,
                (person_id, team_id, body.ride_group_id, body.name, body.grade, body.category),
            ).fetchone()
        except psycopg.errors.InsufficientPrivilege as exc:
            # ONLY an actual RLS-policy denial (SQLSTATE 42501) is treated as
            # a 403 -- mirrors the tightened error handling in
            # import_roster/create_observation/upsert_confirmed_level above.
            # Any other psycopg error is a genuine server/schema fault and
            # propagates to main.py's handler as a 500.
            log.warn(
                "athletes.insert_denied",
                ride_group_id=str(body.ride_group_id),
                sub=caller.sub,
                error=str(exc),
            )
            raise HTTPException(status_code=403, detail="cannot add athlete to that group") from exc

    if row is None:  # pragma: no cover - RETURNING always yields a row on a successful INSERT
        raise HTTPException(status_code=403, detail="cannot add athlete to that group")

    return _person_row_to_dict(row, ride_group_name=ride_group_name)


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
        except psycopg.errors.InsufficientPrivilege as exc:
            # ONLY an actual RLS-policy denial (SQLSTATE 42501) is treated as
            # a 403. Shouldn't normally happen -- team_id is the caller's own
            # HC/TD team, so the person/ride_group RLS policies should always
            # allow it -- but if it does, it's an authorization outcome, not a
            # 500. Any OTHER psycopg error (missing column, bad FK, etc.) is a
            # genuine server/schema fault and deliberately propagates to
            # main.py's handler as a 500 -- NOT masked as "cannot import for
            # that team", which previously mislabeled schema errors as authz.
            log.warn("roster.import_denied", sub=caller.sub, team_id=team_id, error=str(exc))
            raise HTTPException(status_code=403, detail="cannot import roster for that team") from exc

    return summary


# ==========================================================================
# roster assign -- HC/TD reassigns (or unassigns) a single athlete's ride
# group. Authorization is Postgres RLS's `person_update` policy (HC/TD,
# team-wide -- supabase/migrations/0002_rls.sql), same posture as every
# other route in this module: this route only picks WHICH row/values to ask
# the database to write, the database decides whether the caller may.
# ==========================================================================


@router.post("/roster/assign")
def assign_ride_group(
    body: AssignRideGroupIn,
    caller: Caller = Depends(get_caller),
    settings: Settings = Depends(get_settings_dep),
) -> dict[str, Any]:
    with rls_connection(settings.database_url, caller.sub) as conn:
        ride_group_name: str | None = None
        try:
            if body.ride_group_id is not None:
                # Cross-team guard: resolve the TARGET group's team through
                # the caller's own RLS scope first -- an HC only sees
                # ride_group rows on their own team (ride_group_select),
                # so a group belonging to a different team returns zero
                # rows here, exactly like create_athlete's same guard
                # above. This is what prevents ever pointing a person at
                # another team's ride group, even before the UPDATE's own
                # `team_id = %s` pin (below) would catch it too.
                group_row = conn.execute(
                    "select team_id, name from ride_group where id = %s",
                    (body.ride_group_id,),
                ).fetchone()
                if group_row is None:
                    log.warn(
                        "roster.assign.group_not_in_scope",
                        ride_group_id=str(body.ride_group_id),
                        sub=caller.sub,
                    )
                    raise HTTPException(status_code=403, detail="cannot assign to that group")

                team_id, ride_group_name = group_row

                # `and team_id = %s` pins the write to the GROUP's own team
                # -- this is what stops the update from ever moving a
                # person onto a different team than the group they're
                # being assigned into, on top of whatever RLS's
                # person_update `with check` already re-validates.
                row = conn.execute(
                    """
                    update person
                    set ride_group_id = %s
                    where id = %s and team_id = %s
                    returning id, team_id, ride_group_id, role, name, external_id, grade, category, tags
                    """,
                    (body.ride_group_id, body.person_id, team_id),
                ).fetchone()
            else:
                # Unassign: no team to pin against, so no team_id clause --
                # RLS's person_update policy (`using`/`with check` both
                # keyed on the row's own, unmodified team_id) is the only
                # authorization check here.
                row = conn.execute(
                    """
                    update person
                    set ride_group_id = null
                    where id = %s
                    returning id, team_id, ride_group_id, role, name, external_id, grade, category, tags
                    """,
                    (body.person_id,),
                ).fetchone()
        except psycopg.errors.InsufficientPrivilege as exc:
            log.warn("roster.assign.denied", person_id=str(body.person_id), sub=caller.sub, error=str(exc))
            raise HTTPException(status_code=403, detail="cannot reassign that athlete") from exc

    if row is None:
        # UPDATE matched zero rows -- either the caller isn't HC/TD on this
        # person's team (RLS's `using` clause filtered it out silently,
        # no exception) or the person_id/team_id pairing doesn't exist at
        # all. Indistinguishable from here, and deliberately so -- same
        # posture as _resolve_athlete_scope above.
        log.warn("roster.assign.no_row", person_id=str(body.person_id), sub=caller.sub)
        raise HTTPException(status_code=403, detail="cannot reassign that athlete")

    return _person_row_to_dict(row, ride_group_name=ride_group_name)

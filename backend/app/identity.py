"""Identity / person resolution -- `sub -> auth_person -> person` -> coach
persona(s).

Implements docs/PHASE3_TEAM_VISIBILITY_PLAN.md's "Identity / person
resolution" section: `auth.users` (email-scoped) is separate from `person`
(role-scoped); `auth_person` links them. Login always resolves to a
**coach** persona -- athlete `person` rows are data, never logins (minors
do not authenticate), so athlete rows are excluded here even if a shared
PitZone email happens to link the same `auth_user_id` to both a coach and
an athlete `person` row (the documented shared-family-email case).

`resolve_personas` runs its query through the SAME RLS-enforcing connection
(app.db.rls_connection) any other request-scoped query uses -- it relies on
0002_rls.sql's `person_select` policy, whose `id in (select
app_caller_person_ids())` clause already limits results to the caller's own
person row(s), so this function's `role in (...)` filter narrows further
(excludes an athlete row) rather than being the only thing standing between
a caller and someone else's persona.
"""

from __future__ import annotations

from dataclasses import dataclass

import psycopg

# Athlete rows are deliberately excluded -- athletes never log in (see
# module docstring). Every other role can carry a login.
COACH_ROLES = ("head_coach", "team_director", "coach", "league_staff")


@dataclass(frozen=True)
class Persona:
    """One coach `person` row reachable from a given Supabase auth `sub`."""

    person_id: str
    role: str
    team_id: str
    ride_group_id: str | None
    name: str


class NoPersonaError(Exception):
    """Raised when a `sub` resolves to zero coach personas -- a verified
    Supabase login with no matching coach `person` row (not yet
    provisioned, or genuinely not a coach). 403-worthy: the caller is
    authenticated but not authorized for anything in this app yet."""


class MultiplePersonasError(Exception):
    """Raised when a `sub` resolves to more than one coach persona (rare --
    e.g. a traveling Team Director on two teams, per the plan doc's
    resolved "multi-team coaches" question). Carries the full list so the
    caller (a route handler) can present a "which hat" picker rather than
    silently guessing which persona to act as."""

    def __init__(self, personas: list[Persona]) -> None:
        super().__init__(f"{len(personas)} coach personas found for this auth user")
        self.personas = personas


def resolve_personas(conn: psycopg.Connection, sub: str) -> list[Persona]:
    """Every coach `person` row linked to `sub` via `auth_person`. Empty
    list if `sub` has no `auth_person` row at all, or is linked only to
    non-coach (athlete) `person` row(s). Ordered by name for stable,
    deterministic output (matters for the "which hat" picker UI)."""
    rows = conn.execute(
        """
        select p.id, p.role, p.team_id, p.ride_group_id, p.name
        from auth_person ap
        join person p on p.id = ap.person_id
        where ap.auth_user_id = %s
          and p.role = any(%s)
        order by p.name
        """,
        (sub, list(COACH_ROLES)),
    ).fetchall()
    return [
        Persona(
            person_id=str(row[0]),
            role=row[1],
            team_id=str(row[2]),
            ride_group_id=str(row[3]) if row[3] is not None else None,
            name=row[4],
        )
        for row in rows
    ]


def select_persona(personas: list[Persona]) -> Persona:
    """Applies the "0 / 1 / >1" rule from docs/PHASE3_1_AUTH_HEADSTART.md:
    0 -> raise NoPersonaError, 1 -> that one, >1 -> raise
    MultiplePersonasError carrying the list."""
    if not personas:
        raise NoPersonaError("no coach persona found for this auth user")
    if len(personas) > 1:
        raise MultiplePersonasError(personas)
    return personas[0]

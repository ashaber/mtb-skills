"""HC/TD bulk roster import -- `person` + `ride_group` upsert from
already-parsed rows (POST /api/roster/import, app/routes.py).

Scope: this module is pure merge/upsert logic given an OPEN
`app.db.rls_connection` and the caller's own `team_id` -- it does not parse
a CSV or fetch a Google Sheet itself (that's a separate, later frontend
workstream per CLAUDE.md's Phase 2b section; the client here has already
turned a sheet/CSV into `RosterRowIn` rows). It also does not authenticate
or authorize anything itself -- `team_id` is trusted as already having been
derived from the caller's own HC/TD persona by app/routes.py, and every
write below runs through the SAME `rls_connection` the caller's request
opened, so Postgres RLS (supabase/migrations/0002_rls.sql's `person_
insert`/`person_update`/`ride_group_insert` policies, all HC/TD-and-own-
team-only) is what actually backstops that trust -- not application logic
in this file. If `team_id` were ever wrong (a bug upstream), these INSERT/
UPDATE statements would simply fail under RLS rather than silently writing
to the wrong team.

Rows never carry their own `team_id` (see app/schemas.py's RosterRowIn
docstring) -- there is deliberately no vector for a row to target a
different team than the caller's own, even though RLS would deny it anyway
if there were.

Merge key priority, scoped to `team_id`, tried in order until one matches:
    1. `external_id` (exact)
    2. `email` (case-insensitive)
    3. `name` (case-insensitive)
A match -> UPDATE (name, role, email, ride_group_id, external_id) on the
existing row. No match -> INSERT a new `person` row.

`ride_group` values are resolved/created up front (case-insensitive match
by (team_id, name); INSERT if absent -- there is no unique constraint on
ride_group(team_id, name), so this is a plain SELECT-then-INSERT, not an
`ON CONFLICT`; see supabase/migrations/0005_person_email.sql's own note on
why `person` similarly has no unique email constraint to conflict against).

Idempotent: re-running the exact same rows produces the same person/
ride_group rows updated in place -- zero new inserts, matched by whichever
merge key the row provides.
"""

from __future__ import annotations

import uuid
from typing import Any

import psycopg

from app.logging import get_logger
from app.schemas import RosterRowIn

log = get_logger("app.roster")


def _find_or_create_ride_group(conn: psycopg.Connection, team_id: uuid.UUID, name: str) -> tuple[uuid.UUID, bool]:
    """`(ride_group_id, created)` for a ride group named `name` on
    `team_id` -- case-insensitive match against an existing row, INSERT if
    none exists. `name` must already be stripped/non-blank (callers only
    invoke this for a row that actually specified a ride group)."""
    existing = conn.execute(
        "select id from ride_group where team_id = %s and lower(name) = lower(%s)",
        (team_id, name),
    ).fetchone()
    if existing is not None:
        return existing[0], False

    new_id = uuid.uuid4()
    conn.execute(
        "insert into ride_group (id, team_id, name) values (%s, %s, %s)",
        (new_id, team_id, name),
    )
    return new_id, True


def _find_matching_person(conn: psycopg.Connection, team_id: uuid.UUID, row: RosterRowIn) -> uuid.UUID | None:
    """The existing `person.id` this row merges into, if any, per the
    module docstring's external_id -> email -> name priority. Each strategy
    is only tried if the row actually provides that field; the first hit
    wins."""
    if row.external_id:
        match = conn.execute(
            "select id from person where team_id = %s and external_id = %s",
            (team_id, row.external_id),
        ).fetchone()
        if match is not None:
            return match[0]

    if row.email:
        match = conn.execute(
            "select id from person where team_id = %s and lower(email) = lower(%s)",
            (team_id, row.email),
        ).fetchone()
        if match is not None:
            return match[0]

    match = conn.execute(
        "select id from person where team_id = %s and lower(name) = lower(%s)",
        (team_id, row.name),
    ).fetchone()
    if match is not None:
        return match[0]

    return None


def import_roster(conn: psycopg.Connection, team_id: uuid.UUID, rows: list[RosterRowIn]) -> dict[str, Any]:
    """Merge `rows` into `person`/`ride_group` on `team_id`, through the
    already-open (caller-scoped) `conn`. Returns a summary dict:
    `{"people_created", "people_updated", "groups_created", "skipped"}`,
    where `skipped` is a list of `{"name", "reason"}` for any row that
    couldn't be written (kept simple -- `RosterRowIn` validation already
    rejects a blank name at the request boundary, so a skip here would only
    ever come from a future case this function doesn't yet handle)."""
    people_created = 0
    people_updated = 0
    groups_created = 0
    skipped: list[dict[str, str]] = []

    # Resolve/create every unique ride group referenced by the rows FIRST,
    # so the person upsert loop below just looks up an id from this map --
    # avoids creating the same group twice for two rows that name it.
    group_ids_by_name: dict[str, uuid.UUID] = {}
    for row in rows:
        if not row.ride_group:
            continue
        key = row.ride_group.lower()
        if key in group_ids_by_name:
            continue
        group_id, created = _find_or_create_ride_group(conn, team_id, row.ride_group)
        group_ids_by_name[key] = group_id
        if created:
            groups_created += 1

    for row in rows:
        if not row.name:
            # Unreachable in practice -- RosterRowIn._name_non_blank already
            # rejects a blank name at the request boundary -- kept as a
            # defensive, simple skip rather than trusting that invariant
            # blindly.
            skipped.append({"name": row.name or "", "reason": "missing name"})
            continue

        ride_group_id = group_ids_by_name.get(row.ride_group.lower()) if row.ride_group else None

        matched_id = _find_matching_person(conn, team_id, row)

        if matched_id is not None:
            conn.execute(
                """
                update person
                set name = %s, role = %s, email = %s, ride_group_id = %s, external_id = %s
                where id = %s
                """,
                (row.name, row.role, row.email, ride_group_id, row.external_id, matched_id),
            )
            people_updated += 1
        else:
            conn.execute(
                """
                insert into person (id, team_id, ride_group_id, role, name, email, external_id)
                values (%s, %s, %s, %s, %s, %s, %s)
                """,
                (uuid.uuid4(), team_id, ride_group_id, row.role, row.name, row.email, row.external_id),
            )
            people_created += 1

    log.info(
        "roster.import",
        team_id=str(team_id),
        people_created=people_created,
        people_updated=people_updated,
        groups_created=groups_created,
        skipped=len(skipped),
    )

    return {
        "people_created": people_created,
        "people_updated": people_updated,
        "groups_created": groups_created,
        "skipped": skipped,
    }

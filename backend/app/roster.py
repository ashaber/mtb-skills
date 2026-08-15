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

Merge key priority, scoped to `team_id` (see `_find_matching_person` for
the full rationale -- real PitZone rosters collide hard on both email and
name, so this is deliberately conservative):
    1. `external_id` (exact) -- the only truly unique key.
    2. `email` AND `name` together (case-insensitive) -- email alone is a
       FAMILY identifier in PitZone (parent-coach and athlete share it), and
       names collide across different people, so BOTH must agree.
    3. `name` (case-insensitive) ONLY when neither the row nor the candidate
       has an email.
A match -> UPDATE (name, role, email, ride_group_id, external_id, grade,
category, tags) on the existing row. No match -> INSERT a new `person` row.
`tags` (supabase/migrations/0007_person_tags.sql) is carried straight
through on both paths -- a re-import REPLACES the existing tag list with
whatever the row specifies (not a merge/append), same last-write-wins
posture as every other re-importable field here.

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
    # Insert-or-get against the (team_id, lower(name)) unique index
    # (supabase/migrations/0009_ride_group_unique_name.sql). `on conflict do
    # nothing returning` yields the new id only when THIS call created the
    # row; on a conflict it returns no row and we read the existing id back.
    # This is race-safe (two concurrent imports can't both create "Droid")
    # AND guarantees a team can never accumulate duplicate groups -- the
    # split-brain that made a ride-group coach unable to see athletes filed
    # under a second same-named group.
    created = conn.execute(
        """
        insert into ride_group (id, team_id, name)
        values (%s, %s, %s)
        on conflict (team_id, lower(name)) do nothing
        returning id
        """,
        (uuid.uuid4(), team_id, name),
    ).fetchone()
    if created is not None:
        return created[0], True

    existing = conn.execute(
        "select id from ride_group where team_id = %s and lower(name) = lower(%s)",
        (team_id, name),
    ).fetchone()
    return existing[0], False


def _find_matching_person(conn: psycopg.Connection, team_id: uuid.UUID, row: RosterRowIn) -> uuid.UUID | None:
    """The existing `person.id` this row merges into, if any.

    Merge is deliberately conservative because real PitZone rosters collide
    hard on both email and name (see the module docstring):

    1. `external_id` exact -- the only truly unique key (a future PitZone/
       NICA GUID, or our OWN person id round-tripped back in via an export).
    2. `email` AND `name` together (case-insensitive). Email alone is a
       FAMILY-level identifier in PitZone -- a parent-coach and their athlete
       routinely share one email -- so a lone-email match would collapse two
       different people into one; requiring the name too keeps them distinct.
       The converse also holds: two different people who happen to share a
       name have different emails, so pairing the two fields likewise avoids
       the same-name collapse. If the row HAS an email but no (email, name)
       twin exists, we deliberately do NOT fall through to a name-only match
       -- a name-only hit at that point is almost always a DIFFERENT person
       who merely shares the name (rampant in sanitized/real rosters alike),
       so the row is treated as a new person instead.
    3. Only when the row has NO email do we fall back to a name match, and
       even then only against a candidate that ALSO has no email -- we won't
       overwrite a row that carries a distinct email on the strength of a
       shared name alone.
    Anything else -> None (a new person).
    """
    if row.external_id:
        match = conn.execute(
            "select id from person where team_id = %s and external_id = %s",
            (team_id, row.external_id),
        ).fetchone()
        if match is not None:
            return match[0]

    if row.email:
        match = conn.execute(
            "select id from person where team_id = %s and lower(email) = lower(%s) and lower(name) = lower(%s)",
            (team_id, row.email, row.name),
        ).fetchone()
        if match is not None:
            return match[0]
        # Row has an email but no (email, name) twin -> NOT the same person as
        # a mere name-share; fall through to a new insert rather than a
        # name-only merge.
        return None

    # No email on the row -> name fallback, but only against an equally
    # email-less candidate.
    match = conn.execute(
        "select id from person where team_id = %s and lower(name) = lower(%s) and email is null",
        (team_id, row.name),
    ).fetchone()
    if match is not None:
        return match[0]

    return None


class RosterImportRowDenied(Exception):
    """Raised when RLS denies writing one specific row mid-batch, carrying
    enough context (1-indexed position within this request's rows, and the
    row's own name) for app/routes.py to build an actionable error instead
    of surfacing the bare Postgres RLS string.

    The single most common real-world cause (DEFECTS.md D32): the
    importing coach's own row is in the file, matches their existing
    `person` row, and its `role` cell doesn't parse to an HC/TD role --
    silently demoting them mid-transaction. `app_caller_hc_team_ids()`
    (the RLS helper every write below is gated on) is `STABLE`, which
    re-evaluates per-STATEMENT, not once per transaction -- so from that
    row onward the caller genuinely has no HC/TD standing as far as RLS is
    concerned, and every following row fails the exact same way. Whatever
    the actual cause, `row_index`/`row_name` are enough to tell the coach
    which row to look at rather than a generic "access denied"."""

    def __init__(self, row_index: int, row_name: str) -> None:
        self.row_index = row_index
        self.row_name = row_name
        super().__init__(f"row {row_index} ({row_name}) denied by RLS")


def import_roster(conn: psycopg.Connection, team_id: uuid.UUID, rows: list[RosterRowIn]) -> dict[str, Any]:
    """Merge `rows` into `person`/`ride_group` on `team_id`, through the
    already-open (caller-scoped) `conn`. Returns a summary dict:
    `{"people_created", "people_updated", "groups_created", "skipped"}`,
    where `skipped` is a list of `{"name", "reason"}` for any row that
    couldn't be written (kept simple -- `RosterRowIn` validation already
    rejects a blank name at the request boundary, so a skip here would only
    ever come from a future case this function doesn't yet handle).

    Raises `RosterImportRowDenied` (not the bare `psycopg.errors.
    InsufficientPrivilege`) if RLS denies a specific person-row write --
    `row_index` is this row's 1-indexed position within `rows` as submitted
    (i.e. after the client already dropped any blank-name rows), not
    necessarily the literal row number in the coach's original spreadsheet
    -- close enough, paired with `row_name`, for a coach to find the row."""
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

    for row_index, row in enumerate(rows, start=1):
        if not row.name:
            # Unreachable in practice -- RosterRowIn._name_non_blank already
            # rejects a blank name at the request boundary -- kept as a
            # defensive, simple skip rather than trusting that invariant
            # blindly.
            skipped.append({"name": row.name or "", "reason": "missing name"})
            continue

        ride_group_id = group_ids_by_name.get(row.ride_group.lower()) if row.ride_group else None

        matched_id = _find_matching_person(conn, team_id, row)

        try:
            if matched_id is not None:
                conn.execute(
                    """
                    update person
                    set name = %s, role = %s, email = %s, ride_group_id = %s, external_id = %s,
                        grade = %s, category = %s, tags = %s
                    where id = %s
                    """,
                    (
                        row.name,
                        row.role,
                        row.email,
                        ride_group_id,
                        row.external_id,
                        row.grade,
                        row.category,
                        row.tags,
                        matched_id,
                    ),
                )
                people_updated += 1
            else:
                conn.execute(
                    """
                    insert into person
                        (id, team_id, ride_group_id, role, name, email, external_id, grade, category, tags)
                    values (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                    """,
                    (
                        uuid.uuid4(),
                        team_id,
                        ride_group_id,
                        row.role,
                        row.name,
                        row.email,
                        row.external_id,
                        row.grade,
                        row.category,
                        row.tags,
                    ),
                )
                people_created += 1
        except psycopg.errors.InsufficientPrivilege as exc:
            raise RosterImportRowDenied(row_index, row.name) from exc

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

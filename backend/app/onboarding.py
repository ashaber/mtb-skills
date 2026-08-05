"""First-login onboarding bootstrap -- `sub` + verified `email` -> new
`auth_person` link(s) (docs/PHASE3_1_ONBOARDING.md).

On a coach's first Google sign-in, Supabase has created an `auth.users` row
(and this backend has verified the resulting session JWT -- see
app.auth.verify_supabase_jwt) but there is, as yet, no `auth_person` row
connecting that `sub` to any coach `person` row, so `app.identity.
resolve_personas` returns empty and the caller would otherwise be stuck at a
permanent 403. Design: a coach `person` row's `email` IS the
pre-authorization -- "this email may sign in as this coach." This module is
the ONLY place that pre-authorization is redeemed into an actual
`auth_person` link.

Security-critical: this module is the ONLY caller of
`app.db.service_connection` (the deliberate RLS bypass -- read its docstring
before touching anything here). Every query in this file matches on the
caller's own ALREADY-VERIFIED JWT `email` claim (never a client-supplied,
unverified value), and the coach-role filter below is what stops a coach and
an athlete who share a family PitZone email (docs/PHASE3_TEAM_VISIBILITY_
PLAN.md's identity notes) from both being linkable by the same login --
athlete rows must NEVER be linked to an auth_user_id; athletes do not log in
(app.identity.COACH_ROLES / module docstring makes the same exclusion for
read/resolve; this is the write-side mirror of that rule).
"""

from __future__ import annotations

import uuid

from app.db import service_connection
from app.identity import COACH_ROLES
from app.logging import get_logger

log = get_logger("app.onboarding")


def bootstrap_link(database_url: str, sub: str, email: str | None) -> int:
    """Link Supabase auth user `sub` to every not-yet-linked COACH `person`
    row whose `email` case-insensitively matches `email`. Returns the number
    of NEW `auth_person` rows created (0 if `email` is falsy, if no coach
    `person` row matches, or if every matching coach is already linked).

    Deliberately excludes athlete `person` rows even when their `email`
    matches -- the shared-family-email case (a parent coach and their
    student athlete can carry the same PitZone email) must never let a
    login link an athlete persona. `role in COACH_ROLES` is the same
    allowlist app.identity.resolve_personas reads with, applied here on the
    write side.

    `sub` and `email` MUST already be verified (email is expected to be the
    `email` claim of a JWT that has already passed
    app.auth.verify_supabase_jwt) -- this function performs no verification
    of its own and trusts both inputs as given.
    """
    if not email:
        return 0

    with service_connection(database_url) as conn:
        rows = conn.execute(
            """
            select p.id
            from person p
            where lower(p.email) = lower(%s)
              and p.role = any(%s)
              and not exists (
                  select 1 from auth_person ap
                  where ap.auth_user_id = %s and ap.person_id = p.id
              )
            """,
            (email, list(COACH_ROLES), sub),
        ).fetchall()

        person_ids: list[uuid.UUID] = [row[0] for row in rows]

        for person_id in person_ids:
            conn.execute(
                """
                insert into auth_person (auth_user_id, person_id)
                values (%s, %s)
                on conflict do nothing
                """,
                (sub, person_id),
            )

    linked = len(person_ids)
    # Never log the raw email (global standard: no PII in logs) -- only the
    # count of links created and the (already-verified, but still an
    # internal identifier, not PII on its own) sub.
    log.info("onboarding.bootstrap_link", sub=sub, links_created=linked)
    return linked

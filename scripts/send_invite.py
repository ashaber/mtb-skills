#!/usr/bin/env python3
"""Send a magic-link (email OTP) sign-in email to a coach who was seeded
directly into the database (IDEA-031's "invite" half, not the self-serve
half -- see src/auth.js's signInWithMagicLink() for the coach-initiated
version of the same flow).

WHY THIS IS A SCRIPT, NOT AN API ENDPOINT
------------------------------------------
There is no "admin" role anywhere in this app's identity model
(backend/app/identity.py's COACH_ROLES only covers coach personas, no
elevated tier above head_coach/team_director) and no existing single-coach-
creation endpoint (only bulk CSV import and this app's own onboarding flow
create person rows with an email). Adding a new web-reachable "send an
arbitrary email an auth link" endpoint would be new authz surface this app
hasn't designed for. So instead: this runs on Andrew's own machine right
after he seeds (or someone else seeds) a coach's `person` row directly in
Postgres -- the same "trusted operator with direct DB access" model
scripts/engagement_report.py documents for its own read-only case.

WHY THE PUBLIC OTP ENDPOINT, NOT THE SUPABASE ADMIN API
----------------------------------------------------------
Supabase's Admin `inviteUserByEmail` API requires the service-role key and
sends a DIFFERENT email template/flow than self-serve sign-in. This script
deliberately calls the exact same public endpoint
(`POST {SUPABASE_URL}/auth/v1/otp`) that src/auth.js's signInWithMagicLink()
calls from the browser -- same email, same flow, same experience, whether
the coach requests it themselves or Andrew triggers it for them. That only
needs the ANON key (already public -- it ships in the deployed frontend
bundle), not the service-role key, so this script carries no new secret-
handling surface at all.

SAFETY CHECK
------------
Before sending, looks up the target email in Postgres and confirms a
`person` row exists with that email (case-insensitive) and a role in
COACH_ROLES (backend/app/identity.py -- imported directly, not duplicated,
so this script can never drift out of sync with the app's own role list).
Catches a typo'd email before it burns a send against Supabase's rate
limit. Pass --force to skip this and send anyway (e.g. before the person
row exists yet).

USAGE
-----
    DATABASE_URL='postgresql://postgres:<pw>@<host>:5432/postgres' \\
    SUPABASE_URL='https://<project>.supabase.co' \\
    SUPABASE_ANON_KEY='<anon key>' \\
        python scripts/send_invite.py coach@example.com

    # Skip the DB safety check (send regardless of what's in person today)
    ... python scripts/send_invite.py coach@example.com --force

DELIVERABILITY NOTE
--------------------
Until custom SMTP is configured in the Supabase dashboard (Project
Settings -> Auth -> SMTP Settings), this sends from Supabase's own shared,
rate-limited, often-spam-flagged sending domain -- tell the coach to check
spam. No code change is needed when custom SMTP is configured later: this
script and the frontend's self-serve button both call the same Supabase
endpoint, which starts sending through the new SMTP automatically.
"""

from __future__ import annotations

import argparse
import json
import os
import sys
import urllib.error
import urllib.request
from pathlib import Path

import psycopg

BACKEND_DIR = Path(__file__).resolve().parents[1] / "backend"
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from app.identity import COACH_ROLES  # noqa: E402 -- must follow the sys.path insert above


def _require_env(name: str) -> str:
    """Fail fast (CLAUDE.md's "fail fast on startup if required env vars
    are missing") rather than a confusing error further down."""
    value = os.environ.get(name, "").strip()
    if not value:
        raise SystemExit(
            f"{name} environment variable is required -- see this script's "
            "module docstring for usage."
        )
    return value


def find_matching_coach(database_url: str, email: str) -> tuple[str, str] | None:
    """Returns (person_id, role) for the first COACH_ROLES person row whose
    email case-insensitively matches, or None if none exists. Read-only,
    plain connection (same RLS-bypass-as-table-owner model
    scripts/engagement_report.py's connect() uses)."""
    with psycopg.connect(database_url, autocommit=True) as conn:
        row = conn.execute(
            "select id, role from person where lower(email) = lower(%s) and role = any(%s) limit 1",
            (email, list(COACH_ROLES)),
        ).fetchone()
    return (str(row[0]), row[1]) if row else None


def send_magic_link(supabase_url: str, anon_key: str, email: str) -> None:
    """POSTs to Supabase's public OTP endpoint -- the same one
    src/auth.js's signInWithMagicLink() calls from the browser. Raises
    urllib.error.HTTPError on a non-2xx response."""
    body = json.dumps({"email": email, "create_user": True}).encode("utf-8")
    req = urllib.request.Request(
        f"{supabase_url.rstrip('/')}/auth/v1/otp",
        data=body,
        method="POST",
        headers={
            "Content-Type": "application/json",
            "apikey": anon_key,
        },
    )
    with urllib.request.urlopen(req, timeout=15) as resp:
        resp.read()


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.split("\n\n")[0] if __doc__ else "")
    parser.add_argument("email", help="Email address to send the sign-in link to")
    parser.add_argument(
        "--force",
        action="store_true",
        help="Skip the DB safety check and send even if no matching coach person row is found",
    )
    args = parser.parse_args(argv)

    supabase_url = _require_env("SUPABASE_URL")
    anon_key = _require_env("SUPABASE_ANON_KEY")

    if not args.force:
        database_url = _require_env("DATABASE_URL")
        try:
            match = find_matching_coach(database_url, args.email)
        except psycopg.Error as exc:
            print(f"error: could not read from database: {exc}", file=sys.stderr)
            return 1
        if not match:
            print(
                f"error: no coach person row found with email {args.email!r} "
                f"(role in {COACH_ROLES}). Check for a typo, or pass --force "
                "to send anyway.",
                file=sys.stderr,
            )
            return 1
        person_id, role = match
        print(f"found matching {role} (person {person_id}) -- sending invite")

    try:
        send_magic_link(supabase_url, anon_key, args.email)
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="replace")
        print(f"error: Supabase rejected the request ({exc.code}): {detail}", file=sys.stderr)
        return 1
    except urllib.error.URLError as exc:
        print(f"error: could not reach Supabase: {exc}", file=sys.stderr)
        return 1

    print(f"sign-in link sent to {args.email} -- tell them to check spam until custom SMTP is configured")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

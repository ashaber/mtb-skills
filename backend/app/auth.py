"""Supabase JWT verification (HS256).

Phase 3.1's fork-independent auth core (docs/PHASE3_1_AUTH_HEADSTART.md):
regardless of whether the frontend talks to Supabase directly or through
this FastAPI backend (the architecture fork noted in that doc), any request
this backend DOES handle on a coach's behalf must first prove the caller is
who they claim to be. That proof is a Supabase Auth session JWT -- this
module verifies its signature and expiry and hands back the claims dict,
nothing more. It does NOT resolve a `sub` to a coach persona (see
app/identity.py for that) and does NOT open a DB connection (see app/db.py).

Supabase mints session JWTs signed with the project's JWT secret (HS256) and
always sets `sub` to the `auth.users.id` (a uuid) and `role` to
`authenticated` (or `anon`/`service_role`); `email` is present for most
identity providers (including Google OAuth) but is not guaranteed by every
auth method, so it's read out only if present.
"""

from __future__ import annotations

from typing import Any

import jwt


class AuthError(Exception):
    """Raised when a bearer token fails verification for any reason
    (bad signature, expired, malformed, missing required claims). Callers
    (route handlers / FastAPI dependencies) catch this and turn it into a
    401 JSON response -- this module itself raises no HTTP exceptions, to
    keep it usable outside a request context (e.g. app/db.py's session
    helper, background jobs)."""


def verify_supabase_jwt(token: str, secret: str) -> dict[str, Any]:
    """Verify a Supabase-issued HS256 JWT and return its claims.

    Checks the signature (against `secret` -- the project's Supabase JWT
    secret, `Settings.supabase_jwt_secret`) and expiry (`exp`). Requires a
    `sub` claim (the Supabase `auth.users.id`) to be present and non-empty;
    every other claim (including `email`) is optional and passed through
    as-is.

    Raises `AuthError` -- never a bare/unhandled exception -- on any
    failure: bad signature, expired token, malformed token, or a missing/
    empty `sub`.
    """
    if not token:
        raise AuthError("empty token")

    try:
        claims: dict[str, Any] = jwt.decode(
            token,
            secret,
            algorithms=["HS256"],
            # Supabase JWTs carry an `aud` of "authenticated" (or
            # "anon"/"service_role"), but this backend has no fixed
            # audience to check it against here -- role/scope enforcement
            # happens via RLS (app/db.py), not via `aud`. Signature + expiry
            # are the properties this function is responsible for.
            options={"require": ["exp"], "verify_aud": False},
        )
    except jwt.ExpiredSignatureError as exc:
        raise AuthError("token expired") from exc
    except jwt.InvalidTokenError as exc:
        raise AuthError(f"invalid token: {exc}") from exc

    sub = claims.get("sub")
    if not sub:
        raise AuthError("token missing required 'sub' claim")

    return claims

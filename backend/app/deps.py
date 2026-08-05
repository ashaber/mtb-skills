"""FastAPI auth dependency: `Authorization: Bearer <supabase-jwt>` -> a
verified caller identity, expressed as coach persona(s).

This is the ONE place route handlers get an authenticated caller from. It
composes the three already-verified building blocks (docs/PHASE3_1_AUTH_
HEADSTART.md's fork-independent core, all reused unmodified here):

    1. app.auth.verify_supabase_jwt -- proves the bearer token is a
       genuine, unexpired Supabase session JWT and hands back its claims.
    2. app.db.rls_connection -- opens a DB session scoped to that JWT's
       `sub`, so every query below (and everything a route handler does
       afterward with the SAME caller) is subject to the exact RLS a
       direct Supabase PostgREST call would enforce.
    3. app.identity.resolve_personas -- resolves `sub` -> the coach
       `person` row(s) reachable from it (empty if `sub` isn't a coach at
       all, e.g. a verified-but-unprovisioned login or an athlete-only
       auth link).

Route handlers depend on `get_caller` (never call verify_supabase_jwt /
resolve_personas themselves) and get back a `Caller`, then open their OWN
`rls_connection(settings.database_url, caller.sub)` for the actual data
query -- `get_caller`'s own connection is closed by the time the route
handler runs (see `rls_connection`'s docstring: the `with` block commits/
closes on exit), it exists only to resolve personas.
"""

from __future__ import annotations

from dataclasses import dataclass

from fastapi import HTTPException, Request

from app.auth import AuthError, verify_supabase_jwt
from app.config import Settings
from app.db import rls_connection
from app.identity import Persona, resolve_personas
from app.logging import get_logger

log = get_logger("app.deps")


@dataclass(frozen=True)
class Caller:
    """The authenticated caller of the current request: the verified
    Supabase `sub` plus every coach persona it resolves to. Pilot is
    one-team-per-coach, so `personas` is almost always length 1 -- but the
    schema (auth_person is many-to-many) allows more, so callers that care
    (route handlers deriving a write's attributing coach) must not assume
    length 1.
    """

    sub: str
    personas: list[Persona]


def get_settings_dep(request: Request) -> Settings:
    """The process-wide `Settings` built once by `create_app()` and stashed
    on `app.state` -- NOT `app.config.get_settings()`'s own `lru_cache`,
    which can go stale across `tests/api/conftest.py`'s per-test
    `importlib.reload(app.main)` (a fresh `Settings` is built on every
    reload; the module-level `lru_cache` on `app.config.get_settings` is
    not). Reading off `request.app.state` always reflects the actual
    running app instance handling this request.
    """
    return request.app.state.settings


def get_caller(request: Request) -> Caller:
    """Extract, verify, and resolve the caller of `request`.

    401 (missing/malformed `Authorization` header, or a token that fails
    `verify_supabase_jwt` -- bad signature, expired, malformed, missing
    `sub`). 403 (`{"error": "not a recognized coach"}`) when the token is a
    genuine Supabase session but resolves to zero coach personas.

    # TODO 3.x: X-Persona-Id for multi-team coaches. The pilot is
    # one-team-per-coach, so this dependency does not force a "which hat"
    # selection when `resolve_personas` returns more than one persona --
    # it just hands the whole list back on `Caller.personas` (surfaced
    # unfiltered via GET /api/me). Write endpoints derive the attributing
    # persona themselves (from the target athlete's ride group) rather
    # than requiring the caller to pick one up front. A future increment
    # adding a real multi-team "which hat" picker should require an
    # `X-Persona-Id` header here once ambiguity needs resolving earlier.
    """
    auth_header = request.headers.get("Authorization")
    if not auth_header or not auth_header.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="missing or malformed Authorization header")

    token = auth_header[len("Bearer ") :].strip()
    if not token:
        raise HTTPException(status_code=401, detail="missing bearer token")

    settings = get_settings_dep(request)

    try:
        claims = verify_supabase_jwt(
            token,
            jwks_url=settings.jwks_url,
            hs256_secret=settings.supabase_jwt_secret or None,
        )
    except AuthError as exc:
        log.warn("auth.token_invalid", error=str(exc))
        raise HTTPException(status_code=401, detail="invalid or expired token") from exc

    sub = str(claims["sub"])

    with rls_connection(settings.database_url, sub) as conn:
        personas = resolve_personas(conn, sub)

    if not personas:
        log.warn("auth.no_persona", sub=sub)
        raise HTTPException(status_code=403, detail="not a recognized coach")

    return Caller(sub=sub, personas=personas)

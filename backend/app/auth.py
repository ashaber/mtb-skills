"""Supabase JWT verification (asymmetric JWKS + legacy HS256).

Phase 3.1's fork-independent auth core (docs/PHASE3_1_AUTH_HEADSTART.md):
regardless of whether the frontend talks to Supabase directly or through
this FastAPI backend (the architecture fork noted in that doc), any request
this backend DOES handle on a coach's behalf must first prove the caller is
who they claim to be. That proof is a Supabase Auth session JWT -- this
module verifies its signature and expiry and hands back the claims dict,
nothing more. It does NOT resolve a `sub` to a coach persona (see
app/identity.py for that) and does NOT open a DB connection (see app/db.py).

Supabase signs session JWTs one of two ways:
- **Asymmetric (ES256/RS256)** -- the default for new projects. Verified
  against the project's published JWKS (public keys), fetched from
  `{supabase_url}/auth/v1/.well-known/jwks.json` (see Settings.jwks_url) and
  cached. This is the path production uses.
- **Legacy HS256** -- older projects with a shared JWT secret. Verified with
  that secret when configured (Settings.supabase_jwt_secret).

The token's own `alg` header selects the path. Supabase always sets `sub` to
the `auth.users.id` (a uuid); `email` is present for Google OAuth but not
guaranteed by every provider, so it's read out only if present downstream.
"""

from __future__ import annotations

from functools import lru_cache
from typing import Any

import jwt
from jwt import PyJWKClient

_ASYMMETRIC_ALGS = ("ES256", "RS256")
_DECODE_OPTIONS = {"require": ["exp"], "verify_aud": False}


class AuthError(Exception):
    """Raised when a bearer token fails verification for any reason
    (bad signature, expired, malformed, missing required claims, or the
    signing key couldn't be resolved). Callers (route handlers / FastAPI
    dependencies) catch this and turn it into a 401 JSON response -- this
    module itself raises no HTTP exceptions, to keep it usable outside a
    request context (e.g. app/db.py's session helper, background jobs)."""


@lru_cache(maxsize=8)
def _jwk_client(jwks_url: str) -> PyJWKClient:
    """One cached PyJWKClient per JWKS URL. PyJWKClient caches the fetched
    key set internally (default ~5 min lifespan), so verification does not
    hit the network on every request."""
    return PyJWKClient(jwks_url, cache_keys=True)


def verify_supabase_jwt(
    token: str,
    *,
    jwks_url: str | None = None,
    hs256_secret: str | None = None,
) -> dict[str, Any]:
    """Verify a Supabase-issued session JWT and return its claims.

    The token's `alg` header picks the verification path: `HS256` uses
    `hs256_secret` (legacy shared secret); `ES256`/`RS256` fetch the project's
    public key from `jwks_url` (Settings.jwks_url). Checks signature + expiry
    (`exp`) and requires a non-empty `sub` (the Supabase `auth.users.id`);
    all other claims (including `email`) pass through as-is.

    Raises `AuthError` -- never a bare/unhandled exception -- on any failure:
    bad signature, expired/malformed token, unsupported alg, a missing signing
    key/JWKS fetch failure, or a missing/empty `sub`.
    """
    if not token:
        raise AuthError("empty token")

    try:
        alg = jwt.get_unverified_header(token).get("alg")
    except jwt.InvalidTokenError as exc:
        raise AuthError(f"invalid token header: {exc}") from exc

    try:
        if alg == "HS256":
            if not hs256_secret:
                raise AuthError("token is HS256 but no JWT secret is configured")
            claims: dict[str, Any] = jwt.decode(token, hs256_secret, algorithms=["HS256"], options=_DECODE_OPTIONS)
        elif alg in _ASYMMETRIC_ALGS:
            if not jwks_url:
                raise AuthError(f"token is {alg} but no JWKS url is configured")
            signing_key = _jwk_client(jwks_url).get_signing_key_from_jwt(token)
            claims = jwt.decode(token, signing_key.key, algorithms=[alg], options=_DECODE_OPTIONS)
        else:
            raise AuthError(f"unsupported token alg: {alg!r}")
    except jwt.ExpiredSignatureError as exc:
        raise AuthError("token expired") from exc
    except jwt.PyJWKClientError as exc:
        # JWKS fetch / signing-key lookup failed (network, bad url, no
        # matching kid) -- an auth failure, not a 500.
        raise AuthError(f"could not resolve signing key: {exc}") from exc
    except jwt.InvalidTokenError as exc:
        raise AuthError(f"invalid token: {exc}") from exc

    sub = claims.get("sub")
    if not sub:
        raise AuthError("token missing required 'sub' claim")

    return claims

"""app.auth.verify_supabase_jwt -- unit tests.

Mints self-signed HS256 tokens with `pyjwt` using the same test secret the
function under test is called with, so no live Supabase project or network
call is needed. Mirrors the "unit (JWT verify with a self-signed token)"
target from docs/PHASE3_1_AUTH_HEADSTART.md.
"""

from __future__ import annotations

import time
import uuid
from typing import Any

import jwt
import pytest

from app.auth import AuthError, verify_supabase_jwt

SECRET = "unit-test-supabase-jwt-secret-at-least-32-bytes-long"


def _make_token(
    *,
    secret: str = SECRET,
    sub: str | None = "not-set",
    exp_delta: int = 3600,
    email: str | None = "coach@example.com",
    **extra: Any,
) -> str:
    """Builds a JWT payload close to what Supabase actually issues. Pass
    `sub=None` to omit the claim entirely (not just an empty string) --
    exercises the "missing sub" case distinctly from "empty sub"."""
    now = int(time.time())
    payload: dict[str, Any] = {"iat": now, "exp": now + exp_delta, "role": "authenticated"}
    if sub != "not-set":
        if sub is not None:
            payload["sub"] = sub
    else:
        payload["sub"] = str(uuid.uuid4())
    if email is not None:
        payload["email"] = email
    payload.update(extra)
    return jwt.encode(payload, secret, algorithm="HS256")


def test_verify_valid_token_returns_claims_including_sub_and_email() -> None:
    sub = str(uuid.uuid4())
    token = _make_token(sub=sub)

    claims = verify_supabase_jwt(token, SECRET)

    assert claims["sub"] == sub
    assert claims["email"] == "coach@example.com"
    assert claims["role"] == "authenticated"


def test_verify_valid_token_without_email_claim_still_succeeds() -> None:
    sub = str(uuid.uuid4())
    token = _make_token(sub=sub, email=None)

    claims = verify_supabase_jwt(token, SECRET)

    assert claims["sub"] == sub
    assert "email" not in claims


def test_verify_expired_token_raises_autherror() -> None:
    token = _make_token(sub=str(uuid.uuid4()), exp_delta=-10)

    with pytest.raises(AuthError, match="expired"):
        verify_supabase_jwt(token, SECRET)


def test_verify_wrong_secret_raises_autherror() -> None:
    token = _make_token(sub=str(uuid.uuid4()), secret="a-different-secret-also-at-least-32-bytes")

    with pytest.raises(AuthError):
        verify_supabase_jwt(token, SECRET)


def test_verify_missing_sub_claim_raises_autherror() -> None:
    token = _make_token(sub=None)

    with pytest.raises(AuthError, match="sub"):
        verify_supabase_jwt(token, SECRET)


def test_verify_empty_sub_claim_raises_autherror() -> None:
    token = _make_token(sub="")

    with pytest.raises(AuthError, match="sub"):
        verify_supabase_jwt(token, SECRET)


def test_verify_malformed_token_raises_autherror() -> None:
    with pytest.raises(AuthError):
        verify_supabase_jwt("not-a-jwt-at-all", SECRET)


def test_verify_empty_token_raises_autherror() -> None:
    with pytest.raises(AuthError):
        verify_supabase_jwt("", SECRET)

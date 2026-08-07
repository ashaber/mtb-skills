"""`/api/*` route tests -- no live Postgres (TestClient + monkeypatched
`app.deps` internals only). Covers:

  - every `/api/*` route requires a Bearer token (401 with no/blank/
    garbage token, before any DB access is attempted);
  - a verified-but-unrecognized caller (mocked `resolve_personas` -> [])
    gets 403, not a DB error;
  - request-body validation failures (bad skill/level/athlete_id) surface
    as 400 JSON errors (app/main.py's `RequestValidationError` handler),
    not FastAPI's default 422.

Live-Postgres, full-stack RLS-through-HTTP coverage (the crown-jewel proof
that a coach's token only reaches their own ride group) is
tests/backend/test_api_rls.py, not here -- this file is deliberately
DB-free so it runs in any CI job.
"""

from __future__ import annotations

import time
import uuid
from contextlib import contextmanager
from typing import Any, Iterator

import jwt
import pytest

from app.deps import Caller, get_caller
from app.identity import Persona

SUPABASE_JWT_SECRET = "ci-placeholder-jwt-secret"  # matches tests/api/conftest.py's PLACEHOLDER_ENV


def _make_token(*, secret: str = SUPABASE_JWT_SECRET, sub: str | None = "unset", exp_delta: int = 3600) -> str:
    now = int(time.time())
    payload: dict[str, Any] = {"iat": now, "exp": now + exp_delta}
    if sub == "unset":
        payload["sub"] = str(uuid.uuid4())
    elif sub is not None:
        payload["sub"] = sub
    return jwt.encode(payload, secret, algorithm="HS256")


@contextmanager
def _fake_rls_connection(database_url: str, sub: str) -> Iterator[None]:
    """Stand-in for app.db.rls_connection that never touches a real
    Postgres -- this file's tests only exercise the auth-dependency layer
    (401/403/validation), not actual queries, so `resolve_personas` (also
    monkeypatched per-test below) never needs a real connection object."""
    yield None


# --------------------------------------------------------------------------
# Every /api route requires a Bearer token.
# --------------------------------------------------------------------------

_VALID_OBSERVATION_BODY = {
    "athlete_id": str(uuid.uuid4()),
    "skill": "cornering",
    "level_observed": 3,
}
_VALID_CONFIRMED_LEVEL_BODY = {
    "athlete_id": str(uuid.uuid4()),
    "skill": "braking",
    "level": 4,
}
_VALID_PRACTICE_BODY: dict[str, Any] = {}
_VALID_ATTENDANCE_BODY = {
    "practice_id": str(uuid.uuid4()),
    "person_id": str(uuid.uuid4()),
    "status": "attending",
}

# (method, path, json body-or-None) for every mounted /api/* route. Bodies
# are valid-shaped where a body is required, so a missing-auth 401 can't be
# confused with a validation 400 regardless of FastAPI's internal ordering.
_API_ROUTES: list[tuple[str, str, dict[str, Any] | None]] = [
    ("GET", "/api/me", None),
    ("GET", "/api/observations", None),
    ("POST", "/api/observations", _VALID_OBSERVATION_BODY),
    ("GET", "/api/confirmed-levels", None),
    ("POST", "/api/confirmed-levels", _VALID_CONFIRMED_LEVEL_BODY),
    ("GET", "/api/roster", None),
    ("GET", "/api/practices", None),
    ("POST", "/api/practices", _VALID_PRACTICE_BODY),
    ("GET", "/api/attendance", None),
    ("POST", "/api/attendance", _VALID_ATTENDANCE_BODY),
]


@pytest.mark.parametrize("method,path,body", _API_ROUTES, ids=[f"{m} {p}" for m, p, _ in _API_ROUTES])
def test_route_requires_bearer_token_when_header_missing(client, method: str, path: str, body: dict | None) -> None:
    resp = client.request(method, path, json=body)
    assert resp.status_code == 401
    assert resp.json() == {"error": "missing or malformed Authorization header"}


@pytest.mark.parametrize("method,path,body", _API_ROUTES, ids=[f"{m} {p}" for m, p, _ in _API_ROUTES])
def test_route_requires_bearer_token_when_header_blank(client, method: str, path: str, body: dict | None) -> None:
    resp = client.request(method, path, json=body, headers={"Authorization": "Bearer "})
    assert resp.status_code == 401
    assert resp.json() == {"error": "missing bearer token"}


@pytest.mark.parametrize("method,path,body", _API_ROUTES, ids=[f"{m} {p}" for m, p, _ in _API_ROUTES])
def test_route_rejects_garbage_token(client, method: str, path: str, body: dict | None) -> None:
    resp = client.request(method, path, json=body, headers={"Authorization": "Bearer not-a-real-jwt"})
    assert resp.status_code == 401
    assert resp.json() == {"error": "invalid or expired token"}


def test_route_rejects_wrong_header_scheme(client) -> None:
    token = _make_token()
    resp = client.get("/api/me", headers={"Authorization": f"Basic {token}"})
    assert resp.status_code == 401


def test_route_rejects_expired_token(client) -> None:
    token = _make_token(exp_delta=-10)
    resp = client.get("/api/me", headers={"Authorization": f"Bearer {token}"})
    assert resp.status_code == 401
    assert resp.json() == {"error": "invalid or expired token"}


# --------------------------------------------------------------------------
# Verified token, zero coach personas -> 403 (not a DB error).
# --------------------------------------------------------------------------


def test_route_returns_403_when_caller_has_no_coach_persona(client, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr("app.deps.rls_connection", _fake_rls_connection)
    monkeypatch.setattr("app.deps.resolve_personas", lambda conn, sub: [])

    token = _make_token()
    resp = client.get("/api/me", headers={"Authorization": f"Bearer {token}"})

    assert resp.status_code == 403
    assert resp.json() == {"error": "not a recognized coach"}


def test_get_me_returns_resolved_personas_when_recognized(client, monkeypatch: pytest.MonkeyPatch) -> None:
    persona = Persona(
        person_id=str(uuid.uuid4()),
        role="coach",
        team_id=str(uuid.uuid4()),
        ride_group_id=str(uuid.uuid4()),
        name="Coach Test",
    )
    monkeypatch.setattr("app.deps.rls_connection", _fake_rls_connection)
    monkeypatch.setattr("app.deps.resolve_personas", lambda conn, sub: [persona])

    token = _make_token()
    resp = client.get("/api/me", headers={"Authorization": f"Bearer {token}"})

    assert resp.status_code == 200
    assert resp.json() == {
        "personas": [
            {
                "person_id": persona.person_id,
                "role": persona.role,
                "team_id": persona.team_id,
                "ride_group_id": persona.ride_group_id,
                "name": persona.name,
            }
        ]
    }


# --------------------------------------------------------------------------
# Request-body validation -> 400, not FastAPI's default 422. get_caller is
# overridden entirely here so these tests isolate body validation from the
# auth dependency.
# --------------------------------------------------------------------------


@pytest.fixture
def authed_client(client, monkeypatch: pytest.MonkeyPatch):
    """`client` with `get_caller` overridden to a fixed, always-succeeding
    Caller -- used by tests that need to get PAST auth to exercise body
    validation, without touching a real (or fake) DB connection."""
    from app import main as main_module

    persona = Persona(
        person_id=str(uuid.uuid4()),
        role="coach",
        team_id=str(uuid.uuid4()),
        ride_group_id=str(uuid.uuid4()),
        name="Coach Test",
    )
    fake_caller = Caller(sub=str(uuid.uuid4()), personas=[persona])
    main_module.app.dependency_overrides[get_caller] = lambda: fake_caller
    yield client
    main_module.app.dependency_overrides.pop(get_caller, None)


@pytest.mark.parametrize(
    "bad_body",
    [
        {"athlete_id": "not-a-uuid", "skill": "cornering", "level_observed": 3},
        {"athlete_id": str(uuid.uuid4()), "skill": "wheelies", "level_observed": 3},
        {"athlete_id": str(uuid.uuid4()), "skill": "cornering", "level_observed": 0},
        {"athlete_id": str(uuid.uuid4()), "skill": "cornering", "level_observed": 6},
        {"skill": "cornering", "level_observed": 3},  # missing athlete_id
    ],
    ids=["bad-uuid", "bad-skill", "level-too-low", "level-too-high", "missing-athlete-id"],
)
def test_post_observations_rejects_invalid_body(authed_client, bad_body: dict[str, Any]) -> None:
    resp = authed_client.post("/api/observations", json=bad_body)
    assert resp.status_code == 400
    assert resp.json()["error"] == "invalid request"


@pytest.mark.parametrize(
    "bad_body",
    [
        {"athlete_id": "not-a-uuid", "skill": "braking", "level": 3},
        {"athlete_id": str(uuid.uuid4()), "skill": "not-a-skill", "level": 3},
        {"athlete_id": str(uuid.uuid4()), "skill": "braking", "level": 0},
        {"athlete_id": str(uuid.uuid4()), "skill": "braking", "level": 6},
    ],
    ids=["bad-uuid", "bad-skill", "level-too-low", "level-too-high"],
)
def test_post_confirmed_levels_rejects_invalid_body(authed_client, bad_body: dict[str, Any]) -> None:
    resp = authed_client.post("/api/confirmed-levels", json=bad_body)
    assert resp.status_code == 400
    assert resp.json()["error"] == "invalid request"


@pytest.mark.parametrize(
    "bad_body",
    [
        {"ride_group_id": "not-a-uuid"},
        {"status": "not-a-status"},
    ],
    ids=["bad-uuid", "bad-status"],
)
def test_post_practices_rejects_invalid_body(authed_client, bad_body: dict[str, Any]) -> None:
    resp = authed_client.post("/api/practices", json=bad_body)
    assert resp.status_code == 400
    assert resp.json()["error"] == "invalid request"


@pytest.mark.parametrize(
    "bad_body",
    [
        {"practice_id": "not-a-uuid", "person_id": str(uuid.uuid4())},
        {"practice_id": str(uuid.uuid4()), "person_id": "not-a-uuid"},
        {"practice_id": str(uuid.uuid4()), "person_id": str(uuid.uuid4()), "status": "not-a-status"},
        {"person_id": str(uuid.uuid4())},  # missing practice_id
    ],
    ids=["bad-practice-uuid", "bad-person-uuid", "bad-status", "missing-practice-id"],
)
def test_post_attendance_rejects_invalid_body(authed_client, bad_body: dict[str, Any]) -> None:
    resp = authed_client.post("/api/attendance", json=bad_body)
    assert resp.status_code == 400
    assert resp.json()["error"] == "invalid request"

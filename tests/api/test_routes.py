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


class _FakeConn:
    """Minimal stand-in for a psycopg connection: `.execute(query, params)`
    returns self so `.fetchall()` / `.fetchone()` can chain, same as the
    real psycopg cursor-less `Connection.execute` this codebase uses
    everywhere. `rows` is whatever the test wants the query to "return" --
    this file never inspects the query text, only asserts on the route's
    response, so one fake serves any of the team-name / roster / etc.
    lookups a route might make."""

    def __init__(self, rows: list[tuple] | None = None) -> None:
        self._rows = rows or []

    def execute(self, query: str, params: Any = None) -> "_FakeConn":
        return self

    def fetchall(self) -> list[tuple]:
        return self._rows

    def fetchone(self) -> tuple | None:
        return self._rows[0] if self._rows else None


def _fake_rls_connection_factory(rows: list[tuple] | None = None):
    """Builds a fake `rls_connection(database_url, sub)` context manager
    that yields a `_FakeConn(rows)` -- for monkeypatching `app.routes.
    rls_connection` (the routes module's OWN import of it, separate from
    `app.deps.rls_connection` used by `get_caller`) so a route handler that
    reaches a real query doesn't try to hit the placeholder DB URL."""

    @contextmanager
    def _conn(database_url: str, sub: str) -> Iterator[_FakeConn]:
        yield _FakeConn(rows)

    return _conn


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
    # get_me (D26) opens its OWN rls_connection to look up team names -- a
    # SEPARATE import from app.deps.rls_connection above (routes.py imports
    # it directly from app.db), so it needs its own fake here or this test
    # would try to actually connect to the placeholder DB URL.
    monkeypatch.setattr(
        "app.routes.rls_connection",
        _fake_rls_connection_factory([(uuid.UUID(persona.team_id), "Team Test")]),
    )

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
                "team_name": "Team Test",
            }
        ]
    }


def test_get_me_team_name_is_none_when_team_lookup_finds_no_row(
    client, monkeypatch: pytest.MonkeyPatch
) -> None:
    """Belt-and-braces: a team_id with no matching `team` row (shouldn't
    normally happen -- FK-backed -- but the lookup must degrade to `None`,
    not KeyError/500, if it ever does)."""
    persona = Persona(
        person_id=str(uuid.uuid4()),
        role="coach",
        team_id=str(uuid.uuid4()),
        ride_group_id=None,
        name="Coach Test",
    )
    monkeypatch.setattr("app.deps.rls_connection", _fake_rls_connection)
    monkeypatch.setattr("app.deps.resolve_personas", lambda conn, sub: [persona])
    monkeypatch.setattr("app.routes.rls_connection", _fake_rls_connection_factory([]))

    token = _make_token()
    resp = client.get("/api/me", headers={"Authorization": f"Bearer {token}"})

    assert resp.status_code == 200
    assert resp.json()["personas"][0]["team_name"] is None


def test_get_me_returns_a_team_name_per_persona_for_a_multi_persona_caller(
    client, monkeypatch: pytest.MonkeyPatch
) -> None:
    """The D26 scenario this whole increment is about: a traveling coach
    with personas on more than one team, each with its own team_name."""
    team_a, team_b = str(uuid.uuid4()), str(uuid.uuid4())
    persona_a = Persona(person_id=str(uuid.uuid4()), role="team_director", team_id=team_a, ride_group_id=None, name="Traveling TD")
    persona_b = Persona(person_id=str(uuid.uuid4()), role="coach", team_id=team_b, ride_group_id=str(uuid.uuid4()), name="Traveling TD")
    monkeypatch.setattr("app.deps.rls_connection", _fake_rls_connection)
    monkeypatch.setattr("app.deps.resolve_personas", lambda conn, sub: [persona_a, persona_b])
    monkeypatch.setattr(
        "app.routes.rls_connection",
        _fake_rls_connection_factory([(uuid.UUID(team_a), "Team A"), (uuid.UUID(team_b), "Team B")]),
    )

    token = _make_token()
    resp = client.get("/api/me", headers={"Authorization": f"Bearer {token}"})

    assert resp.status_code == 200
    personas = resp.json()["personas"]
    assert len(personas) == 2
    assert {p["team_name"] for p in personas} == {"Team A", "Team B"}


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


# --------------------------------------------------------------------------
# D26 -- optional `team_id` query param on the list endpoints. A caller with
# more than one persona (a traveling coach) needs to scope a GET to exactly
# one of THEIR OWN teams; a team_id that isn't one of the caller's own
# persona team_ids must 403, never silently served or silently ignored.
# Mirrors import_roster's existing "which of the caller's own teams" check
# (routes.py's `hc_td_team_ids`), generalized to `_resolve_scope_team_id`
# for any role, on the read side.
# --------------------------------------------------------------------------

_TEAM_SCOPED_GET_ROUTES = [
    "/api/roster",
    "/api/observations",
    "/api/confirmed-levels",
    "/api/practices",
    "/api/attendance",
]


@pytest.fixture
def authed_client_team(client, monkeypatch: pytest.MonkeyPatch):
    """Like `authed_client`, but exposes the fixed caller's OWN team_id
    alongside the client, so team-scoping tests can build both an "own
    team" and an "someone else's team" team_id query param."""
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
    yield client, persona.team_id
    main_module.app.dependency_overrides.pop(get_caller, None)


@pytest.mark.parametrize("path", _TEAM_SCOPED_GET_ROUTES, ids=_TEAM_SCOPED_GET_ROUTES)
def test_team_id_not_one_of_callers_own_teams_is_denied(authed_client_team, path: str) -> None:
    client, _own_team_id = authed_client_team
    someone_elses_team = str(uuid.uuid4())
    resp = client.get(path, params={"team_id": someone_elses_team})
    assert resp.status_code == 403
    assert resp.json() == {"error": "not your team"}


@pytest.mark.parametrize("path", _TEAM_SCOPED_GET_ROUTES, ids=_TEAM_SCOPED_GET_ROUTES)
def test_team_id_matching_callers_own_team_is_allowed(
    authed_client_team, monkeypatch: pytest.MonkeyPatch, path: str
) -> None:
    client, own_team_id = authed_client_team
    monkeypatch.setattr("app.routes.rls_connection", _fake_rls_connection_factory([]))
    resp = client.get(path, params={"team_id": own_team_id})
    assert resp.status_code == 200
    assert resp.json() == []


@pytest.mark.parametrize("path", _TEAM_SCOPED_GET_ROUTES, ids=_TEAM_SCOPED_GET_ROUTES)
def test_team_id_omitted_still_reaches_the_query_unfiltered(
    authed_client_team, monkeypatch: pytest.MonkeyPatch, path: str
) -> None:
    """No `team_id` at all -- back-compat behavior for a single-persona
    caller (and for any caller who hasn't picked a team to scope to yet):
    the route still succeeds, unfiltered by team (RLS is still the real
    authorization backstop, same as before this increment)."""
    client, _own_team_id = authed_client_team
    monkeypatch.setattr("app.routes.rls_connection", _fake_rls_connection_factory([]))
    resp = client.get(path)
    assert resp.status_code == 200
    assert resp.json() == []


def test_team_id_malformed_is_a_400_not_a_500(authed_client_team) -> None:
    client, _own_team_id = authed_client_team
    resp = client.get("/api/roster", params={"team_id": "not-a-uuid"})
    assert resp.status_code == 400
    assert resp.json()["error"] == "invalid request"

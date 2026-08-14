"""GET /health and GET /version -- the only two routes this Phase 3.0
skeleton exposes (no business/DB routes yet)."""

from __future__ import annotations


def test_health_returns_200_and_status_ok(client) -> None:
    resp = client.get("/health")
    assert resp.status_code == 200
    assert resp.json() == {"status": "ok"}


def test_version_returns_200_with_expected_keys(client) -> None:
    resp = client.get("/version")
    assert resp.status_code == 200
    body = resp.json()
    assert "version" in body
    assert "commit" in body
    # No GIT_SHA set in the test env -- falls back to "dev" per
    # app/main.py's /version handler.
    assert body["commit"] == "dev"


def test_health_db_returns_503_and_down_when_db_unreachable(client) -> None:
    # placeholder_env's DATABASE_URL points nowhere real, so this proves the
    # failure path reports "down" rather than silently 200ing like /health.
    resp = client.get("/health/db")
    assert resp.status_code == 503
    body = resp.json()
    assert body["status"] == "down"
    assert "error" in body


def test_unknown_route_returns_json_not_html(client) -> None:
    resp = client.get("/does-not-exist")
    assert resp.status_code == 404
    assert resp.headers["content-type"].startswith("application/json")
    assert "error" in resp.json()

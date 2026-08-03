"""Shared fixtures for backend/app tests.

Puts backend/ on sys.path (inserted at position 0 so the real `app` package
there -- backend/app/__init__.py -- is found before the repo has any chance
of resolving `app` as something else) so `import app.main` / `import
app.config` work the same way they do when uvicorn is run from backend/.
Provides placeholder env values (no real network/DB -- this is a skeleton)
and a TestClient fixture that rebuilds the FastAPI app fresh per test so
each test's monkeypatched env is what `create_app()` actually sees.
"""

from __future__ import annotations

import importlib
import sys
from pathlib import Path

import pytest

BACKEND_DIR = Path(__file__).resolve().parents[2] / "backend"
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

# No real network/DB in this skeleton's tests -- these are the placeholder
# values the task brief specifies.
PLACEHOLDER_ENV = {
    "DATABASE_URL": "postgresql://placeholder",
    "SESSION_SECRET": "placeholder",
    "GOOGLE_CLIENT_ID": "ci-placeholder.apps.googleusercontent.com",
}


@pytest.fixture
def placeholder_env(monkeypatch: pytest.MonkeyPatch) -> dict[str, str]:
    """Sets the three required env vars to CI-safe placeholders. Individual
    tests can further monkeypatch.setenv/delenv on top of this."""
    for key, value in PLACEHOLDER_ENV.items():
        monkeypatch.setenv(key, value)
    return dict(PLACEHOLDER_ENV)


@pytest.fixture
def client(placeholder_env: dict[str, str]):
    """A TestClient over a freshly-built app instance. `app.main` builds its
    module-level `app` via `create_app()` at IMPORT time, so a plain `import
    app.main` after the first test would keep re-using whatever env was set
    on first import -- reload the module so `create_app()` re-runs against
    THIS test's (placeholder) env instead."""
    from fastapi.testclient import TestClient

    from app import main as main_module

    importlib.reload(main_module)
    return TestClient(main_module.app)

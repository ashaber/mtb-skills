"""FastAPI app factory: JSON-logging middleware, CORS, /health, /version,
global exception handling, fail-fast config, and (Phase 3.1) the
RLS-enforced `/api/*` data routes.

Phase 3.0 stood this module up with no business/DB routes (see
docs/PHASE3_TEAM_VISIBILITY_PLAN.md's build-phase layout). Phase 3.1
workstream A mounts app/routes.py's `router` here -- every one of those
routes requires an authenticated caller (app/deps.py's `get_caller`) and
queries the database exclusively through app.db.rls_connection.

`create_app()` runs once per process (module-level `app` below, for
`uvicorn app.main:app`) and once per test (tests build their own app after
monkeypatching env vars via `Settings.from_env`/`get_settings`, so each test
gets an independently-configured `Settings`). Mirrors swim-coach's
`backend/app/main.py`, trimmed to the routes this skeleton actually has.
"""

from __future__ import annotations

import os
import time

from fastapi import FastAPI, Request
from fastapi.encoders import jsonable_encoder
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

from app.config import Settings
from app.logging import get_logger
from app.routes import router as api_router

log = get_logger("app.main")

# Bumped by hand per release; `GIT_SHA` (set at build/deploy time -- see
# backend/Dockerfile / the future deploy workflow) is what actually
# distinguishes individual deployments of the same version (D25 in
# CLAUDE.md's open-defects list requests exactly this pairing on the
# frontend's Settings screen; /version gives the backend equivalent).
APP_VERSION = "3.0.0"


def create_app() -> FastAPI:
    # Fails fast: Settings.from_env() raises ConfigError (a RuntimeError
    # subclass) if DATABASE_URL, SESSION_SECRET, or GOOGLE_CLIENT_ID is
    # missing, or if STORE_BACKEND/LOG_LEVEL is set to something invalid --
    # this must happen before the app can serve anything, so a
    # misconfigured deploy never accepts a single request.
    settings = Settings.from_env()

    app = FastAPI(title="mtb-skills-api")
    app.state.settings = settings

    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.allowed_origins_list,
        allow_credentials=False,
        allow_methods=["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
        allow_headers=["Authorization", "Content-Type"],
    )

    @app.middleware("http")
    async def log_requests(request: Request, call_next):
        start = time.monotonic()
        response = await call_next(request)
        duration_ms = round((time.monotonic() - start) * 1000, 2)
        log.info(
            "request",
            method=request.method,
            path=request.url.path,
            status=response.status_code,
            duration_ms=duration_ms,
        )
        return response

    @app.exception_handler(StarletteHTTPException)
    async def http_exception_handler(request: Request, exc: StarletteHTTPException):
        # Never HTML -- per the global HTTP-services standard, error
        # responses are always JSON.
        return JSONResponse(status_code=exc.status_code, content={"error": exc.detail})

    @app.exception_handler(RequestValidationError)
    async def validation_exception_handler(request: Request, exc: RequestValidationError):
        # FastAPI's default for a bad request body/query/path param is 422;
        # the global HTTP-services standard here is "validate inputs at
        # service boundaries" with a plain `{"error": ...}` JSON body, and
        # the app/routes.py data endpoints' contract specifically calls for
        # 400 on bad input (skill outside the enum, level outside 1-5, a
        # malformed athlete_id, etc.) -- so this overrides FastAPI's default
        # status code, not just its body shape.
        return JSONResponse(
            status_code=400,
            content={"error": "invalid request", "detail": jsonable_encoder(exc.errors())},
        )

    @app.exception_handler(Exception)
    async def unhandled_exception_handler(request: Request, exc: Exception):
        log.error("unhandled exception", error=str(exc), path=request.url.path)
        return JSONResponse(status_code=500, content={"error": "internal server error"})

    @app.get("/health")
    async def health() -> dict:
        return {"status": "ok"}

    @app.get("/version")
    async def version() -> dict:
        return {
            "version": os.environ.get("APP_VERSION", APP_VERSION),
            # Set by the deploy workflow (Cloud Run --set-env-vars=GIT_SHA=...,
            # per docs/PHASE3_TEAM_VISIBILITY_PLAN.md's "Deploy pins the SHA
            # tag for inspectable rollbacks"). "dev" locally / when unset.
            "commit": os.environ.get("GIT_SHA", "dev"),
        }

    # Phase 3.1 workstream A: the RLS-enforced `/api/*` data routes
    # (app/routes.py) -- every route on this router requires
    # Depends(get_caller) (app/deps.py) and queries exclusively through
    # app.db.rls_connection, never a privileged connection.
    app.include_router(api_router)

    log.info(
        "service start",
        port=settings.port,
        store_backend=settings.store_backend,
        environment=os.environ.get("ENVIRONMENT", "dev"),
    )
    return app


app = create_app()

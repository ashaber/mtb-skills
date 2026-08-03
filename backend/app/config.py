"""Environment-var configuration (pydantic-settings). Fails fast if required
vars are missing.

Per Andrew's global standard: "All configuration via environment variables --
no hardcoded values in source" and "Fail fast on startup if required env vars
are missing." `backend/.env.example` documents every var below. Mirrors the
`swim-coach` repo's `backend/app/config.py` pattern, trimmed to what this
Phase 3.0 skeleton actually needs (no Anthropic/LLM, no intervals sync).
"""

from __future__ import annotations

from functools import lru_cache

from pydantic import ValidationError, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

try:
    # Convenience for local dev (`uvicorn app.main:app` from backend/ with a
    # .env file present). A no-op in production/Cloud Run, where env vars are
    # injected directly (Secret Manager / --set-env-vars) and no .env file
    # exists in the image.
    from dotenv import load_dotenv

    load_dotenv()
except ImportError:  # pragma: no cover - python-dotenv is a listed dependency
    pass

_REQUIRED_VARS = ("DATABASE_URL", "SESSION_SECRET", "GOOGLE_CLIENT_ID")
_VALID_STORE_BACKENDS = ("db", "local")
_VALID_LOG_LEVELS = ("debug", "info", "warn", "error")


class ConfigError(RuntimeError):
    """Raised when required configuration is missing or invalid at startup."""


class Settings(BaseSettings):
    """Immutable, validated configuration for one running instance.

    Built once via `Settings.from_env()` at app startup (see
    `app.main.create_app`) and stashed on `app.state.settings` -- never
    re-read from the environment mid-request.
    """

    model_config = SettingsConfigDict(env_file=None, case_sensitive=False, extra="ignore", frozen=True)

    # --- required, fail-fast if missing ------------------------------------

    # Supabase connection string. In 3.0 this is loaded and validated only --
    # no pool is opened yet (see `get_settings()` docstring / db_pool note
    # below). Use the TRANSACTION POOLER (pgbouncer, port 6543) for app
    # traffic when the DB layer lands in 3.1+; the direct connection
    # (port 5432) is for migrations/DDL only.
    database_url: str

    # Signs/verifies the backend's own session tokens once AuthN lands in
    # 3.1 (Supabase Auth + RLS, per docs/PHASE3_TEAM_VISIBILITY_PLAN.md).
    # Required now so the 3.1 auth routes are a code change, not a
    # config/deploy change. Choose a long random value, e.g.
    # `openssl rand -hex 32`.
    session_secret: str

    # The OAuth client id Google ID tokens must carry as `aud`, verified
    # server-side once the 3.1 auth routes land. NOT a secret -- it's the
    # SAME public client id the frontend bakes into its build as
    # VITE_GOOGLE_CLIENT_ID (mirrors swim-coach's google_client_id note in
    # backend/app/config.py) -- but still required at startup: without it,
    # there's no audience to check a token against later, which would
    # silently accept a token minted for a different OAuth client. Required
    # now so 3.1 doesn't need a new deploy just to add this var.
    google_client_id: str

    # --- optional, sensible defaults shown ----------------------------------

    # HTTP port uvicorn binds to (Cloud Run injects PORT itself).
    port: int = 8000

    # Comma-separated list of allowed CORS origins for the PWA. Empty by
    # default (no cross-origin access) until an environment's frontend
    # origin is configured.
    allowed_origins: str = ""

    # Persistence backend flag. "db" -- Supabase, via the DB layer landing in
    # a later increment (see `db_pool` note below). "local" is documented for
    # symmetry with the frontend's client-side store-factory flag
    # (src/storage.js) but the 3.0 backend has no local-file store -- it
    # exists so a future backend-side test/dev mode has a name reserved.
    store_backend: str = "db"

    # How long a minted session token stays valid before a coach has to sign
    # in again, once 3.1's auth routes mint one.
    session_ttl_days: int = 30

    # Structured-logger level (app/logging.py). One of debug/info/warn/error.
    log_level: str = "info"

    @field_validator("database_url", "session_secret", "google_client_id")
    @classmethod
    def _strip_secret(cls, value: str) -> str:
        # Secret managers and printf/echo pipelines routinely leave a
        # trailing newline on a secret's value; an unstripped newline
        # silently corrupts whatever the value feeds (a newline in
        # DATABASE_URL breaks psycopg's URI parse, one in SESSION_SECRET
        # changes the signing key, one in GOOGLE_CLIENT_ID breaks the `aud`
        # comparison). Strip defensively, same as swim-coach's config.py.
        return value.strip()

    @field_validator("store_backend")
    @classmethod
    def _validate_store_backend(cls, value: str) -> str:
        if value not in _VALID_STORE_BACKENDS:
            raise ValueError(f"STORE_BACKEND must be one of {_VALID_STORE_BACKENDS}, got {value!r}")
        return value

    @field_validator("log_level")
    @classmethod
    def _validate_log_level(cls, value: str) -> str:
        normalized = value.lower()
        if normalized not in _VALID_LOG_LEVELS:
            raise ValueError(f"LOG_LEVEL must be one of {_VALID_LOG_LEVELS}, got {value!r}")
        return normalized

    @property
    def allowed_origins_list(self) -> list[str]:
        return [o.strip() for o in self.allowed_origins.split(",") if o.strip()]

    @classmethod
    def from_env(cls) -> "Settings":
        """Load and validate config from the environment. Raises `ConfigError`
        with a clear, actionable message -- rather than a 500 on the first
        request -- if a required var is missing or a value fails validation.
        """
        import os

        missing = [name for name in _REQUIRED_VARS if not os.environ.get(name, "").strip()]
        if missing:
            raise ConfigError(
                f"missing required environment variable(s): {', '.join(missing)} "
                "-- see backend/.env.example"
            )

        try:
            return cls()
        except ValidationError as exc:
            raise ConfigError(f"invalid configuration: {exc}") from exc


@lru_cache
def get_settings() -> Settings:
    """Cached accessor for the process-wide `Settings` instance. Fails fast
    (raises `ConfigError`) on first call if config is missing/invalid --
    `app.main.create_app` calls this at startup so a misconfigured deploy
    never serves a single request.

    db_pool note (Phase 3.1+): once the DB layer lands, it should open the
    connection pool against `settings.database_url` using Supabase's
    TRANSACTION POOLER (port 6543) for normal app traffic, with prepared
    statements disabled (psycopg's `prepare_threshold=None`, mirroring
    swim-coach's `DbStore`) -- pgbouncer's transaction-pooling mode can hand
    a session's connection to a different client between statements, which
    breaks server-side prepared statements. The direct connection
    (port 5432) is for migrations/DDL only (see
    docs/PHASE3_TEAM_VISIBILITY_PLAN.md's "Environments & CI/CD"). No pool is
    opened in 3.0 -- this accessor only loads and validates config.
    """
    return Settings.from_env()

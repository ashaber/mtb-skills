"""app.config.Settings.from_env() -- fail-fast required-var checking,
default values, and override handling.

No real network/DB -- these are placeholder values only (see
tests/api/conftest.py's PLACEHOLDER_ENV / placeholder_env fixture).
"""

from __future__ import annotations

import pytest

from app.config import ConfigError, Settings

REQUIRED = {
    "DATABASE_URL": "postgresql://placeholder",
    "SESSION_SECRET": "placeholder",
    "GOOGLE_CLIENT_ID": "ci-placeholder.apps.googleusercontent.com",
    "SUPABASE_URL": "https://placeholder.supabase.co",
}


@pytest.mark.parametrize("missing_key", sorted(REQUIRED))
def test_from_env_raises_when_a_required_var_is_missing(
    monkeypatch: pytest.MonkeyPatch, missing_key: str
) -> None:
    for key, value in REQUIRED.items():
        monkeypatch.setenv(key, value)
    monkeypatch.delenv(missing_key, raising=False)

    with pytest.raises(ConfigError, match=missing_key):
        Settings.from_env()


def test_from_env_raises_when_all_required_vars_are_missing(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    for key in REQUIRED:
        monkeypatch.delenv(key, raising=False)

    with pytest.raises(ConfigError):
        Settings.from_env()


def test_from_env_succeeds_with_a_full_env(monkeypatch: pytest.MonkeyPatch) -> None:
    for key, value in REQUIRED.items():
        monkeypatch.setenv(key, value)

    settings = Settings.from_env()

    assert settings.database_url == REQUIRED["DATABASE_URL"]
    assert settings.session_secret == REQUIRED["SESSION_SECRET"]
    assert settings.google_client_id == REQUIRED["GOOGLE_CLIENT_ID"]
    assert settings.supabase_url == REQUIRED["SUPABASE_URL"]
    assert settings.jwks_url == "https://placeholder.supabase.co/auth/v1/.well-known/jwks.json"
    assert settings.supabase_jwt_secret == ""  # optional, unset -> empty default


def test_from_env_defaults_apply(monkeypatch: pytest.MonkeyPatch) -> None:
    for key, value in REQUIRED.items():
        monkeypatch.setenv(key, value)
    # Make sure none of the optional vars leak in from the real environment.
    for optional_key in (
        "PORT",
        "ALLOWED_ORIGINS",
        "STORE_BACKEND",
        "SESSION_TTL_DAYS",
        "LOG_LEVEL",
    ):
        monkeypatch.delenv(optional_key, raising=False)

    settings = Settings.from_env()

    assert settings.port == 8000
    assert settings.allowed_origins_list == []
    assert settings.store_backend == "db"
    assert settings.session_ttl_days == 30
    assert settings.log_level == "info"


def test_from_env_respects_overrides(monkeypatch: pytest.MonkeyPatch) -> None:
    for key, value in REQUIRED.items():
        monkeypatch.setenv(key, value)
    monkeypatch.setenv("PORT", "9001")
    monkeypatch.setenv(
        "ALLOWED_ORIGINS", "https://a.example.com, https://b.example.com"
    )
    monkeypatch.setenv("STORE_BACKEND", "local")
    monkeypatch.setenv("SESSION_TTL_DAYS", "7")
    monkeypatch.setenv("LOG_LEVEL", "DEBUG")

    settings = Settings.from_env()

    assert settings.port == 9001
    assert settings.allowed_origins_list == [
        "https://a.example.com",
        "https://b.example.com",
    ]
    assert settings.store_backend == "local"
    assert settings.session_ttl_days == 7
    assert settings.log_level == "debug"  # normalized to lowercase


def test_from_env_rejects_invalid_store_backend(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    for key, value in REQUIRED.items():
        monkeypatch.setenv(key, value)
    monkeypatch.setenv("STORE_BACKEND", "s3")

    with pytest.raises(ConfigError):
        Settings.from_env()


def test_from_env_rejects_invalid_log_level(monkeypatch: pytest.MonkeyPatch) -> None:
    for key, value in REQUIRED.items():
        monkeypatch.setenv(key, value)
    monkeypatch.setenv("LOG_LEVEL", "verbose")

    with pytest.raises(ConfigError):
        Settings.from_env()


def test_secrets_are_stripped_of_surrounding_whitespace(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("DATABASE_URL", " postgresql://placeholder\n")
    monkeypatch.setenv("SESSION_SECRET", "placeholder\n")
    monkeypatch.setenv("GOOGLE_CLIENT_ID", " ci-placeholder.apps.googleusercontent.com ")
    monkeypatch.setenv("SUPABASE_URL", " https://placeholder.supabase.co\n")
    monkeypatch.setenv("SUPABASE_JWT_SECRET", " ci-placeholder-jwt-secret\n")

    settings = Settings.from_env()

    assert settings.database_url == "postgresql://placeholder"
    assert settings.session_secret == "placeholder"
    assert settings.google_client_id == "ci-placeholder.apps.googleusercontent.com"
    assert settings.supabase_url == "https://placeholder.supabase.co"
    assert settings.supabase_jwt_secret == "ci-placeholder-jwt-secret"

import pytest
from pydantic import ValidationError

from backend.app.shared.config import Settings


def test_database_url_is_read_from_environment(monkeypatch):
    monkeypatch.setenv("DATABASE_URL", "postgresql://u:p@localhost:5432/db")

    settings = Settings(_env_file=None)

    assert settings.database_url == "postgresql://u:p@localhost:5432/db"


def test_cors_origins_are_split_by_comma(monkeypatch):
    monkeypatch.setenv("CORS_ORIGINS", "http://localhost:3000,https://rgb.example")

    settings = Settings(_env_file=None)

    assert settings.cors_origins == ["http://localhost:3000", "https://rgb.example"]


def test_auth_mode_defaults_to_dev():
    settings = Settings(_env_file=None)

    assert (settings.auth_mode, settings.supabase_url, settings.environment) == (
        "dev",
        "",
        "development",
    )


def test_auth_variables_are_read_from_environment(monkeypatch):
    monkeypatch.setenv("AUTH_MODE", "supabase")
    monkeypatch.setenv("SUPABASE_URL", "https://sample-project.supabase.example")
    monkeypatch.setenv("ENVIRONMENT", "production")

    settings = Settings(_env_file=None)

    assert settings.auth_mode == "supabase"
    assert settings.supabase_url == "https://sample-project.supabase.example"
    assert settings.environment == "production"


def test_an_unknown_auth_mode_is_refused():
    with pytest.raises(ValidationError):
        Settings(_env_file=None, auth_mode="open")


def test_supabase_mode_without_a_project_url_is_refused():
    with pytest.raises(ValidationError):
        Settings(_env_file=None, auth_mode="supabase")


def test_supabase_mode_with_a_blank_project_url_is_refused():
    with pytest.raises(ValidationError):
        Settings(_env_file=None, auth_mode="supabase", supabase_url="   ")


def test_connection_pool_is_off_by_default():
    assert Settings(_env_file=None).db_pool_max == 0


def test_connection_pool_size_is_read_from_environment(monkeypatch):
    monkeypatch.setenv("DB_POOL_MAX", "4")

    assert Settings(_env_file=None).db_pool_max == 4

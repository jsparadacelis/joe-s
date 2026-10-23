from backend.app.shared.config import Settings


def test_database_url_is_read_from_environment(monkeypatch):
    monkeypatch.setenv("DATABASE_URL", "postgresql://u:p@localhost:5432/db")

    settings = Settings(_env_file=None)

    assert settings.database_url == "postgresql://u:p@localhost:5432/db"


def test_cors_origins_are_split_by_comma(monkeypatch):
    monkeypatch.setenv("CORS_ORIGINS", "http://localhost:3000,https://rgb.example")

    settings = Settings(_env_file=None)

    assert settings.cors_origins == ["http://localhost:3000", "https://rgb.example"]

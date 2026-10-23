"""Apply the numbered SQL migrations in `backend/migrations`, once each."""

from __future__ import annotations

import sys
from pathlib import Path

import psycopg

MIGRATIONS_DIR = Path(__file__).resolve().parents[2] / "migrations"

_CONTROL = (
    "CREATE TABLE IF NOT EXISTS schema_migrations ("
    "name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())"
)


def apply_migrations(database_url: str, directory: Path = MIGRATIONS_DIR) -> list[str]:
    applied: list[str] = []
    with psycopg.connect(database_url) as conn:
        conn.execute(_CONTROL)
        done = {row[0] for row in conn.execute("SELECT name FROM schema_migrations")}
        conn.commit()
        for path in sorted(Path(directory).glob("*.sql")):
            if path.name in done:
                continue
            with conn.transaction():
                conn.execute(path.read_text())
                conn.execute("INSERT INTO schema_migrations (name) VALUES (%s)", (path.name,))
            applied.append(path.name)
    return applied


if __name__ == "__main__":
    from backend.app.shared.config import Settings

    names = apply_migrations(Settings().database_url)
    print("Migraciones aplicadas:", ", ".join(names) or "ninguna")
    sys.exit(0)

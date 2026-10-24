"""Seed the fictitious development study the API runs as (`Settings.dev_study_id`).

Development only: `scripts/dev.sh` runs it after the migrations. It is deliberately not a
migration, so production and Supabase never receive it, and it refuses non-local databases
unless `--force` is given. Idempotent.
"""

from __future__ import annotations

import sys

import psycopg
from psycopg.conninfo import conninfo_to_dict

DEV_STUDY_NAME = "Estudio de desarrollo"
LOCAL_HOSTS = frozenset({"localhost", "127.0.0.1", "::1", "db"})


class NonLocalDatabase(Exception):
    """The development seed was pointed at a database that does not look local."""


def assert_local_database(database_url: str, *, force: bool = False) -> None:
    if force:
        return
    host = conninfo_to_dict(database_url).get("host") or ""
    if host not in LOCAL_HOSTS:
        # The URL carries credentials, so the message never includes it.
        raise NonLocalDatabase(
            f"Refusing to seed development data into host {host!r}; use --force to override."
        )


def seed_dev_study(database_url: str, study_id: str, name: str = DEV_STUDY_NAME) -> bool:
    """Insert the study if it is missing. Returns whether it was created."""
    with psycopg.connect(database_url) as conn:
        # `studies` forces RLS, so even the owner needs the study context to insert its own row.
        conn.execute("SELECT set_config('app.study_id', %s, true)", (study_id,))
        created = conn.execute(
            "INSERT INTO studies (id, name) VALUES (%s, %s) ON CONFLICT (id) DO NOTHING",
            (study_id, name),
        ).rowcount
    return created == 1


if __name__ == "__main__":
    from backend.app.shared.config import Settings

    settings = Settings()
    assert_local_database(settings.database_url, force="--force" in sys.argv)
    created = seed_dev_study(settings.database_url, settings.dev_study_id)
    print("Estudio de desarrollo:", "creado" if created else "ya existía")

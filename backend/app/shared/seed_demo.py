"""Seed the fictitious demonstration study (RGB-7): one study, nine people and eight projects
spread over phases 0 to 6.

Development only. It is deliberately not a migration, so production and Supabase never receive
it, and the guard below refuses to run against anything that is not a local database. Run it as

    python -m backend.app.shared.seed_demo            # or: bash scripts/seed-demo.sh

The people are fictitious `study_members` (`@example.com`, made-up `user_id`s): no Supabase
account is created. To enter the demo run the API with `AUTH_MODE=dev` and the `DEV_*` values of
one of them (see docs/despliegue.md).
"""

from __future__ import annotations

from psycopg.conninfo import conninfo_to_dict

from backend.app.shared.seed_dev import NonLocalDatabase, assert_local_database

__all__ = ["DemoSeedForbidden", "NonLocalDatabase", "assert_demo_target"]

# Environments in which seeding demonstration data makes sense. Anything else (production,
# staging, an empty or misspelled value) is refused: unknown means unsafe.
SAFE_ENVIRONMENTS = frozenset({"development", "dev", "local", "test", "testing"})
# A host containing one of these is a hosted Supabase database or its pooler.
REMOTE_MARKERS = ("supabase", "pooler")


class DemoSeedForbidden(Exception):
    """The demo seed was pointed at a target it must never touch, not even with `--force`."""


def _hosts(database_url: str) -> list[str]:
    try:
        parts = conninfo_to_dict(database_url)
    except Exception:
        # The parser may echo part of the URL, which carries credentials: say nothing of it.
        raise DemoSeedForbidden("La URL de la base de datos no es válida.") from None
    values = [parts.get("host") or "", parts.get("hostaddr") or ""]
    return [h.strip().lower() for value in values for h in value.split(",") if h.strip()]


def assert_demo_target(database_url: str, environment: str, *, force: bool = False) -> None:
    """Raise unless seeding the demo here is safe.

    Production-like environments and Supabase/pooler hosts are refused ALWAYS, `force` included.
    Any other non-local host needs `force`. No message ever includes the URL or any credential.
    """
    if environment.strip().lower() not in SAFE_ENVIRONMENTS:
        raise DemoSeedForbidden(
            "La semilla de demostración no se ejecuta fuera de un entorno de desarrollo "
            "(ENVIRONMENT). Ni siquiera con --force."
        )
    if any(marker in host for host in _hosts(database_url) for marker in REMOTE_MARKERS):
        raise DemoSeedForbidden(
            "La semilla de demostración no se ejecuta contra Supabase ni contra un pooler "
            "remoto. Ni siquiera con --force."
        )
    assert_local_database(database_url, force=force)

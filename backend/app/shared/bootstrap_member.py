"""Create the first member of a study (a partner). Manual and idempotent.

The first partner cannot invite themselves, so a person in charge runs this once per study:

    python -m backend.app.shared.bootstrap_member --study <id> --email <email> --role partner

It only leaves a pending invitation; the person activates it by signing in with that email.
Never run automatically.
"""

from __future__ import annotations

import argparse
import sys

import psycopg

from backend.app.study.domain.context import Role
from backend.app.study.domain.members import normalize_email

BOOTSTRAP_USER = "bootstrap"


class StudyNotFound(Exception):
    """The study the first member was meant for does not exist."""


def bootstrap_member(database_url: str, study_id: str, email: str, role: Role) -> bool:
    """Insert the invitation if it is missing. Returns whether it was created."""
    normalized = normalize_email(email)
    with psycopg.connect(database_url) as conn:
        # `studies` and `study_members` force RLS, so even the owner needs the study context.
        conn.execute("SELECT set_config('app.study_id', %s, true)", (study_id,))
        exists = conn.execute("SELECT 1 FROM studies WHERE id = %s::uuid", (study_id,)).fetchone()
        if exists is None:
            raise StudyNotFound(f"No existe el estudio {study_id}.")
        row = conn.execute(
            "INSERT INTO study_members (study_id, email, role, status, invited_by) "
            "VALUES (%s::uuid, %s, %s, 'invited', %s) "
            "ON CONFLICT (study_id, lower(email)) DO NOTHING RETURNING id::text",
            (study_id, normalized, role.value, BOOTSTRAP_USER),
        ).fetchone()
        if row is None:
            return False
        conn.execute(
            "INSERT INTO audit_events (study_id, user_id, entity, entity_id, action, new_value) "
            "VALUES (%s::uuid, %s, 'member', %s, 'invite', %s)",
            (
                study_id,
                BOOTSTRAP_USER,
                row[0],
                psycopg.types.json.Jsonb(
                    {"email": normalized, "role": role.value, "qualifications": []}
                ),
            ),
        )
    return True


def main(argv: list[str] | None = None) -> int:
    from backend.app.shared.config import Settings

    parser = argparse.ArgumentParser(description="Invita al primer miembro de un estudio.")
    parser.add_argument("--study", required=True, help="id del estudio")
    parser.add_argument("--email", required=True)
    parser.add_argument("--role", default=Role.PARTNER.value, choices=[r.value for r in Role])
    args = parser.parse_args(argv)
    try:
        created = bootstrap_member(Settings().database_url, args.study, args.email, Role(args.role))
    except (StudyNotFound, ValueError) as error:
        print(f"Error: {error}", file=sys.stderr)
        return 1
    except Exception as error:  # InvalidEmail and database errors
        print(f"Error: {getattr(error, 'message', error)}", file=sys.stderr)
        return 1
    print("Invitación creada" if created else "Ya existía: no se ha cambiado nada")
    return 0


if __name__ == "__main__":
    sys.exit(main())

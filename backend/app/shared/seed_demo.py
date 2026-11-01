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

import argparse
import sys
from collections.abc import Callable
from dataclasses import dataclass
from datetime import date, datetime, timedelta, timezone
from typing import Any

import psycopg
from psycopg.conninfo import conninfo_to_dict
from psycopg.types.json import Jsonb

from backend.app.access.application.manage_project_members import ManageProjectMembers
from backend.app.access.domain.project_roles import ProjectRole
from backend.app.access.infrastructure.postgres_project_directory import PostgresProjectDirectory
from backend.app.access.infrastructure.postgres_project_members import PostgresProjectMembers
from backend.app.audit.application.record import audit
from backend.app.audit.infrastructure.postgres_audit_log import PostgresAuditLog
from backend.app.briefing.application.promote_brief import PromoteBrief
from backend.app.briefing.application.update_brief import UpdateBrief
from backend.app.briefing.infrastructure.postgres_briefs import PostgresBriefs
from backend.app.lifecycle.application.promotion_service import PromotionService
from backend.app.lifecycle.application.validators import VALIDATORS_BY_PHASE
from backend.app.lifecycle.infrastructure.postgres_lifecycle import PostgresLifecycle
from backend.app.opportunity.application.create_opportunity import CreateOpportunity
from backend.app.opportunity.application.promote_project_sheet import PromoteProjectSheet
from backend.app.opportunity.application.scoring import ScoringService
from backend.app.opportunity.application.start_project import StartProject
from backend.app.opportunity.application.update_project_sheet import UpdateProjectSheet
from backend.app.opportunity.domain.plan import ProjectType, Scale, make_plan
from backend.app.opportunity.infrastructure.postgres_opportunity import PostgresOpportunities
from backend.app.opportunity.infrastructure.postgres_project_plans import PostgresProjectPlans
from backend.app.opportunity.infrastructure.postgres_project_sheets import PostgresProjectSheets
from backend.app.opportunity.infrastructure.postgres_scoring import (
    PostgresScorings,
    PostgresScoringSettings,
)
from backend.app.shared.db import study_transaction
from backend.app.shared.demo_data import (
    DEMO_STUDY_ID,
    DEMO_STUDY_NAME,
    MEMBERS,
    PROJECTS,
    SEED_USER,
    TECHNICAL_DATA,
    ProjectSpec,
    fictitious_cadastral_reference,
    team_for_phase,
)
from backend.app.shared.seed_dev import NonLocalDatabase, assert_local_database
from backend.app.study.application.manage_members import ManageMembers
from backend.app.study.domain.context import Qualification, RequestContext, Role
from backend.app.study.infrastructure.postgres_members import (
    PostgresMemberResolver,
    PostgresMembers,
)
from backend.app.technical_data.domain.catalog import CATALOG, definition_of
from backend.app.technical_data.domain.datum import TechnicalDatum
from backend.app.technical_data.infrastructure.postgres_technical_data import PostgresTechnicalData
from backend.app.timing.application.pause_service import PauseService
from backend.app.timing.infrastructure.postgres_pauses import PostgresPauses

__all__ = ["DemoSeedForbidden", "NonLocalDatabase", "SeedResult", "assert_demo_target", "seed_demo"]

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


def _fail(step: str, error: object) -> RuntimeError:
    return RuntimeError(f"Demo seed failed at {step}: {getattr(error, 'code', error)}")


class SeedProjectRoles:
    """Every function in every project, for the `seed` actor only.

    The seed is not a person: it walks each project through the real use cases up to its target
    phase, and those ask who holds the function of the phase. Same idea as `DevProjectRoles`.
    """

    def roles_of(self, project_id: str, user_id: str) -> frozenset[ProjectRole]:
        return frozenset(ProjectRole)


@dataclass(frozen=True)
class SeedResult:
    created: bool


@dataclass
class _Services:
    """The real use cases, wired on one transaction (this module is a composition root)."""

    conn: psycopg.Connection
    context: RequestContext

    def __post_init__(self) -> None:
        conn = self.conn
        self.audit_log = PostgresAuditLog(conn)
        roles = SeedProjectRoles()
        self.roles = roles
        self.members = PostgresMembers(conn)
        self.technical = PostgresTechnicalData(conn)
        self.directory = PostgresProjectDirectory(conn)
        sheets, plans = PostgresProjectSheets(conn), PostgresProjectPlans(conn)
        scorings = PostgresScorings(conn)
        self.promotion = PromotionService(
            PostgresLifecycle(conn), self.audit_log, VALIDATORS_BY_PHASE, roles
        )
        self.create = CreateOpportunity(PostgresOpportunities(conn), self.audit_log)
        self.score = ScoringService(scorings, PostgresScoringSettings(conn), self.audit_log)
        self.start = StartProject(plans, scorings, self.promotion, self.audit_log)
        self.update_sheet = UpdateProjectSheet(sheets, plans, self.audit_log)
        self.promote_sheet = PromoteProjectSheet(sheets, plans, self.promotion, self.audit_log)
        briefs = PostgresBriefs(conn)
        self.update_brief = UpdateBrief(briefs, self.technical, roles, self.audit_log)
        self.promote_brief = PromoteBrief(
            briefs, self.technical, roles, self.promotion, self.audit_log
        )
        self.assignments = ManageProjectMembers(
            self.directory, PostgresProjectMembers(conn), self.members, self.audit_log
        )

    def pauses(self, clock: Callable[[], datetime]) -> PauseService:
        return PauseService(PostgresPauses(self.conn), self.audit_log, self.roles, clock)

    def note(self, entity: str, entity_id: str, action: str, new_value: Any) -> None:
        """Audit a direct write the seed makes where no use case exists yet."""
        audit(
            self.audit_log,
            self.context,
            entity=entity,
            entity_id=entity_id,
            action=action,
            new_value=new_value,
        )


def _utc_now() -> datetime:
    return datetime.now(timezone.utc)


def _iso(day: date) -> str:
    return day.isoformat()


def _ensure_study(services: _Services) -> bool:
    """Create the demo study. Returns whether it already had projects (nothing left to do)."""
    conn = services.conn
    created = conn.execute(
        "INSERT INTO studies (id, name) VALUES (%s::uuid, %s) ON CONFLICT (id) DO NOTHING",
        (DEMO_STUDY_ID, DEMO_STUDY_NAME),
    ).rowcount
    (name,) = conn.execute(
        "SELECT name FROM studies WHERE id = %s::uuid", (DEMO_STUDY_ID,)
    ).fetchone()
    if name != DEMO_STUDY_NAME:
        # A study with this id that is not ours: never write into it.
        raise DemoSeedForbidden(
            "Ya existe un estudio con el id de la demostración y no es el suyo."
        )
    if created:
        services.note("study", DEMO_STUDY_ID, "seed_create", {"name": DEMO_STUDY_NAME})
    (projects,) = conn.execute("SELECT count(*) FROM projects").fetchone()
    return projects > 0


def _seed_members(services: _Services) -> dict[str, str]:
    """Invite and activate the nine people. Returns their member ids by `user_id`."""
    invitations = ManageMembers(services.members, services.audit_log)
    resolver = PostgresMemberResolver(services.conn)
    ids: dict[str, str] = {}
    for spec in MEMBERS:
        existing = services.members.find_by_email(spec.email)
        if existing is None:
            result = invitations.invite(
                services.context, spec.email, spec.role, frozenset(spec.qualifications)
            )
            if result.member is None:
                raise _fail(f"inviting {spec.user_id}", result.error)
            existing = result.member
        # The real sign-in path (`resolve_member`) links the made-up subject and activates.
        resolution = resolver.resolve(spec.email, spec.user_id)
        if resolution is not None and resolution.activated:
            audit(
                services.audit_log,
                services.context,
                entity="member",
                entity_id=existing.id,
                action="activate",
                old_value={"status": "invited"},
                new_value={"status": "active", "user_id": spec.user_id},
            )
        ids[spec.user_id] = existing.id
    return ids


def _sheet_fields(spec: ProjectSpec, today: date) -> dict[str, str]:
    assert spec.cadastral_index is not None
    return {
        "cadastral_reference": fictitious_cadastral_reference(spec.cadastral_index),
        "scope_included": "Proyecto básico y de ejecución, y dirección de obra (ejemplo ficticio).",
        "scope_excluded": "Interiorismo y mobiliario (ejemplo ficticio).",
        "contract_signed_on": _iso(today - timedelta(days=21)),
        "sponsor": spec.client,
        "project_director": "Carla Prueba",
        "technical_lead": "Daniel Simulado",
        "contact": f"Persona de contacto de {spec.client}, contacto@example.com",
        "next_milestone": spec.next_milestone or "Reunión de seguimiento",
        "next_milestone_on": _iso(today + timedelta(days=14)),
        "main_risk": "Retraso en la respuesta del cliente (ejemplo ficticio).",
        "risk_owner": "Carla Prueba",
        "repository_path": f"demo://repositorio/{spec.cadastral_index:02d}",
    }


def _brief_fields(spec: ProjectSpec, today: date) -> dict[str, Any]:
    """The brief of a project in phase 2 is still a draft: the client has not answered yet, so
    the approval stays pending and the survey is not written."""
    if spec.target_phase == 2:
        return {
            "needs": f"Necesidades de {spec.client} (texto de ejemplo ficticio).",
            "program": "Programa de ejemplo: zonas de día, de noche y de servicio.",
            "constraints": "Condicionantes de ejemplo: altura máxima y retranqueos.",
            "target_budget": spec.estimated_budget,
            "deadline": _iso(today + timedelta(days=spec.deadline_in_days)),
        }
    return {
        "needs": f"Necesidades de {spec.client} (texto de ejemplo ficticio).",
        "program": "Programa de ejemplo: zonas de día, de noche y de servicio.",
        "constraints": "Condicionantes de ejemplo: altura máxima y retranqueos.",
        "target_budget": spec.estimated_budget,
        "deadline": _iso(today + timedelta(days=spec.deadline_in_days)),
        "topographic_survey": "Levantamiento de ejemplo pendiente de contratar.",
        "alignment": "Alineación de ejemplo según el planeamiento ficticio.",
        "client_approval": "signed" if spec.target_phase >= 3 else "email",
    }


def _technical_data(spec: ProjectSpec) -> list[TechnicalDatum]:
    """The 26 data of the catalog with the made-up values.

    Phase 2 leaves the last data unverified (the brief is still open); later phases verify all.
    A project may show one edited datum (its value differs from the one the query returned).
    """
    values = {**TECHNICAL_DATA, **spec.technical_overrides}
    data = []
    for position, definition in enumerate(CATALOG):
        manual = definition_of(definition.id).source.value == "manual"
        original = spec.technical_edits.get(definition.id)
        value = values[definition.id]
        data.append(
            TechnicalDatum(
                field_id=definition.id,
                value=value,
                source=definition.source,
                original=None if manual else (original if original is not None else value),
                verified=spec.target_phase >= 3 or position < 12,
            )
        )
    return data


def _finalize_deliverable(
    services: _Services, project_id: str, code: str, phase: int, content: dict[str, Any]
) -> None:
    """Mark an exit deliverable complete and approved. Phases 3 to 5 have no use case yet."""
    services.conn.execute(
        "INSERT INTO exit_deliverables (study_id, project_id, phase, content, complete, approved) "
        "SELECT study_id, id, %s, %s, true, true FROM projects WHERE id = %s::uuid "
        "ON CONFLICT (project_id, phase) DO UPDATE SET content = EXCLUDED.content, "
        "complete = true, approved = true, updated_at = now()",
        (phase, Jsonb(content), project_id),
    )
    services.note("exit_deliverable", code, "seed_finalize", {"phase": phase})


_LATE_DELIVERABLES: dict[int, dict[str, Any]] = {
    3: {
        "package": {"title": "Paquete de anteproyecto (ficticio)", "status": "approved"},
        "relief_viewer": {"used": True},
    },
    4: {
        "basic_project": {"issued": True, "title": "Proyecto básico (ficticio)"},
        "license": {"status": "granted_with_conditions", "conditions": "Condición de ejemplo."},
    },
    5: {
        "execution_project": {"issued": True, "coordinated": True, "visa": "ficticio"},
    },
}


def _promote(services: _Services, code: str, phase: int) -> None:
    transition = services.promotion.promote(services.context, code)
    if not transition.ok:
        raise _fail(f"promoting {code} from phase {phase}", transition.error)


def _advance_project(
    services: _Services, spec: ProjectSpec, member_ids: dict[str, str], now: datetime
) -> None:
    """Create one project and walk it to its target phase through the real use cases."""
    context, today = services.context, now.date()
    created = services.create.execute(
        context,
        {
            "name": spec.name,
            "client": spec.client,
            "location": spec.location,
            "project_type": spec.project_type,
            "owner": spec.owner,
            "estimated_budget": spec.estimated_budget,
            "deadline": _iso(today + timedelta(days=spec.deadline_in_days)),
            "source": spec.source,
            "decision_date": _iso(today + timedelta(days=14)),
        },
    )
    code = created.code
    services.score.score(context, code, {"ratings": spec.ratings})
    project = services.directory.find(code)
    assert project is not None  # just created in this transaction
    phase = spec.target_phase

    if phase >= 1:
        weeks = list(make_plan(ProjectType(spec.project_type), Scale(spec.scale)).weeks)
        started = services.start.execute(context, code, spec.scale, weeks)
        if not started.transition.ok:
            raise _fail(f"starting {code}", started.transition.error)
    if phase >= 2:
        fields = _sheet_fields(spec, today)
        edited = services.update_sheet.execute(context, code, fields, None)
        if edited.error is not None:
            raise _fail(f"completing the sheet of {code}", edited.error)
        promoted = services.promote_sheet.execute(context, code)
        if promoted.error is not None:
            raise _fail(f"promoting the sheet of {code}", promoted.error)
    if phase >= 2:
        assert spec.cadastral_index is not None
        services.technical.save(project.id, _technical_data(spec))
        services.technical.record_query(
            project.id, fictitious_cadastral_reference(spec.cadastral_index), now
        )
        edited = services.update_brief.execute(context, code, _brief_fields(spec, today))
        if edited.error is not None:
            raise _fail(f"writing the brief of {code}", edited.error)
    if phase >= 3:
        promoted = services.promote_brief.execute(context, code)
        if promoted.error is not None:
            raise _fail(f"promoting the brief of {code}", promoted.error)
    for late in (3, 4, 5):
        if phase > late:
            _finalize_deliverable(services, project.id, code, late, _LATE_DELIVERABLES[late])
            _promote(services, code, late)

    _track(services, spec, project.id, code)
    _assign_team(services, code, phase, member_ids)
    if spec.pause is not None:
        _pause(services, spec, code, now)


def _track(services: _Services, spec: ProjectSpec, project_id: str, code: str) -> None:
    """Responsible, next milestone and traffic light: no use case writes them yet."""
    if spec.target_phase == 0:
        return
    services.conn.execute(
        "UPDATE projects SET responsible_id = %s, next_milestone = %s, traffic_light = %s, "
        "active = true WHERE id = %s::uuid",
        (spec.owner, spec.next_milestone, spec.traffic_light, project_id),
    )
    services.note(
        "project",
        code,
        "seed_tracking",
        {"traffic_light": spec.traffic_light, "next_milestone": spec.next_milestone},
    )


def _assign_team(services: _Services, code: str, phase: int, member_ids: dict[str, str]) -> None:
    for role, user_id in team_for_phase(phase):
        result = services.assignments.assign(
            services.context, code, member_ids[user_id], ProjectRole(role)
        )
        if result.error is not None:
            raise _fail(f"assigning {role} to {code}", result.error)


def _pause(services: _Services, spec: ProjectSpec, code: str, now: datetime) -> None:
    """An open pause. The overdue one starts 40 days ago and was due 8 days ago; the other
    started 5 days ago and is due in 20. The service's clock is moved back to open them."""
    started_days_ago, due_in_days = (40, -8) if spec.pause == "overdue" else (5, 20)
    reason = "authority_wait" if spec.pause == "overdue" else "client_wait"
    result = services.pauses(lambda: now - timedelta(days=started_days_ago)).pause(
        services.context,
        code,
        {
            "reason": reason,
            "expected_resumption": _iso(now.date() + timedelta(days=due_in_days)),
        },
    )
    if result.error is not None:
        raise _fail(f"pausing {code}", result.error)


def seed_demo(database_url: str, *, clock: Callable[[], datetime] = _utc_now) -> SeedResult:
    """Seed the demo study in one transaction, as the `seed` actor under the study's RLS.

    Idempotent as a whole: when the study already has projects nothing is written. The audit
    log is immutable, so there is no reset; recreate the local database to start over.
    """
    context = RequestContext(
        study_id=DEMO_STUDY_ID,
        user_id=SEED_USER,
        role=Role.PARTNER,
        qualifications=frozenset(Qualification),
    )
    now = clock()
    with study_transaction(database_url, context) as conn:
        services = _Services(conn, context)
        if _ensure_study(services):
            return SeedResult(created=False)
        member_ids = _seed_members(services)
        for spec in PROJECTS:
            _advance_project(services, spec, member_ids, now)
    return SeedResult(created=True)


def main(argv: list[str] | None = None) -> int:
    from backend.app.shared.config import Settings

    parser = argparse.ArgumentParser(description="Siembra el estudio de demostración (ficticio).")
    parser.add_argument(
        "--force",
        action="store_true",
        help="permite un host no local (nunca Supabase ni producción)",
    )
    args = parser.parse_args(argv)
    settings = Settings()
    try:
        if settings.dev_study_id == DEMO_STUDY_ID:
            raise DemoSeedForbidden("DEV_STUDY_ID no puede ser el id del estudio de demostración.")
        assert_demo_target(settings.database_url, settings.environment, force=args.force)
        result = seed_demo(settings.database_url)
    except (DemoSeedForbidden, NonLocalDatabase) as error:
        print(f"Error: {error}", file=sys.stderr)
        return 1
    except psycopg.Error as error:
        # Never print the driver message as is: it can echo the connection string.
        print(f"Error de base de datos ({type(error).__name__}).", file=sys.stderr)
        return 1
    print("Estudio de demostración:", "creado" if result.created else "ya existía (sin cambios)")
    return 0


if __name__ == "__main__":
    sys.exit(main())

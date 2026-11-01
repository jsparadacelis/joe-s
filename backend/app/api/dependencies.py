"""FastAPI dependencies shared by the routes."""

from __future__ import annotations

from collections.abc import Callable, Iterator
from contextlib import AbstractContextManager, contextmanager
from functools import lru_cache
from typing import Annotated

from fastapi import Depends, Header, HTTPException

from backend.app.access.application.manage_project_members import ManageProjectMembers
from backend.app.access.domain.ports import ProjectRoleReader
from backend.app.access.infrastructure.dev_project_roles import DevProjectRoles
from backend.app.access.infrastructure.postgres_project_directory import PostgresProjectDirectory
from backend.app.access.infrastructure.postgres_project_members import PostgresProjectMembers
from backend.app.audit.infrastructure.postgres_audit_log import PostgresAuditLog
from backend.app.briefing.application.get_brief import GetBrief
from backend.app.briefing.application.promote_brief import PromoteBrief
from backend.app.briefing.application.update_brief import UpdateBrief
from backend.app.briefing.infrastructure.postgres_briefs import PostgresBriefs
from backend.app.external_data.application.get_cadastral_property import GetCadastralProperty
from backend.app.external_data.application.get_plot_geometry import GetPlotGeometry
from backend.app.external_data.application.get_pv_yield import GetPvYield
from backend.app.external_data.application.get_terrain_profile import GetTerrainProfile
from backend.app.external_data.domain.ports import (
    CadastreGateway,
    ElevationGateway,
    PlotGateway,
    PvGateway,
)
from backend.app.external_data.infrastructure.http_cadastre_gateway import HttpCadastreGateway
from backend.app.external_data.infrastructure.http_elevation_gateway import HttpElevationGateway
from backend.app.external_data.infrastructure.http_plot_gateway import HttpPlotGateway
from backend.app.external_data.infrastructure.http_pv_gateway import HttpPvGateway
from backend.app.external_data.infrastructure.postgres_cadastre_cache import (
    PostgresCadastreCache,
)
from backend.app.external_data.infrastructure.postgres_plot_cache import PostgresPlotCache
from backend.app.external_data.infrastructure.postgres_pv_cache import PostgresPvCache
from backend.app.external_data.infrastructure.postgres_terrain_cache import PostgresTerrainCache
from backend.app.lifecycle.application.promotion_service import PromotionService
from backend.app.lifecycle.application.validators import VALIDATORS_BY_PHASE
from backend.app.lifecycle.infrastructure.postgres_lifecycle import PostgresLifecycle
from backend.app.opportunity.application.create_opportunity import CreateOpportunity
from backend.app.opportunity.application.get_project_sheet import GetProjectSheet
from backend.app.opportunity.application.plan_settings import PlanSettingsService
from backend.app.opportunity.application.promote_project_sheet import PromoteProjectSheet
from backend.app.opportunity.application.scoring import ScoringService, ScoringSettingsService
from backend.app.opportunity.application.start_project import ProjectPlanReader, StartProject
from backend.app.opportunity.application.update_project_sheet import UpdateProjectSheet
from backend.app.opportunity.infrastructure.postgres_opportunity import PostgresOpportunities
from backend.app.opportunity.infrastructure.postgres_plan_settings import PostgresPlanSettings
from backend.app.opportunity.infrastructure.postgres_project_plans import PostgresProjectPlans
from backend.app.opportunity.infrastructure.postgres_project_sheets import PostgresProjectSheets
from backend.app.opportunity.infrastructure.postgres_scoring import (
    PostgresScorings,
    PostgresScoringSettings,
)
from backend.app.portfolio.application.queries import PortfolioQueries
from backend.app.portfolio.infrastructure.postgres_projects import PostgresProjects
from backend.app.shared.config import Settings
from backend.app.shared.db import identity_transaction, study_transaction
from backend.app.study.application.authenticate import Authenticate, check_token
from backend.app.study.application.manage_members import ManageMembers
from backend.app.study.domain.context import Qualification, RequestContext, Role
from backend.app.study.domain.errors import (
    EmailNotVerified,
    MemberRevoked,
    MfaRequired,
    NotInvited,
    StudyError,
    Unauthenticated,
)
from backend.app.study.domain.ports import TokenVerifier
from backend.app.study.infrastructure.postgres_members import (
    PostgresMemberResolver,
    PostgresMembers,
)
from backend.app.study.infrastructure.supabase_jwt_verifier import SupabaseJwtVerifier
from backend.app.technical_data.application.edit_datum import EditDatum
from backend.app.technical_data.application.get_alerts import GetAlerts
from backend.app.technical_data.application.get_capacity import GetCapacity
from backend.app.technical_data.application.get_technical_data import GetTechnicalData
from backend.app.technical_data.application.refresh_technical_data import (
    RefreshSession,
    RefreshTechnicalData,
)
from backend.app.technical_data.application.restore_datum import RestoreDatum
from backend.app.technical_data.application.use_cases import TechnicalDataUseCases
from backend.app.technical_data.application.verify_all import VerifyAll
from backend.app.technical_data.application.verify_datum import VerifyDatum
from backend.app.technical_data.infrastructure.postgres_project_facts import (
    PostgresProjectFacts,
)
from backend.app.technical_data.infrastructure.postgres_technical_data import (
    PostgresTechnicalData,
)
from backend.app.technical_data.infrastructure.postgres_technical_projects import (
    PostgresTechnicalProjects,
)
from backend.app.timing.application.pause_service import PauseService
from backend.app.timing.infrastructure.postgres_pauses import PostgresPauses


@lru_cache
def get_settings() -> Settings:
    return Settings()


@lru_cache
def _supabase_verifier(supabase_url: str) -> SupabaseJwtVerifier:
    """One verifier per process, so the downloaded keys are cached across requests."""
    return SupabaseJwtVerifier(supabase_url)


def token_verifier(settings: Annotated[Settings, Depends(get_settings)]) -> TokenVerifier:
    return _supabase_verifier(settings.supabase_url)


AuthenticateUnitOfWork = Callable[[], AbstractContextManager[Authenticate]]


def authenticate_unit_of_work(
    settings: Annotated[Settings, Depends(get_settings)],
    verifier: Annotated[TokenVerifier, Depends(token_verifier)],
) -> AuthenticateUnitOfWork:
    """Composition root for sign-in: the member lookup, the activation and its audit event
    share one transaction."""

    @contextmanager
    def open_unit() -> Iterator[Authenticate]:
        with identity_transaction(settings.database_url) as conn:
            yield Authenticate(verifier, PostgresMemberResolver(conn), PostgresAuditLog(conn))

    return open_unit


_AUTH_STATUS = {
    Unauthenticated: 401,
    NotInvited: 403,
    MemberRevoked: 403,
    MfaRequired: 403,
    EmailNotVerified: 403,
}


def study_http_error(error: StudyError, default_status: int = 422) -> HTTPException:
    """The `{detail: {code, message}}` answer shared by every study-context rejection."""
    status = _AUTH_STATUS.get(type(error), default_status)
    headers = {"WWW-Authenticate": "Bearer"} if status == 401 else None
    return HTTPException(
        status, detail={"code": error.code, "message": error.message}, headers=headers
    )


def _bearer_token(authorization: str | None) -> str:
    scheme, _, token = (authorization or "").partition(" ")
    if scheme.lower() != "bearer" or not token.strip():
        raise study_http_error(Unauthenticated())
    return token.strip()


def request_context(
    settings: Annotated[Settings, Depends(get_settings)],
    verifier: Annotated[TokenVerifier, Depends(token_verifier)],
    open_authenticate: Annotated[AuthenticateUnitOfWork, Depends(authenticate_unit_of_work)],
    authorization: Annotated[str | None, Header()] = None,
) -> RequestContext:
    """`AUTH_MODE=dev`: the fixed, fictitious development context. `AUTH_MODE=supabase`: the
    context of the invited member who owns the bearer token."""
    if settings.auth_mode == "dev":
        return RequestContext(
            study_id=settings.dev_study_id,
            user_id=settings.dev_user_id,
            role=Role(settings.dev_role),
            qualifications=frozenset(Qualification(h) for h in settings.dev_qualifications),
        )
    token = _bearer_token(authorization)
    try:
        # Signature and claims first: only a trustworthy token opens a database connection.
        claims = check_token(verifier, token)
        with open_authenticate() as authenticate:
            return authenticate.admit(claims)
    except StudyError as error:
        raise study_http_error(error) from error


MembersUnitOfWork = Callable[[RequestContext], AbstractContextManager[ManageMembers]]


def members_unit_of_work(settings: Annotated[Settings, Depends(get_settings)]) -> MembersUnitOfWork:
    """Composition root for the members: rows and audit in one transaction."""

    @contextmanager
    def open_unit(context: RequestContext) -> Iterator[ManageMembers]:
        with study_transaction(settings.database_url, context) as conn:
            yield ManageMembers(PostgresMembers(conn), PostgresAuditLog(conn))

    return open_unit


def project_roles(conn, settings: Settings, context: RequestContext) -> ProjectRoleReader:
    """Who holds which function in a project: the real assignments, except in `dev` mode."""
    if settings.auth_mode == "dev":
        return DevProjectRoles(context)
    return PostgresProjectMembers(conn)


ProjectMembersUnitOfWork = Callable[[RequestContext], AbstractContextManager[ManageProjectMembers]]


def project_members_unit_of_work(
    settings: Annotated[Settings, Depends(get_settings)],
) -> ProjectMembersUnitOfWork:
    """Composition root for the project team: assignments and audit in one transaction."""

    @contextmanager
    def open_unit(context: RequestContext) -> Iterator[ManageProjectMembers]:
        with study_transaction(settings.database_url, context) as conn:
            yield ManageProjectMembers(
                PostgresProjectDirectory(conn),
                PostgresProjectMembers(conn),
                PostgresMembers(conn),
                PostgresAuditLog(conn),
            )

    return open_unit


UnitOfWork = Callable[[RequestContext], AbstractContextManager[PromotionService]]


def unit_of_work(settings: Annotated[Settings, Depends(get_settings)]) -> UnitOfWork:
    """Composition root: one transaction per request with the study set."""

    @contextmanager
    def open_unit(context: RequestContext) -> Iterator[PromotionService]:
        with study_transaction(settings.database_url, context) as conn:
            yield PromotionService(
                PostgresLifecycle(conn),
                PostgresAuditLog(conn),
                VALIDATORS_BY_PHASE,
                project_roles(conn, settings, context),
            )

    return open_unit


OpportunityUnitOfWork = Callable[[RequestContext], AbstractContextManager[CreateOpportunity]]


def opportunity_unit_of_work(
    settings: Annotated[Settings, Depends(get_settings)],
) -> OpportunityUnitOfWork:
    """Composition root for creating opportunities: project, opportunity and audit in one
    transaction."""

    @contextmanager
    def open_unit(context: RequestContext) -> Iterator[CreateOpportunity]:
        with study_transaction(settings.database_url, context) as conn:
            yield CreateOpportunity(PostgresOpportunities(conn), PostgresAuditLog(conn))

    return open_unit


PortfolioUnitOfWork = Callable[[RequestContext], AbstractContextManager[PortfolioQueries]]


def portfolio_unit_of_work(
    settings: Annotated[Settings, Depends(get_settings)],
) -> PortfolioUnitOfWork:
    """Composition root for the portfolio reads: one RLS-scoped transaction per request."""

    @contextmanager
    def open_unit(context: RequestContext) -> Iterator[PortfolioQueries]:
        with study_transaction(settings.database_url, context) as conn:
            yield PortfolioQueries(PostgresProjects(conn))

    return open_unit


PlanUnitOfWork = Callable[[RequestContext], AbstractContextManager[PlanSettingsService]]


def plan_unit_of_work(settings: Annotated[Settings, Depends(get_settings)]) -> PlanUnitOfWork:
    """Composition root for the plan settings: one transaction per request."""

    @contextmanager
    def open_unit(context: RequestContext) -> Iterator[PlanSettingsService]:
        with study_transaction(settings.database_url, context) as conn:
            yield PlanSettingsService(PostgresPlanSettings(conn), PostgresAuditLog(conn))

    return open_unit


PauseUnitOfWork = Callable[[RequestContext], AbstractContextManager[PauseService]]


def pause_unit_of_work(settings: Annotated[Settings, Depends(get_settings)]) -> PauseUnitOfWork:
    """Composition root for pausing and resuming: row, flag and audit in one transaction."""

    @contextmanager
    def open_unit(context: RequestContext) -> Iterator[PauseService]:
        with study_transaction(settings.database_url, context) as conn:
            yield PauseService(
                PostgresPauses(conn),
                PostgresAuditLog(conn),
                project_roles(conn, settings, context),
            )

    return open_unit


ScoringUnitOfWork = Callable[[RequestContext], AbstractContextManager[ScoringService]]


def scoring_unit_of_work(settings: Annotated[Settings, Depends(get_settings)]) -> ScoringUnitOfWork:
    """Composition root for scoring: the frozen row and its audit in one transaction."""

    @contextmanager
    def open_unit(context: RequestContext) -> Iterator[ScoringService]:
        with study_transaction(settings.database_url, context) as conn:
            yield ScoringService(
                PostgresScorings(conn), PostgresScoringSettings(conn), PostgresAuditLog(conn)
            )

    return open_unit


ScoringSettingsUnitOfWork = Callable[
    [RequestContext], AbstractContextManager[ScoringSettingsService]
]


def scoring_settings_unit_of_work(
    settings: Annotated[Settings, Depends(get_settings)],
) -> ScoringSettingsUnitOfWork:
    """Composition root for the scoring settings: one transaction per request."""

    @contextmanager
    def open_unit(context: RequestContext) -> Iterator[ScoringSettingsService]:
        with study_transaction(settings.database_url, context) as conn:
            yield ScoringSettingsService(PostgresScoringSettings(conn), PostgresAuditLog(conn))

    return open_unit


StartProjectUnitOfWork = Callable[[RequestContext], AbstractContextManager[StartProject]]


def start_project_unit_of_work(
    settings: Annotated[Settings, Depends(get_settings)],
) -> StartProjectUnitOfWork:
    """Composition root for starting a project: plan, frozen content, promotion and audit in one
    transaction."""

    @contextmanager
    def open_unit(context: RequestContext) -> Iterator[StartProject]:
        with study_transaction(settings.database_url, context) as conn:
            audit_log = PostgresAuditLog(conn)
            yield StartProject(
                PostgresProjectPlans(conn),
                PostgresScorings(conn),
                PromotionService(
                    PostgresLifecycle(conn),
                    audit_log,
                    VALIDATORS_BY_PHASE,
                    project_roles(conn, settings, context),
                ),
                audit_log,
            )

    return open_unit


ProjectPlanUnitOfWork = Callable[[RequestContext], AbstractContextManager[ProjectPlanReader]]


def project_plan_unit_of_work(
    settings: Annotated[Settings, Depends(get_settings)],
) -> ProjectPlanUnitOfWork:
    """Composition root for reading the confirmed plan: one RLS-scoped transaction."""

    @contextmanager
    def open_unit(context: RequestContext) -> Iterator[ProjectPlanReader]:
        with study_transaction(settings.database_url, context) as conn:
            yield ProjectPlanReader(PostgresProjectPlans(conn))

    return open_unit


ProjectSheetUnitOfWork = Callable[[RequestContext], AbstractContextManager[GetProjectSheet]]


def project_sheet_unit_of_work(
    settings: Annotated[Settings, Depends(get_settings)],
) -> ProjectSheetUnitOfWork:
    """Composition root for reading the project sheet: one RLS-scoped transaction."""

    @contextmanager
    def open_unit(context: RequestContext) -> Iterator[GetProjectSheet]:
        with study_transaction(settings.database_url, context) as conn:
            yield GetProjectSheet(PostgresProjectSheets(conn), PostgresProjectPlans(conn))

    return open_unit


UpdateProjectSheetUnitOfWork = Callable[
    [RequestContext], AbstractContextManager[UpdateProjectSheet]
]


def update_project_sheet_unit_of_work(
    settings: Annotated[Settings, Depends(get_settings)],
) -> UpdateProjectSheetUnitOfWork:
    """Composition root for editing the sheet: content and audit in one transaction."""

    @contextmanager
    def open_unit(context: RequestContext) -> Iterator[UpdateProjectSheet]:
        with study_transaction(settings.database_url, context) as conn:
            yield UpdateProjectSheet(
                PostgresProjectSheets(conn), PostgresProjectPlans(conn), PostgresAuditLog(conn)
            )

    return open_unit


PromoteProjectSheetUnitOfWork = Callable[
    [RequestContext], AbstractContextManager[PromoteProjectSheet]
]


def promote_project_sheet_unit_of_work(
    settings: Annotated[Settings, Depends(get_settings)],
) -> PromoteProjectSheetUnitOfWork:
    """Composition root for promoting from phase 1: finalized content, frozen version, phase
    change, next deliverable and audit in one transaction."""

    @contextmanager
    def open_unit(context: RequestContext) -> Iterator[PromoteProjectSheet]:
        with study_transaction(settings.database_url, context) as conn:
            audit_log = PostgresAuditLog(conn)
            yield PromoteProjectSheet(
                PostgresProjectSheets(conn),
                PostgresProjectPlans(conn),
                PromotionService(
                    PostgresLifecycle(conn),
                    audit_log,
                    VALIDATORS_BY_PHASE,
                    project_roles(conn, settings, context),
                ),
                audit_log,
            )

    return open_unit


BriefUnitOfWork = Callable[[RequestContext], AbstractContextManager[GetBrief]]


def brief_unit_of_work(settings: Annotated[Settings, Depends(get_settings)]) -> BriefUnitOfWork:
    """Composition root for reading the brief: one RLS-scoped transaction."""

    @contextmanager
    def open_unit(context: RequestContext) -> Iterator[GetBrief]:
        with study_transaction(settings.database_url, context) as conn:
            yield GetBrief(
                PostgresBriefs(conn),
                PostgresTechnicalData(conn),
                project_roles(conn, settings, context),
            )

    return open_unit


UpdateBriefUnitOfWork = Callable[[RequestContext], AbstractContextManager[UpdateBrief]]


def update_brief_unit_of_work(
    settings: Annotated[Settings, Depends(get_settings)],
) -> UpdateBriefUnitOfWork:
    """Composition root for editing the brief: draft and audit in one transaction."""

    @contextmanager
    def open_unit(context: RequestContext) -> Iterator[UpdateBrief]:
        with study_transaction(settings.database_url, context) as conn:
            yield UpdateBrief(
                PostgresBriefs(conn),
                PostgresTechnicalData(conn),
                project_roles(conn, settings, context),
                PostgresAuditLog(conn),
            )

    return open_unit


PromoteBriefUnitOfWork = Callable[[RequestContext], AbstractContextManager[PromoteBrief]]


def promote_brief_unit_of_work(
    settings: Annotated[Settings, Depends(get_settings)],
) -> PromoteBriefUnitOfWork:
    """Composition root for promoting from phase 2: finalized content, frozen version, phase
    change, next deliverable and audit in one transaction."""

    @contextmanager
    def open_unit(context: RequestContext) -> Iterator[PromoteBrief]:
        with study_transaction(settings.database_url, context) as conn:
            audit_log = PostgresAuditLog(conn)
            roles = project_roles(conn, settings, context)
            yield PromoteBrief(
                PostgresBriefs(conn),
                PostgresTechnicalData(conn),
                roles,
                PromotionService(PostgresLifecycle(conn), audit_log, VALIDATORS_BY_PHASE, roles),
                audit_log,
            )

    return open_unit


@lru_cache
def _http_cadastre_gateway() -> HttpCadastreGateway:
    """One HTTP client per process, so connections to the Catastro are reused."""
    return HttpCadastreGateway()


def cadastre_gateway() -> CadastreGateway:
    return _http_cadastre_gateway()


CadastreUnitOfWork = Callable[[RequestContext], AbstractContextManager[GetCadastralProperty]]


def cadastre_unit_of_work(
    settings: Annotated[Settings, Depends(get_settings)],
    gateway: Annotated[CadastreGateway, Depends(cadastre_gateway)],
) -> CadastreUnitOfWork:
    """Composition root for the cadastre lookup. No connection is taken here: the use case
    opens one short transaction to read the study's cache and, only on a miss, another to store
    the answer, so the (slow) Catastro call runs with the pool untouched."""

    @contextmanager
    def open_unit(context: RequestContext) -> Iterator[GetCadastralProperty]:
        @contextmanager
        def open_cache() -> Iterator[PostgresCadastreCache]:
            with study_transaction(settings.database_url, context) as conn:
                yield PostgresCadastreCache(conn)

        yield GetCadastralProperty(gateway, open_cache)

    return open_unit


@lru_cache
def _http_plot_gateway() -> HttpPlotGateway:
    """One HTTP client per process, so connections to the INSPIRE WFS are reused."""
    return HttpPlotGateway()


def plot_gateway() -> PlotGateway:
    return _http_plot_gateway()


PlotUnitOfWork = Callable[[RequestContext], AbstractContextManager[GetPlotGeometry]]


def plot_unit_of_work(
    settings: Annotated[Settings, Depends(get_settings)],
    gateway: Annotated[PlotGateway, Depends(plot_gateway)],
) -> PlotUnitOfWork:
    """Composition root for the plot lookup. As for the cadastre lookup, no connection is taken
    here: each cache access is its own short transaction, so the (slow) WFS call runs with the
    pool untouched."""

    @contextmanager
    def open_unit(context: RequestContext) -> Iterator[GetPlotGeometry]:
        @contextmanager
        def open_cache() -> Iterator[PostgresPlotCache]:
            with study_transaction(settings.database_url, context) as conn:
                yield PostgresPlotCache(conn)

        yield GetPlotGeometry(gateway, open_cache)

    return open_unit


@lru_cache
def _http_elevation_gateway() -> HttpElevationGateway:
    """One HTTP client per process, so connections to Open-Meteo are reused."""
    return HttpElevationGateway()


def elevation_gateway() -> ElevationGateway:
    return _http_elevation_gateway()


@lru_cache
def _http_pv_gateway() -> HttpPvGateway:
    """One HTTP client per process, so connections to PVGIS are reused."""
    return HttpPvGateway()


def pv_gateway() -> PvGateway:
    return _http_pv_gateway()


TerrainUnitOfWork = Callable[[RequestContext], AbstractContextManager[GetTerrainProfile]]


def terrain_unit_of_work(
    settings: Annotated[Settings, Depends(get_settings)],
    open_plot: Annotated[PlotUnitOfWork, Depends(plot_unit_of_work)],
    gateway: Annotated[ElevationGateway, Depends(elevation_gateway)],
) -> TerrainUnitOfWork:
    """Composition root for the terrain lookup. As for the plot, no connection is taken here:
    each cache access is its own short transaction, so the (slow) services run with the pool
    untouched."""

    @contextmanager
    def open_unit(context: RequestContext) -> Iterator[GetTerrainProfile]:
        @contextmanager
        def open_cache() -> Iterator[PostgresTerrainCache]:
            with study_transaction(settings.database_url, context) as conn:
                yield PostgresTerrainCache(conn)

        with open_plot(context) as get_plot:
            yield GetTerrainProfile(get_plot, gateway, open_cache)

    return open_unit


PvUnitOfWork = Callable[[RequestContext], AbstractContextManager[GetPvYield]]


def pv_unit_of_work(
    settings: Annotated[Settings, Depends(get_settings)],
    open_plot: Annotated[PlotUnitOfWork, Depends(plot_unit_of_work)],
    gateway: Annotated[PvGateway, Depends(pv_gateway)],
) -> PvUnitOfWork:
    """Composition root for the photovoltaic yield: short cache transactions, none open while
    a service answers."""

    @contextmanager
    def open_unit(context: RequestContext) -> Iterator[GetPvYield]:
        @contextmanager
        def open_cache() -> Iterator[PostgresPvCache]:
            with study_transaction(settings.database_url, context) as conn:
                yield PostgresPvCache(conn)

        with open_plot(context) as get_plot:
            yield GetPvYield(get_plot, gateway, open_cache)

    return open_unit


TechnicalDataUnitOfWork = Callable[[RequestContext], AbstractContextManager[TechnicalDataUseCases]]


def technical_data_unit_of_work(
    settings: Annotated[Settings, Depends(get_settings)],
) -> TechnicalDataUnitOfWork:
    """Composition root for reading and changing technical data: rows and audit in one
    transaction."""

    @contextmanager
    def open_unit(context: RequestContext) -> Iterator[TechnicalDataUseCases]:
        with study_transaction(settings.database_url, context) as conn:
            projects = PostgresTechnicalProjects(conn)
            data = PostgresTechnicalData(conn)
            roles = project_roles(conn, settings, context)
            audit_log = PostgresAuditLog(conn)
            yield TechnicalDataUseCases(
                get=GetTechnicalData(projects, data),
                capacity=GetCapacity(projects, data),
                alerts=GetAlerts(projects, data, PostgresProjectFacts(conn)),
                edit=EditDatum(projects, data, roles, audit_log),
                restore=RestoreDatum(projects, data, roles, audit_log),
                verify=VerifyDatum(projects, data, roles, audit_log),
                verify_all=VerifyAll(projects, data, roles, audit_log),
            )

    return open_unit


RefreshTechnicalDataUnitOfWork = Callable[
    [RequestContext], AbstractContextManager[RefreshTechnicalData]
]


def refresh_technical_data_unit_of_work(
    settings: Annotated[Settings, Depends(get_settings)],
    open_cadastre: Annotated[CadastreUnitOfWork, Depends(cadastre_unit_of_work)],
    open_plot: Annotated[PlotUnitOfWork, Depends(plot_unit_of_work)],
    open_terrain: Annotated[TerrainUnitOfWork, Depends(terrain_unit_of_work)],
    open_pv: Annotated[PvUnitOfWork, Depends(pv_unit_of_work)],
) -> RefreshTechnicalDataUnitOfWork:
    """Composition root for 'query again'. No connection is taken here: the use case opens a
    short transaction to check authority, calls the Catastro, INSPIRE, Open-Meteo and PVGIS with
    none open (each cache access is its own short transaction), and opens another to write the
    data and their audit."""

    @contextmanager
    def open_unit(context: RequestContext) -> Iterator[RefreshTechnicalData]:
        @contextmanager
        def open_session() -> Iterator[RefreshSession]:
            with study_transaction(settings.database_url, context) as conn:
                yield RefreshSession(
                    PostgresTechnicalProjects(conn),
                    PostgresTechnicalData(conn),
                    project_roles(conn, settings, context),
                    PostgresAuditLog(conn),
                )

        with (
            open_cadastre(context) as get_property,
            open_plot(context) as get_plot,
            open_terrain(context) as get_terrain,
            open_pv(context) as get_pv,
        ):
            yield RefreshTechnicalData(
                get_property,
                open_session,
                get_plot=get_plot,
                get_terrain=get_terrain,
                get_pv=get_pv,
            )

    return open_unit

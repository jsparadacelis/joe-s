"""FastAPI dependencies shared by the routes."""

from __future__ import annotations

from collections.abc import Callable, Iterator
from contextlib import AbstractContextManager, contextmanager
from functools import lru_cache
from typing import Annotated

from fastapi import Depends

from backend.app.audit.infrastructure.postgres_audit_log import PostgresAuditLog
from backend.app.lifecycle.application.promotion_service import PromotionService
from backend.app.lifecycle.application.validators import VALIDATORS_BY_PHASE
from backend.app.lifecycle.infrastructure.postgres_lifecycle import PostgresLifecycle
from backend.app.opportunity.application.create_opportunity import CreateOpportunity
from backend.app.opportunity.application.plan_settings import PlanSettingsService
from backend.app.opportunity.application.scoring import ScoringService, ScoringSettingsService
from backend.app.opportunity.infrastructure.postgres_opportunity import PostgresOpportunities
from backend.app.opportunity.infrastructure.postgres_plan_settings import PostgresPlanSettings
from backend.app.opportunity.infrastructure.postgres_scoring import (
    PostgresScorings,
    PostgresScoringSettings,
)
from backend.app.portfolio.application.queries import PortfolioQueries
from backend.app.portfolio.infrastructure.postgres_projects import PostgresProjects
from backend.app.shared.config import Settings
from backend.app.shared.db import study_transaction
from backend.app.study.domain.context import Qualification, RequestContext, Role
from backend.app.timing.application.pause_service import PauseService
from backend.app.timing.infrastructure.postgres_pauses import PostgresPauses


@lru_cache
def get_settings() -> Settings:
    return Settings()


def request_context(
    settings: Annotated[Settings, Depends(get_settings)],
) -> RequestContext:
    """Fixed, fictitious development context. RGB-2 replaces it with the real session."""
    return RequestContext(
        study_id=settings.dev_study_id,
        user_id=settings.dev_user_id,
        role=Role(settings.dev_role),
        qualifications=frozenset(Qualification(h) for h in settings.dev_qualifications),
    )


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
            yield PauseService(PostgresPauses(conn), PostgresAuditLog(conn))

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

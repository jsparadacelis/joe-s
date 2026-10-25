"""Opportunity routes: create an opportunity, read the portfolio and a project."""

from __future__ import annotations

from dataclasses import asdict
from datetime import datetime, timezone
from typing import Annotated, Any

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, RootModel

from backend.app.api.dependencies import (
    OpportunityUnitOfWork,
    PortfolioUnitOfWork,
    ProjectPlanUnitOfWork,
    ProjectSheetUnitOfWork,
    StartProjectUnitOfWork,
    UpdateProjectSheetUnitOfWork,
    opportunity_unit_of_work,
    portfolio_unit_of_work,
    project_plan_unit_of_work,
    project_sheet_unit_of_work,
    request_context,
    start_project_unit_of_work,
    update_project_sheet_unit_of_work,
)
from backend.app.lifecycle.domain.errors import IncompleteDeliverable, NoAuthority
from backend.app.opportunity.domain.errors import (
    OpportunityError,
    PlanAlreadyConfirmed,
    PlanNotFound,
    ProjectNotInOpportunityPhase,
    SheetFieldError,
    SheetNotEditable,
    SheetNotFound,
)
from backend.app.opportunity.domain.errors import (
    ProjectNotFound as OpportunityProjectNotFound,
)
from backend.app.portfolio.domain.errors import ProjectNotFound
from backend.app.study.domain.context import RequestContext

router = APIRouter(prefix="/api", tags=["opportunity"])

Context = Annotated[RequestContext, Depends(request_context)]
CreateUnit = Annotated[OpportunityUnitOfWork, Depends(opportunity_unit_of_work)]
ReadUnit = Annotated[PortfolioUnitOfWork, Depends(portfolio_unit_of_work)]
StartUnit = Annotated[StartProjectUnitOfWork, Depends(start_project_unit_of_work)]
PlanUnit = Annotated[ProjectPlanUnitOfWork, Depends(project_plan_unit_of_work)]
SheetUnit = Annotated[ProjectSheetUnitOfWork, Depends(project_sheet_unit_of_work)]
UpdateSheetUnit = Annotated[
    UpdateProjectSheetUnitOfWork, Depends(update_project_sheet_unit_of_work)
]

_START_STATUS = {
    NoAuthority: 403,
    IncompleteDeliverable: 422,
    ProjectNotInOpportunityPhase: 409,
    PlanAlreadyConfirmed: 409,
}

_SHEET_STATUS = {NoAuthority: 403, SheetNotEditable: 409}


# Values are typed as Any on purpose: the domain is the single place that validates them, so
# every bad type or range answers with the same `required_field` / `invalid_field` error.
class OpportunityInput(RootModel[dict[str, Any]]):
    pass


def _iso(value: Any) -> str | None:
    return None if value is None else value.isoformat()


def _pause_json(pause: Any) -> dict[str, Any] | None:
    if pause is None:
        return None
    return {
        "reason": pause.reason,
        "expected_resumption": pause.expected_resumption.isoformat(),
        "overdue": pause.overdue,
        "days_overdue": pause.days_overdue,
    }


@router.post("/opportunities", status_code=201)
def create_opportunity(body: OpportunityInput, context: Context, open_unit: CreateUnit) -> dict:
    try:
        with open_unit(context) as use_case:
            created = use_case.execute(context, body.root)
    except OpportunityError as error:
        raise HTTPException(
            422, detail={"code": error.code, "message": error.message, "field": error.field}
        ) from error
    data = created.opportunity
    return {
        "code": created.code,
        "name": data.name,
        "phase": created.phase,
        "status": "no_plan",
        "client": data.client,
        "location": data.location,
        "project_type": data.project_type.value,
        "owner": data.owner,
        "estimated_budget": None if data.estimated_budget is None else float(data.estimated_budget),
        "deadline": _iso(data.deadline),
        "source": data.source,
        "decision_date": _iso(data.decision_date),
    }


@router.get("/portfolio")
def get_portfolio(context: Context, open_unit: ReadUnit) -> dict:
    with open_unit(context) as queries:
        portfolio = queries.portfolio()
    return {
        "as_of": portfolio.as_of.isoformat(),
        "projects": [
            {
                "code": entry.code,
                "name": entry.name,
                "phase": entry.phase,
                "status": entry.status,
                "next_milestone": (
                    None
                    if entry.next_milestone is None
                    else {"name": entry.next_milestone, "date": None}
                ),
                "owner_id": entry.owner_id,
                "owner_name": None,
                "blocker": None,
                "days_since_update": entry.days_since_update,
                "phase_weeks": None,
                "pause": _pause_json(entry.pause),
            }
            for entry in portfolio.entries
        ],
    }


@router.get("/projects/{code}")
def get_project(code: str, context: Context, open_unit: ReadUnit) -> dict:
    try:
        with open_unit(context) as queries:
            project = queries.project(code)
    except ProjectNotFound as error:
        raise HTTPException(404, detail={"code": error.code, "message": str(error)}) from error
    return {
        "code": project.code,
        "name": project.name,
        "current_phase": project.current_phase,
        "project_type": project.project_type,
    }


# Typed as Any on purpose: the domain validates scale and weeks, so every bad value answers
# with its own `invalid_scale` / `invalid_weeks` error and gets audited.
class StartInput(BaseModel):
    scale: Any
    weeks: Any


def _utc(value: datetime) -> str:
    return value.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def _not_found(error: Exception, code: str) -> HTTPException:
    return HTTPException(404, detail={"code": code, "message": str(error)})


@router.post("/projects/{code}/start")
def start_project(code: str, body: StartInput, context: Context, open_unit: StartUnit) -> dict:
    try:
        with open_unit(context) as use_case:
            result = use_case.execute(context, code, body.scale, body.weeks)
    except OpportunityProjectNotFound as error:
        raise _not_found(error, error.code) from error
    # The transaction has already committed: the rejection is audited before responding.
    transition = result.transition
    if not transition.ok:
        error = transition.error
        details = error.details() if hasattr(error, "details") else {}
        raise HTTPException(
            _START_STATUS.get(type(error), 422),
            detail={"code": error.code, "message": error.message, **details},
        )
    plan = result.plan
    return {
        "code": code,
        "action": transition.action,
        "previous_phase": transition.previous_phase,
        "current_phase": transition.current_phase,
        "frozen_version": transition.frozen_version,
        "plan": {
            "project_type": plan.project_type.value,
            "scale": plan.scale.value,
            "weeks_by_phase": plan.weeks_by_phase,
            "total": plan.total,
        },
    }


@router.get("/projects/{code}/plan")
def get_project_plan(code: str, context: Context, open_unit: PlanUnit) -> dict:
    try:
        with open_unit(context) as reader:
            plan = reader.read(code)
    except (OpportunityProjectNotFound, PlanNotFound) as error:
        raise _not_found(error, error.code) from error
    return {
        "project_type": plan.project_type.value,
        "scale": plan.scale.value,
        "weeks_by_phase": plan.weeks_by_phase,
        "total": plan.total,
        "confirmed_at": _utc(plan.confirmed_at),
        "confirmed_by": plan.confirmed_by,
    }


@router.get("/projects/{code}/sheet")
def get_project_sheet(code: str, context: Context, open_unit: SheetUnit) -> dict:
    try:
        with open_unit(context) as reader:
            sheet = reader.read(code)
    except (OpportunityProjectNotFound, SheetNotFound) as error:
        raise _not_found(error, error.code) from error
    return asdict(sheet)


# Typed as Any on purpose: the domain validates fields and plan, so every bad value answers
# with its own error code and gets audited.
class SheetUpdateInput(BaseModel):
    fields: Any = None
    plan: Any = None


@router.put("/projects/{code}/sheet")
def update_project_sheet(
    code: str, body: SheetUpdateInput, context: Context, open_unit: UpdateSheetUnit
) -> dict:
    try:
        with open_unit(context) as writer:
            result = writer.execute(context, code, body.fields, body.plan)
    except OpportunityProjectNotFound as error:
        raise _not_found(error, error.code) from error
    # The transaction has already committed: the rejection is audited before responding.
    if result.error is not None:
        error = result.error
        detail = {"code": error.code, "message": error.message}
        if isinstance(error, SheetFieldError):
            detail["field"] = error.field
        elif hasattr(error, "details"):
            detail.update(error.details())
        raise HTTPException(_SHEET_STATUS.get(type(error), 422), detail=detail)
    return asdict(result.sheet)

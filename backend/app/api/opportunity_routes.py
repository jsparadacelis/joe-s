"""Opportunity routes: create an opportunity, read the portfolio and a project."""

from __future__ import annotations

from typing import Annotated, Any

from fastapi import APIRouter, Depends, HTTPException
from pydantic import RootModel

from backend.app.api.dependencies import (
    OpportunityUnitOfWork,
    PortfolioUnitOfWork,
    opportunity_unit_of_work,
    portfolio_unit_of_work,
    request_context,
)
from backend.app.opportunity.domain.errors import OpportunityError
from backend.app.portfolio.domain.errors import ProjectNotFound
from backend.app.study.domain.context import RequestContext

router = APIRouter(prefix="/api", tags=["opportunity"])

Context = Annotated[RequestContext, Depends(request_context)]
CreateUnit = Annotated[OpportunityUnitOfWork, Depends(opportunity_unit_of_work)]
ReadUnit = Annotated[PortfolioUnitOfWork, Depends(portfolio_unit_of_work)]


# Values are typed as Any on purpose: the domain is the single place that validates them, so
# every bad type or range answers with the same `required_field` / `invalid_field` error.
class OpportunityInput(RootModel[dict[str, Any]]):
    pass


def _iso(value: Any) -> str | None:
    return None if value is None else value.isoformat()


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
    return {"code": project.code, "name": project.name, "current_phase": project.current_phase}

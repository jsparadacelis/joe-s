"""Plan routes: build a plan and edit the study's plan settings."""

from __future__ import annotations

from typing import Annotated, Any

from fastapi import APIRouter, Depends, HTTPException, Response
from pydantic import BaseModel

from backend.app.api.dependencies import PlanUnitOfWork, plan_unit_of_work, request_context
from backend.app.opportunity.domain.errors import PlanSettingsError
from backend.app.opportunity.domain.plan import ProjectType, Scale
from backend.app.study.domain.context import RequestContext

router = APIRouter(prefix="/api", tags=["plan"])

Context = Annotated[RequestContext, Depends(request_context)]
Unit = Annotated[PlanUnitOfWork, Depends(plan_unit_of_work)]


# Typed as Any on purpose: the domain is the single place that validates values, so every
# bad type or range answers with the same `invalid_weeks` / `invalid_factor` error.
class WeeksInput(BaseModel):
    weeks: Any


class FactorInput(BaseModel):
    factor: Any


def _rejected(error: PlanSettingsError) -> HTTPException:
    return HTTPException(422, detail={"code": error.code, "message": error.message})


@router.get("/plan")
def get_plan(project_type: ProjectType, scale: Scale, context: Context, open_unit: Unit) -> dict:
    with open_unit(context) as service:
        plan = service.make_plan(project_type, scale)
    return {
        "project_type": project_type.value,
        "scale": scale.value,
        "weeks_by_phase": plan.weeks_by_phase,
        "total": plan.total,
    }


@router.get("/settings/plan")
def get_plan_settings(context: Context, open_unit: Unit) -> dict:
    with open_unit(context) as service:
        settings = service.get_settings()
    return {
        "templates": {t.value: list(weeks) for t, weeks in settings.templates.items()},
        "scale_factors": {s.value: float(f) for s, f in settings.scale_factors.items()},
    }


@router.put("/settings/plan/templates/{project_type}", status_code=204)
def update_template(
    project_type: ProjectType, body: WeeksInput, context: Context, open_unit: Unit
) -> Response:
    try:
        with open_unit(context) as service:
            service.update_template(context, project_type, body.weeks)
    except PlanSettingsError as error:
        raise _rejected(error) from error
    return Response(status_code=204)


@router.put("/settings/plan/scale-factors/{scale}", status_code=204)
def update_scale_factor(
    scale: Scale, body: FactorInput, context: Context, open_unit: Unit
) -> Response:
    try:
        with open_unit(context) as service:
            service.update_scale_factor(context, scale, body.factor)
    except PlanSettingsError as error:
        raise _rejected(error) from error
    return Response(status_code=204)

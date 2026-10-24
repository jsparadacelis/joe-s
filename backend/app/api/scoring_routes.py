"""Scoring routes: the study's scoring settings and the scoring of an opportunity."""

from __future__ import annotations

from datetime import timezone
from typing import Annotated, Any

from fastapi import APIRouter, Depends, HTTPException, Response
from pydantic import RootModel

from backend.app.api.dependencies import (
    ScoringSettingsUnitOfWork,
    ScoringUnitOfWork,
    request_context,
    scoring_settings_unit_of_work,
    scoring_unit_of_work,
)
from backend.app.opportunity.domain.errors import ProjectNotFound, ScoringError
from backend.app.opportunity.domain.scoring import Scoring
from backend.app.study.domain.context import RequestContext

router = APIRouter(prefix="/api", tags=["scoring"])

Context = Annotated[RequestContext, Depends(request_context)]
SettingsUnit = Annotated[ScoringSettingsUnitOfWork, Depends(scoring_settings_unit_of_work)]
Unit = Annotated[ScoringUnitOfWork, Depends(scoring_unit_of_work)]

_HTTP_STATUS = {"not_an_opportunity": 409, "scoring_not_found": 404}


# Typed as Any on purpose: the domain is the single place that validates the values, so every
# bad type or range answers with the same `invalid_*` error.
class AnyBody(RootModel[Any]):
    pass


def _rejected(error: ScoringError) -> HTTPException:
    detail: dict[str, Any] = {"code": error.code, "message": error.message}
    if error.field is not None:
        detail["field"] = error.field
    return HTTPException(_HTTP_STATUS.get(error.code, 422), detail=detail)


def _not_found(error: ProjectNotFound) -> HTTPException:
    return HTTPException(404, detail={"code": error.code, "message": str(error)})


def _utc(value: Any) -> str:
    return value.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def _scoring_json(scoring: Scoring) -> dict[str, Any]:
    return {
        "project_code": scoring.project_code,
        "version": scoring.version,
        "ratings": {c.value: r for c, r in scoring.ratings.items()},
        "weights": {c.value: float(w) for c, w in scoring.weights.items()},
        "threshold": scoring.threshold,
        "score": float(scoring.score),
        "recommendation": scoring.recommendation.value,
        "scored_by": scoring.scored_by,
        "scored_at": _utc(scoring.scored_at),
    }


@router.get("/settings/scoring")
def get_scoring_settings(context: Context, open_unit: SettingsUnit) -> dict:
    with open_unit(context) as service:
        settings = service.get_settings()
    return {
        "weights": {c.value: float(w) for c, w in settings.weights.items()},
        "threshold": settings.threshold,
    }


@router.put("/settings/scoring", status_code=204)
def update_scoring_settings(body: AnyBody, context: Context, open_unit: SettingsUnit) -> Response:
    try:
        with open_unit(context) as service:
            service.update(context, body.root)
    except ScoringError as error:
        raise _rejected(error) from error
    return Response(status_code=204)


@router.post("/projects/{code}/scoring", status_code=201)
def score_opportunity(code: str, body: AnyBody, context: Context, open_unit: Unit) -> dict:
    try:
        with open_unit(context) as service:
            scoring = service.score(context, code, body.root)
    except ProjectNotFound as error:
        raise _not_found(error) from error
    except ScoringError as error:
        raise _rejected(error) from error
    return _scoring_json(scoring)


@router.get("/projects/{code}/scoring")
def get_scoring(code: str, context: Context, open_unit: Unit) -> dict:
    try:
        with open_unit(context) as service:
            view = service.read(code)
    except ProjectNotFound as error:
        raise _not_found(error) from error
    except ScoringError as error:
        raise _rejected(error) from error
    return {
        **_scoring_json(view.latest),
        "history": [
            {
                "version": s.version,
                "score": float(s.score),
                "recommendation": s.recommendation.value,
                "scored_at": _utc(s.scored_at),
            }
            for s in view.history
        ],
    }

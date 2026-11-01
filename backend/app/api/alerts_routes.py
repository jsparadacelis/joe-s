"""Cross-data alerts route: read only, open to any member of the study.

The alerts are computed on every read from the saved technical data and the project sheet. They
only inform: this route writes nothing and an alert never changes a datum or a state.
"""

from __future__ import annotations

from typing import Annotated, Any

from fastapi import APIRouter, Depends, HTTPException

from backend.app.api.dependencies import (
    TechnicalDataUnitOfWork,
    request_context,
    technical_data_unit_of_work,
)
from backend.app.study.domain.context import RequestContext
from backend.app.technical_data.domain.alerts import Alert

router = APIRouter(prefix="/api/projects/{code}/alerts", tags=["alerts"])

Context = Annotated[RequestContext, Depends(request_context)]
Unit = Annotated[TechnicalDataUnitOfWork, Depends(technical_data_unit_of_work)]


def _alert_json(alert: Alert) -> dict[str, Any]:
    return {
        "code": alert.code,
        "severity": alert.severity.value,
        "message": alert.message,
        "suggestion": alert.suggestion,
        "fields": list(alert.fields),
    }


@router.get("")
def get_alerts(code: str, context: Context, open_unit: Unit) -> dict:
    with open_unit(context) as use_cases:
        answer = use_cases.alerts.execute(context, code)
    if answer.error is not None:
        error: Any = answer.error
        raise HTTPException(404, detail={"code": error.code, "message": error.message})
    return {"alerts": [_alert_json(alert) for alert in answer.alerts]}

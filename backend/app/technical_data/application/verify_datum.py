"""A person confirms one technical datum."""

from __future__ import annotations

from backend.app.study.domain.context import RequestContext
from backend.app.technical_data.application.common import TechnicalDataResult
from backend.app.technical_data.application.datum_operation import DatumOperation


class VerifyDatum(DatumOperation):
    action = "verify"
    fields = ("verified",)

    def execute(self, context: RequestContext, code: str, field_id: str) -> TechnicalDataResult:
        return self._apply(context, code, field_id, lambda sheet: sheet.verify(field_id))

"""Put a technical datum back to the value it came with."""

from __future__ import annotations

from backend.app.study.domain.context import RequestContext
from backend.app.technical_data.application.common import TechnicalDataResult
from backend.app.technical_data.application.datum_operation import DatumOperation


class RestoreDatum(DatumOperation):
    action = "restore"

    def execute(self, context: RequestContext, code: str, field_id: str) -> TechnicalDataResult:
        return self._apply(context, code, field_id, lambda sheet: sheet.restore(field_id))

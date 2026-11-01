"""Correct the value of a technical datum. The original is kept; it must be verified again."""

from __future__ import annotations

from typing import Any

from backend.app.study.domain.context import RequestContext
from backend.app.technical_data.application.common import TechnicalDataResult, clip
from backend.app.technical_data.application.datum_operation import DatumOperation


class EditDatum(DatumOperation):
    action = "edit"

    def execute(
        self, context: RequestContext, code: str, field_id: str, value: Any
    ) -> TechnicalDataResult:
        return self._apply(
            context,
            code,
            field_id,
            lambda sheet: sheet.edit(field_id, value),
            asked={"value": clip(value)},
        )

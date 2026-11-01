"""The operations on one datum (edit, restore, verify) differ only in what they do to it."""

from __future__ import annotations

from collections.abc import Callable
from typing import Any

from backend.app.study.domain.context import RequestContext
from backend.app.technical_data.application.common import (
    ENTITY_DATUM,
    SheetWriter,
    TechnicalDataResult,
)
from backend.app.technical_data.domain.errors import TechnicalDataError
from backend.app.technical_data.domain.technical_data import TechnicalData


class DatumOperation(SheetWriter):
    action: str
    # What the audit log keeps of a datum before and after.
    fields: tuple[str, ...] = ("value", "verified")

    def _apply(
        self,
        context: RequestContext,
        code: str,
        field_id: str,
        change: Callable[[TechnicalData], TechnicalData],
        asked: dict[str, Any] | None = None,
    ) -> TechnicalDataResult:
        entity_id = f"{code}/{field_id}"
        project, refusal = self.admit(
            context, code, entity=ENTITY_DATUM, entity_id=entity_id, action=self.action, asked=asked
        )
        if refusal is not None:
            return refusal
        sheet = self._data.load(project.id)
        try:
            changed = change(sheet)
        except TechnicalDataError as error:
            return self.reject(
                context,
                error,
                entity=ENTITY_DATUM,
                entity_id=entity_id,
                action=self.action,
                asked=asked,
            )
        self._data.save(project.id, changed.changes_since(sheet))
        self.record(
            context,
            entity=ENTITY_DATUM,
            entity_id=entity_id,
            action=self.action,
            old_value=self._summary(sheet, field_id),
            new_value=self._summary(changed, field_id),
        )
        return TechnicalDataResult(sheet=changed)

    def _summary(self, sheet: TechnicalData, field_id: str) -> dict[str, Any]:
        datum = sheet.get(field_id)
        return {name: getattr(datum, name) for name in self.fields}

"""A person confirms every technical datum that has a value."""

from __future__ import annotations

from backend.app.study.domain.context import RequestContext
from backend.app.technical_data.application.common import (
    ENTITY_SHEET,
    SheetWriter,
    TechnicalDataResult,
)

ACTION = "verify_all"


class VerifyAll(SheetWriter):
    def execute(self, context: RequestContext, code: str) -> TechnicalDataResult:
        project, refusal = self.admit(
            context, code, entity=ENTITY_SHEET, entity_id=code, action=ACTION
        )
        if refusal is not None:
            return refusal
        sheet = self._data.load(project.id)
        verified = sheet.verify_all()
        changes = verified.changes_since(sheet)
        self._data.save(project.id, changes)
        ids = [datum.field_id for datum in changes]
        self.record(
            context,
            entity=ENTITY_SHEET,
            entity_id=code,
            action=ACTION,
            old_value={"unverified": ids},
            new_value={"verified": ids},
        )
        return TechnicalDataResult(sheet=verified)

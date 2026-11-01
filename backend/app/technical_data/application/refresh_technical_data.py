"""'Query again': fill the data from the Catastro without losing what people did.

Three steps so that no database connection is held while the (slow) Catastro answers:
authority and phase in a first short unit of work, the Catastro with none open, and the write
(re-checking the phase, which may have changed meanwhile) in a second one. If the Catastro
fails, nothing is written; the person enters the data by hand.
"""

from __future__ import annotations

from collections.abc import Callable
from contextlib import AbstractContextManager
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any

from backend.app.access.domain.ports import ProjectRoleReader
from backend.app.audit.domain.ports import AuditLog
from backend.app.external_data.application.get_cadastral_property import GetCadastralProperty
from backend.app.study.domain.context import RequestContext
from backend.app.technical_data.application.cadastral_mapping import CADASTRE_FIELDS, map_property
from backend.app.technical_data.application.common import (
    ENTITY_SHEET,
    SheetWriter,
    TechnicalDataResult,
    clip,
)
from backend.app.technical_data.domain.ports import (
    QueryRecord,
    TechnicalDataRepository,
    TechnicalProjects,
)
from backend.app.technical_data.domain.technical_data import TechnicalData

ACTION = "refresh"


@dataclass(frozen=True)
class RefreshSession:
    """The ports of one short unit of work (a transaction)."""

    projects: TechnicalProjects
    data: TechnicalDataRepository
    roles: ProjectRoleReader
    audit_log: AuditLog


OpenSession = Callable[[], AbstractContextManager[RefreshSession]]


def _utc_now() -> datetime:
    return datetime.now(timezone.utc)


def _summary(sheet: TechnicalData, field_ids: list[str]) -> dict[str, dict[str, Any]]:
    result = {}
    for field_id in field_ids:
        datum = sheet.get(field_id)
        result[field_id] = {
            "value": datum.value,
            "original": datum.original,
            "verified": datum.verified,
        }
    return result


class RefreshTechnicalData:
    def __init__(
        self,
        get_property: GetCadastralProperty,
        open_session: OpenSession,
        clock: Callable[[], datetime] = _utc_now,
    ) -> None:
        self._get_property = get_property
        self._open_session = open_session
        self._clock = clock

    def execute(
        self, context: RequestContext, code: str, raw_reference: str
    ) -> TechnicalDataResult:
        """Raises `InvalidCadastralReference`, `CadastreNotFound` or `CadastreUnavailable`
        (nothing is written then). Every other refusal is returned."""
        asked = {"cadastral_reference": clip(raw_reference)}
        with self._open_session() as session:
            _, refusal = self._writer(session).admit(
                context, code, entity=ENTITY_SHEET, entity_id=code, action=ACTION, asked=asked
            )
        if refusal is not None:
            return refusal

        found = self._get_property.execute(raw_reference)

        with self._open_session() as session:
            writer = self._writer(session)
            project, refusal = writer.admit(
                context, code, entity=ENTITY_SHEET, entity_id=code, action=ACTION, asked=asked
            )
            if refusal is not None:
                return refusal
            before = session.data.load(project.id)
            queried = map_property(found)
            outcome = before.refresh(queried)
            changes = outcome.sheet.changes_since(before)
            changed_ids = [datum.field_id for datum in changes]
            unmapped = tuple(
                field_id
                for field_id in CADASTRE_FIELDS
                if field_id not in queried or field_id in outcome.not_applied
            )
            queried_at = self._clock()
            session.data.save(project.id, changes)
            session.data.record_query(project.id, found.reference, queried_at)
            writer.record(
                context,
                entity=ENTITY_SHEET,
                entity_id=code,
                action=ACTION,
                old_value=_summary(before, changed_ids),
                new_value={
                    "cadastral_reference": found.reference,
                    "changed": _summary(outcome.sheet, changed_ids),
                    "unmapped": list(unmapped),
                },
            )
        return TechnicalDataResult(
            sheet=outcome.sheet,
            last_query=QueryRecord(found.reference, queried_at),
            unmapped=unmapped,
        )

    @staticmethod
    def _writer(session: RefreshSession) -> SheetWriter:
        return SheetWriter(session.projects, session.data, session.roles, session.audit_log)

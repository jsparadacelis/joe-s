"""'Query again': fill the data from the Catastro and the other origins without losing what
people did.

Three steps so that no database connection is held while the (slow) services answer: authority
and phase in a first short unit of work, the services with none open, and the write
(re-checking the phase, which may have changed meanwhile) in a second one. If the Catastro
fails, nothing is written; the person enters the data by hand. The other origins (INSPIRE,
Open-Meteo, PVGIS) fail one by one: the Catastro and the rest are saved anyway, the data of the
failed origin stay as they were and the result lists the origin as unavailable.
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
from backend.app.external_data.application.get_plot_geometry import GetPlotGeometry
from backend.app.external_data.application.get_pv_yield import GetPvYield
from backend.app.external_data.application.get_terrain_profile import GetTerrainProfile
from backend.app.external_data.domain.errors import CadastreError
from backend.app.study.domain.context import RequestContext
from backend.app.technical_data.application.cadastral_mapping import CADASTRE_FIELDS, map_property
from backend.app.technical_data.application.common import (
    ENTITY_SHEET,
    SheetWriter,
    TechnicalDataResult,
    clip,
)
from backend.app.technical_data.application.external_mapping import (
    INSPIRE_FIELDS,
    OPEN_METEO_FIELDS,
    PVGIS_FIELDS,
    map_plot,
    map_pv,
    map_terrain,
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


@dataclass(frozen=True)
class ExternalAnswers:
    """What the origins other than the Catastro answered."""

    values: dict[str, str]
    answered_fields: tuple[str, ...]  # the fields of the origins that answered
    unavailable: tuple[str, ...]  # the origins that did not


class RefreshTechnicalData:
    """`get_plot`, `get_terrain` and `get_pv` are the origins beyond the Catastro; an origin
    that is not given is simply not queried."""

    def __init__(
        self,
        get_property: GetCadastralProperty,
        open_session: OpenSession,
        clock: Callable[[], datetime] = _utc_now,
        *,
        get_plot: GetPlotGeometry | None = None,
        get_terrain: GetTerrainProfile | None = None,
        get_pv: GetPvYield | None = None,
    ) -> None:
        self._get_property = get_property
        self._open_session = open_session
        self._clock = clock
        self._get_plot = get_plot
        self._get_terrain = get_terrain
        self._get_pv = get_pv

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
        external = self._query_external(found.reference)

        with self._open_session() as session:
            writer = self._writer(session)
            project, refusal = writer.admit(
                context, code, entity=ENTITY_SHEET, entity_id=code, action=ACTION, asked=asked
            )
            if refusal is not None:
                return refusal
            before = session.data.load(project.id)
            queried = map_property(found)
            outcome = before.refresh({**queried, **external.values})
            changes = outcome.sheet.changes_since(before)
            changed_ids = [datum.field_id for datum in changes]
            unmapped = tuple(
                field_id
                for field_id in (*CADASTRE_FIELDS, *external.answered_fields)
                if field_id not in {**queried, **external.values} or field_id in outcome.not_applied
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
                    "unavailable": list(external.unavailable),
                },
            )
        return TechnicalDataResult(
            sheet=outcome.sheet,
            last_query=QueryRecord(found.reference, queried_at),
            unmapped=unmapped,
            unavailable=external.unavailable,
        )

    def _query_external(self, reference: str) -> ExternalAnswers:
        """Ask each origin on its own: one that fails costs only its own data. Terrain and PV
        need the plot's outline, so when INSPIRE fails they are reported unavailable without
        asking again (the same slow call would only be repeated)."""
        steps = []
        if self._get_plot is not None:
            steps.append(
                ("inspire", INSPIRE_FIELDS, lambda: map_plot(self._get_plot.execute(reference)))
            )
        if self._get_terrain is not None:
            steps.append(
                (
                    "open_meteo",
                    OPEN_METEO_FIELDS,
                    lambda: map_terrain(self._get_terrain.execute(reference)),
                )
            )
        if self._get_pv is not None:
            steps.append(("pvgis", PVGIS_FIELDS, lambda: map_pv(self._get_pv.execute(reference))))
        values: dict[str, str] = {}
        answered: list[str] = []
        unavailable: list[str] = []
        outline_missing = False
        for origin, fields, query in steps:
            if outline_missing and origin != "inspire":
                unavailable.append(origin)
                continue
            try:
                values.update(query())
            except CadastreError:
                unavailable.append(origin)
                outline_missing = outline_missing or origin == "inspire"
            else:
                answered += fields
        return ExternalAnswers(values, tuple(answered), tuple(unavailable))

    @staticmethod
    def _writer(session: RefreshSession) -> SheetWriter:
        return SheetWriter(session.projects, session.data, session.roles, session.audit_log)

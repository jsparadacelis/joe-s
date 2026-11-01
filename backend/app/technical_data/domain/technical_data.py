"""The technical data of one project: always every datum of the catalog, in its order."""

from __future__ import annotations

from collections.abc import Iterable, Mapping
from dataclasses import dataclass

from backend.app.technical_data.domain.catalog import CATALOG, DataGroup, definition_of
from backend.app.technical_data.domain.datum import TechnicalDatum
from backend.app.technical_data.domain.errors import InvalidDatumValue
from backend.app.technical_data.domain.values import normalize_value


@dataclass(frozen=True)
class RefreshOutcome:
    sheet: TechnicalData
    # Queried values that were not written: they do not fit their field, or the field is manual.
    not_applied: tuple[str, ...]


@dataclass(frozen=True)
class TechnicalData:
    data: tuple[TechnicalDatum, ...]

    @classmethod
    def from_rows(cls, rows: Iterable[TechnicalDatum]) -> TechnicalData:
        """Stored rows over the blank catalog. Raises `UnknownDatum` for a row outside it."""
        stored = {row.field_id: row for row in rows}
        for field_id in stored:
            definition_of(field_id)
        return cls(
            tuple(
                stored.get(d.id) or TechnicalDatum(field_id=d.id, value="", source=d.source)
                for d in CATALOG
            )
        )

    def get(self, field_id: str) -> TechnicalDatum:
        definition_of(field_id)
        return next(d for d in self.data if d.field_id == field_id)

    def edit(self, field_id: str, raw: object) -> TechnicalData:
        return self._replacing(self.get(field_id).edit(raw))

    def restore(self, field_id: str) -> TechnicalData:
        return self._replacing(self.get(field_id).restore())

    def verify(self, field_id: str) -> TechnicalData:
        return self._replacing(self.get(field_id).verify())

    def verify_all(self) -> TechnicalData:
        """Every datum with a value; blank ones have nothing to verify."""
        return TechnicalData(tuple(d.verify() if d.value else d for d in self.data))

    def refresh(self, queried: Mapping[str, str]) -> RefreshOutcome:
        """'Query again'. Edited data keep the person's value, manual (planning) data are never
        touched, and data the query does not return stay as they are."""
        for field_id in queried:
            definition_of(field_id)
        refreshed: list[TechnicalDatum] = []
        not_applied: list[str] = []
        for datum in self.data:
            if datum.field_id not in queried:
                refreshed.append(datum)
                continue
            definition = definition_of(datum.field_id)
            try:
                if definition.group is DataGroup.PLANNING:
                    raise InvalidDatumValue("Un dato manual no se consulta.")
                value = normalize_value(definition, queried[datum.field_id])
            except InvalidDatumValue:
                not_applied.append(datum.field_id)
                refreshed.append(datum)
                continue
            refreshed.append(datum.refreshed(value))
        return RefreshOutcome(TechnicalData(tuple(refreshed)), tuple(not_applied))

    def changes_since(self, previous: TechnicalData) -> tuple[TechnicalDatum, ...]:
        return tuple(d for d, before in zip(self.data, previous.data, strict=True) if d != before)

    def _replacing(self, new: TechnicalDatum) -> TechnicalData:
        return TechnicalData(tuple(new if d.field_id == new.field_id else d for d in self.data))

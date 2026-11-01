"""One technical datum: its value, where it comes from, the value it came with, and whether a
person has verified it. All operations return a new datum; a failed one changes nothing."""

from __future__ import annotations

from dataclasses import dataclass, replace

from backend.app.technical_data.domain.catalog import Source, definition_of
from backend.app.technical_data.domain.errors import EmptyDatum
from backend.app.technical_data.domain.values import normalize_value


@dataclass(frozen=True)
class TechnicalDatum:
    field_id: str
    value: str
    source: Source
    # `None`: typed in by a person, it never came from a query.
    original: str | None = None
    verified: bool = False

    @property
    def edited(self) -> bool:
        return self.original is not None and self.value != self.original

    def edit(self, raw: object) -> TechnicalDatum:
        """Raises `InvalidDatumValue`. The original is kept; the person must verify again."""
        value = normalize_value(definition_of(self.field_id), raw)
        source = self.source if self.original is not None else Source.MANUAL
        return replace(self, value=value, source=source, verified=False)

    def restore(self) -> TechnicalDatum:
        """Back to the original. A datum that was not edited (a manual one included) is left
        as it is, verified or not."""
        if not self.edited:
            return self
        return replace(self, value=self.original, verified=False)

    def verify(self) -> TechnicalDatum:
        """Raises `EmptyDatum`: there is nothing to verify."""
        if not self.value:
            raise EmptyDatum()
        return replace(self, verified=True)

    def refreshed(self, queried: str) -> TechnicalDatum:
        """A new answer from the origin (already valid for this datum). An edited datum keeps
        the person's value and verification and only learns its new original; any other takes
        the new value, which must be verified again when it changed."""
        source = definition_of(self.field_id).source
        if self.edited:
            return replace(self, original=queried)
        verified = self.verified and self.value == queried
        return replace(self, value=queried, original=queried, source=source, verified=verified)

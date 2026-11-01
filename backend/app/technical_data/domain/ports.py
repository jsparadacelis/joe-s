"""Ports of the technical data context."""

from __future__ import annotations

from collections.abc import Iterable
from dataclasses import dataclass
from datetime import datetime
from typing import Protocol

from backend.app.technical_data.domain.datum import TechnicalDatum
from backend.app.technical_data.domain.technical_data import TechnicalData


@dataclass(frozen=True)
class TechnicalProject:
    id: str
    code: str
    phase: int


@dataclass(frozen=True)
class QueryRecord:
    """The last time the data of a project were queried from the Catastro."""

    cadastral_reference: str
    queried_at: datetime


class TechnicalProjects(Protocol):
    def find(self, code: str, *, lock: bool = False) -> TechnicalProject | None:
        """A project of the current study. `lock` holds its row until the transaction ends, so
        two people editing the same project's data do not overwrite each other."""
        ...


class TechnicalDataRepository(Protocol):
    def load(self, project_id: str) -> TechnicalData:
        """Every datum of the catalog; the ones never stored come back blank."""
        ...

    def save(self, project_id: str, data: Iterable[TechnicalDatum]) -> None:
        """Insert or replace those data (and only those)."""
        ...

    def last_query(self, project_id: str) -> QueryRecord | None: ...

    def record_query(self, project_id: str, cadastral_reference: str, queried_at: datetime) -> None:
        """Remember the (only) latest query, replacing the previous one."""
        ...

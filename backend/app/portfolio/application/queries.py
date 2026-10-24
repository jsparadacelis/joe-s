"""Portfolio queries: the studio's projects with their derived status."""

from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass
from datetime import date, datetime, timezone

from backend.app.portfolio.domain.errors import ProjectNotFound
from backend.app.portfolio.domain.ports import ProjectReader
from backend.app.portfolio.domain.project import days_since, status_of


@dataclass(frozen=True)
class PortfolioEntry:
    code: str
    name: str
    phase: int
    status: str
    next_milestone: str | None
    owner_id: str | None
    days_since_update: int


@dataclass(frozen=True)
class Portfolio:
    as_of: date
    entries: list[PortfolioEntry]


@dataclass(frozen=True)
class ProjectSummary:
    code: str
    name: str
    current_phase: int


def _utc_now() -> datetime:
    return datetime.now(timezone.utc)


class PortfolioQueries:
    def __init__(self, reader: ProjectReader, clock: Callable[[], datetime] = _utc_now) -> None:
        self._reader = reader
        self._clock = clock

    def portfolio(self) -> Portfolio:
        now = self._clock()
        entries = [
            PortfolioEntry(
                code=record.code,
                name=record.name,
                phase=record.current_phase,
                status=status_of(record),
                next_milestone=record.next_milestone,
                owner_id=record.responsible_id,
                days_since_update=days_since(record.updated_at, now),
            )
            for record in sorted(self._reader.list_projects(), key=lambda r: r.code)
        ]
        return Portfolio(as_of=now.astimezone(timezone.utc).date(), entries=entries)

    def project(self, code: str) -> ProjectSummary:
        record = self._reader.find(code)
        if record is None:
            raise ProjectNotFound(code)
        return ProjectSummary(record.code, record.name, record.current_phase)

"""Read model of a project for the portfolio, and the rules that derive its status."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date, datetime, timezone


@dataclass(frozen=True)
class ProjectRecord:
    code: str
    name: str
    current_phase: int
    paused: bool
    traffic_light: str | None
    next_milestone: str | None
    responsible_id: str | None
    updated_at: datetime
    # The project's open pause, if it has a row in `pauses`.
    pause_reason: str | None = None
    pause_expected_resumption: date | None = None


def status_of(record: ProjectRecord) -> str:
    """`no_plan` (phase 0), `paused`, the stored traffic light, or `unknown`."""
    if record.current_phase == 0:
        return "no_plan"
    if record.paused:
        return "paused"
    if record.traffic_light in ("green", "amber", "red"):
        return record.traffic_light
    return "unknown"


def days_since(updated_at: datetime, now: datetime) -> int:
    """Whole UTC calendar days between the update and now, never negative."""
    days = (now.astimezone(timezone.utc).date() - updated_at.astimezone(timezone.utc).date()).days
    return max(days, 0)

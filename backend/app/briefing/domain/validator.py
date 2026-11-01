"""Validator of the phase 2 exit deliverable: same requirements as the brief promotion."""

from __future__ import annotations

from typing import Any

from backend.app.briefing.domain.brief import (
    BRIEF_KEY,
    TECHNICAL_DATA_KEY,
    build_brief,
    completeness,
)


def has_values(photo: Any) -> bool:
    """True when the technical data photo holds at least one datum with a value."""
    data = photo.get("data") if isinstance(photo, dict) else None
    return any(isinstance(d, dict) and d.get("value") for d in data or [])


class BriefDeliverableValidator:
    def validate(self, content: dict[str, Any]) -> list[str]:
        brief = build_brief(content.get(BRIEF_KEY))
        found = completeness(
            brief,
            technical_data_obtained=has_values(content.get(TECHNICAL_DATA_KEY)),
            technical_data_queried=False,
        )
        return found.blockers()

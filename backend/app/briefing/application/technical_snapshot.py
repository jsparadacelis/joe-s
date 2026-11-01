"""The photo of the technical data that is frozen together with the brief: every datum with its
value, source, original value and whether it was verified. Reads through the RGB-28 model."""

from __future__ import annotations

from datetime import timezone
from typing import Any

from backend.app.technical_data.domain.ports import QueryRecord
from backend.app.technical_data.domain.technical_data import TechnicalData


def obtained(data: TechnicalData) -> bool:
    """The technical data count as obtained when at least one datum has a value (from a query
    or typed in by hand)."""
    return any(datum.value for datum in data.data)


def snapshot(data: TechnicalData, query: QueryRecord | None) -> dict[str, Any]:
    return {
        "cadastral_reference": None if query is None else query.cadastral_reference,
        "queried_at": None
        if query is None
        else query.queried_at.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "unverified": [d.field_id for d in data.data if d.value and not d.verified],
        "data": [
            {
                "id": d.field_id,
                "value": d.value,
                "source": d.source.value,
                "original": d.original,
                "edited": d.edited,
                "verified": d.verified,
            }
            for d in data.data
        ],
    }

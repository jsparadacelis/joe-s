"""Strict JSON reading shared by the Open-Meteo and PVGIS parsers."""

from __future__ import annotations

import json
import math
from typing import Any

from backend.app.external_data.domain.errors import ExternalServiceUnavailable


def _reject_constant(name: str) -> Any:
    raise ValueError(f"{name} is not a valid JSON number")


def load_object(body: bytes) -> dict[str, Any]:
    """The JSON object in `body`. `NaN` and `Infinity` (which Python would accept) are refused,
    like anything that is not an object."""
    try:
        data = json.loads(body, parse_constant=_reject_constant)
    except ValueError as error:  # includes UnicodeDecodeError and JSONDecodeError
        raise ExternalServiceUnavailable() from error
    if not isinstance(data, dict):
        raise ExternalServiceUnavailable()
    return data


def as_number(value: Any) -> float | None:
    """A finite float for a JSON number; `None` for anything else (booleans included)."""
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        return None
    return float(value) if math.isfinite(value) else None

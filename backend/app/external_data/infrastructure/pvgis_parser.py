"""Parser of the PVGIS `PVcalc` answer (JSON).

Reads a white list: `outputs.totals.fixed.E_y` (kWh per kWp and year) and, if present, the
optimal slope and azimuth PVGIS chose (`inputs.mounting_system.fixed`). Nothing else is kept.
"""

from __future__ import annotations

from typing import Any

from backend.app.external_data.domain.errors import ExternalServiceUnavailable
from backend.app.external_data.domain.pv import InvalidPvData, PvLocation, PvYield
from backend.app.external_data.infrastructure.json_support import as_number, load_object

# 1 kWp cannot give more than its power times the hours of a year.
MAX_ANNUAL_KWH_PER_KWP = 8760.0


def _dig(data: Any, *path: str) -> Any:
    for key in path:
        if not isinstance(data, dict):
            return None
        data = data.get(key)
    return data


def parse_pv_yield(location: PvLocation, body: bytes) -> PvYield:
    """Raises `ExternalServiceUnavailable` if the answer has no plausible annual yield."""
    data = load_object(body)
    annual = as_number(_dig(data, "outputs", "totals", "fixed", "E_y"))
    if annual is None or not 0 <= annual <= MAX_ANNUAL_KWH_PER_KWP:
        raise ExternalServiceUnavailable()
    fixed = _dig(data, "inputs", "mounting_system", "fixed")
    try:
        return PvYield(
            location,
            annual,
            as_number(_dig(fixed, "slope", "value")),
            as_number(_dig(fixed, "azimuth", "value")),
        )
    except InvalidPvData as error:  # pragma: no cover - guarded above
        raise ExternalServiceUnavailable() from error

"""Photovoltaic yield of a location, as PVGIS estimates it for a reference system.

The reference system is a 1 kWp installation with the standard 14 % system losses, mounted at
the optimal slope and orientation for the site: the usual figure to compare sites, in
kWh per kWp and year. Both parameters are named constants so the assumptions stay explicit.
"""

from __future__ import annotations

import math
from dataclasses import dataclass
from typing import Any

PEAK_POWER_KWP = 1
SYSTEM_LOSS_PCT = 14  # PVGIS' own default
LOCATION_DECIMALS = 3  # ~110 m: the radiation data are far coarser


class InvalidPvData(ValueError):
    """The location or the yield are not usable numbers."""


@dataclass(frozen=True)
class PvLocation:
    """A point rounded to `LOCATION_DECIMALS`, which is both what PVGIS is asked and the key of
    the cache: nearby plots share one answer."""

    latitude: float
    longitude: float

    def __post_init__(self) -> None:
        if not (math.isfinite(self.latitude) and math.isfinite(self.longitude)):
            raise InvalidPvData("A location needs finite coordinates")
        if not (-90 <= self.latitude <= 90 and -180 <= self.longitude <= 180):
            raise InvalidPvData("Location outside longitude/latitude range")
        object.__setattr__(self, "latitude", round(self.latitude, LOCATION_DECIMALS) + 0.0)
        object.__setattr__(self, "longitude", round(self.longitude, LOCATION_DECIMALS) + 0.0)

    @property
    def key(self) -> str:
        return f"{self.latitude:.{LOCATION_DECIMALS}f},{self.longitude:.{LOCATION_DECIMALS}f}"


@dataclass(frozen=True)
class PvYield:
    location: PvLocation
    annual_kwh_per_kwp: float
    optimal_slope_deg: float | None = None
    optimal_azimuth_deg: float | None = None

    def __post_init__(self) -> None:
        if not math.isfinite(self.annual_kwh_per_kwp) or self.annual_kwh_per_kwp < 0:
            raise InvalidPvData("The annual yield must be a finite, non-negative number")

    def to_dict(self) -> dict[str, Any]:
        return {
            "annual_kwh_per_kwp": self.annual_kwh_per_kwp,
            "assumptions": {
                "peak_power_kwp": PEAK_POWER_KWP,
                "system_loss_pct": SYSTEM_LOSS_PCT,
                "optimal_angles": True,
                "slope_deg": self.optimal_slope_deg,
                "azimuth_deg": self.optimal_azimuth_deg,
            },
        }

    @classmethod
    def from_dict(cls, location: PvLocation, data: dict[str, Any]) -> PvYield:
        """Read only the stored inputs; the fixed assumptions are not read back."""
        assumptions = data["assumptions"]
        return cls(
            location,
            float(data["annual_kwh_per_kwp"]),
            _optional_float(assumptions.get("slope_deg")),
            _optional_float(assumptions.get("azimuth_deg")),
        )


def _optional_float(value: Any) -> float | None:
    return None if value is None else float(value)

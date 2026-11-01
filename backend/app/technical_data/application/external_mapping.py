"""From what the plot, terrain and PV services say to values for the catalog.

Only values a service actually gave are returned; the domain then checks each one against its
field (range, options), so a value that does not fit is reported instead of written. Numbers
use the decimal comma of the screen and no trailing zeros.
"""

from __future__ import annotations

from backend.app.external_data.domain.plot import Plot
from backend.app.external_data.domain.pv import PvYield
from backend.app.external_data.domain.terrain import TerrainProfile

# The data each external origin can fill, in catalog order. The slope and its type are
# calculated, but from Open-Meteo elevations: they are available (or not) with the altitude.
INSPIRE_FIELDS = ("polygonPlotArea",)
OPEN_METEO_FIELDS = ("altitude", "slope", "slopeType")
PVGIS_FIELDS = ("pvProduction",)


def _number(value: float, decimals: int) -> str:
    text = f"{round(value, decimals) + 0.0:.{decimals}f}"  # + 0.0: no "-0"
    if "." in text:
        text = text.rstrip("0").rstrip(".")
    return text.replace(".", ",")


def map_plot(plot: Plot) -> dict[str, str]:
    return {"polygonPlotArea": _number(plot.computed_area_m2, 1)}


def map_terrain(profile: TerrainProfile) -> dict[str, str]:
    mapped = {"altitude": _number(profile.altitude_m, 1)}
    if profile.slope_pct is not None and profile.slope_category is not None:
        mapped["slope"] = _number(profile.slope_pct, 1)
        mapped["slopeType"] = profile.slope_category
    return mapped


def map_pv(pv_yield: PvYield) -> dict[str, str]:
    return {"pvProduction": _number(pv_yield.annual_kwh_per_kwp, 0)}

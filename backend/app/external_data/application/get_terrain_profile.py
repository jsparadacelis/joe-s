"""Altitude and slope of a plot: the plot's outline, then a few elevations, through the cache."""

from __future__ import annotations

from collections.abc import Callable
from contextlib import AbstractContextManager
from datetime import datetime, timedelta, timezone

from backend.app.external_data.application.get_plot_geometry import GetPlotGeometry
from backend.app.external_data.domain.cadastral_reference import (
    PLOT_LENGTH,
    validate_cadastral_reference,
)
from backend.app.external_data.domain.ports import ElevationGateway, TerrainCache
from backend.app.external_data.domain.terrain import (
    TerrainProfile,
    profile_from_elevations,
    sampling_positions,
)

CACHE_MAX_AGE = timedelta(days=30)


def _utc_now() -> datetime:
    return datetime.now(timezone.utc)


CacheSession = Callable[[], AbstractContextManager[TerrainCache]]


class GetTerrainProfile:
    """Same shape as `GetPlotGeometry`: `open_cache` opens a short transaction each time, and
    neither the plot service nor the elevation service is queried with one open."""

    def __init__(
        self,
        get_plot: GetPlotGeometry,
        gateway: ElevationGateway,
        open_cache: CacheSession,
        clock: Callable[[], datetime] = _utc_now,
    ) -> None:
        self._get_plot = get_plot
        self._gateway = gateway
        self._open_cache = open_cache
        self._clock = clock

    def execute(self, raw_reference: str) -> TerrainProfile:
        """Raises `InvalidCadastralReference`, `PlotNotFound`, `CadastreUnavailable` (from the
        plot) or `ExternalServiceUnavailable` (from the elevations).

        Keyed by the first 14 characters (the plot, not the unit). A cached profile needs no
        plot at all. An expired entry is never a fallback: data is fresh or absent.
        """
        plot_reference = validate_cadastral_reference(raw_reference)[:PLOT_LENGTH]
        with self._open_cache() as cache:
            cached = cache.get(plot_reference, CACHE_MAX_AGE)
        if cached is not None:
            return cached
        plot = self._get_plot.execute(raw_reference)  # its own short cache sessions
        elevations = self._gateway.fetch(sampling_positions(plot))  # no connection held
        profile = profile_from_elevations(plot, elevations)
        with self._open_cache() as cache:
            cache.put(profile, self._clock())
        return profile

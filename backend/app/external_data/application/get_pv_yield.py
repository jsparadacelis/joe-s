"""Photovoltaic yield of a plot: its centroid, rounded, asked to PVGIS through the cache."""

from __future__ import annotations

from collections.abc import Callable
from contextlib import AbstractContextManager
from datetime import datetime, timedelta, timezone

from backend.app.external_data.application.get_plot_geometry import GetPlotGeometry
from backend.app.external_data.domain.cadastral_reference import validate_cadastral_reference
from backend.app.external_data.domain.ports import PvCache, PvGateway
from backend.app.external_data.domain.pv import PvLocation, PvYield

CACHE_MAX_AGE = timedelta(days=30)


def _utc_now() -> datetime:
    return datetime.now(timezone.utc)


CacheSession = Callable[[], AbstractContextManager[PvCache]]


class GetPvYield:
    """The location comes from the plot (itself cached for 30 days), so the cache of the yield
    is keyed by the rounded location: plots a few streets apart share one PVGIS answer. No
    connection is held while a service is queried."""

    def __init__(
        self,
        get_plot: GetPlotGeometry,
        gateway: PvGateway,
        open_cache: CacheSession,
        clock: Callable[[], datetime] = _utc_now,
    ) -> None:
        self._get_plot = get_plot
        self._gateway = gateway
        self._open_cache = open_cache
        self._clock = clock

    def execute(self, raw_reference: str) -> PvYield:
        """Raises `InvalidCadastralReference`, `PlotNotFound`, `CadastreUnavailable` (from the
        plot) or `ExternalServiceUnavailable` (from PVGIS)."""
        validate_cadastral_reference(raw_reference)  # before anything is asked of anyone
        longitude, latitude = self._get_plot.execute(raw_reference).centroid
        location = PvLocation(latitude, longitude)
        with self._open_cache() as cache:
            cached = cache.get(location, CACHE_MAX_AGE)
        if cached is not None:
            return cached
        found = self._gateway.fetch(location)  # no connection is held during the call
        with self._open_cache() as cache:
            cache.put(found, self._clock())
        return found

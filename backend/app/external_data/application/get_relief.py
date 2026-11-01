"""The relief around a plot: its outline, then the heights of the window, through the cache."""

from __future__ import annotations

from collections.abc import Callable
from contextlib import AbstractContextManager
from datetime import datetime, timedelta, timezone

from backend.app.external_data.application.get_plot_geometry import GetPlotGeometry
from backend.app.external_data.domain.cadastral_reference import (
    PLOT_LENGTH,
    validate_cadastral_reference,
)
from backend.app.external_data.domain.ports import ReliefCache, ReliefGateway
from backend.app.external_data.domain.relief import Relief, ReliefOptions, plan_relief_window

CACHE_MAX_AGE = timedelta(days=30)


def _utc_now() -> datetime:
    return datetime.now(timezone.utc)


CacheSession = Callable[[], AbstractContextManager[ReliefCache]]


class GetRelief:
    """Same shape as `GetTerrainProfile`: `open_cache` opens a short transaction each time, and
    neither the plot service nor the elevation service is queried with one open."""

    def __init__(
        self,
        get_plot: GetPlotGeometry,
        gateway: ReliefGateway,
        open_cache: CacheSession,
        clock: Callable[[], datetime] = _utc_now,
    ) -> None:
        self._get_plot = get_plot
        self._gateway = gateway
        self._open_cache = open_cache
        self._clock = clock

    def execute(self, raw_reference: str, options: ReliefOptions | None = None) -> Relief:
        """Raises `InvalidCadastralReference`, `PlotNotFound`, `CadastreUnavailable` (from the
        plot) or `ReliefUnavailable` (from the heights).

        Keyed by the first 14 characters (the plot, not the unit) and the options, which fix
        the window. A cached relief needs no plot at all. An expired entry is never a fallback:
        data is fresh or absent.
        """
        options = options or ReliefOptions()
        plot_reference = validate_cadastral_reference(raw_reference)[:PLOT_LENGTH]
        with self._open_cache() as cache:
            cached = cache.get(plot_reference, options, CACHE_MAX_AGE)
        if cached is not None:
            return cached
        plot = self._get_plot.execute(raw_reference)  # its own short cache sessions
        plan = plan_relief_window(plot, options)
        grid = self._gateway.fetch(plan.window)  # no connection held
        relief = Relief(
            plot_reference,
            plan.window,
            grid,
            plan.outline,
            plan.clipped,
            plan.parcel_clipped,
            plot.computed_area_m2,
        )
        with self._open_cache() as cache:
            cache.put(relief, options, self._clock())
        return relief

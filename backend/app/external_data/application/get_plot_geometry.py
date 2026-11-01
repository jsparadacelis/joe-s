"""Look a plot's outline up in the INSPIRE WFS through the study's 30-day cache."""

from __future__ import annotations

from collections.abc import Callable
from contextlib import AbstractContextManager
from datetime import datetime, timedelta, timezone

from backend.app.external_data.domain.cadastral_reference import (
    PLOT_LENGTH,
    validate_cadastral_reference,
)
from backend.app.external_data.domain.plot import Plot
from backend.app.external_data.domain.ports import PlotCache, PlotGateway

CACHE_MAX_AGE = timedelta(days=30)


def _utc_now() -> datetime:
    return datetime.now(timezone.utc)


CacheSession = Callable[[], AbstractContextManager[PlotCache]]


class GetPlotGeometry:
    """Same shape as `GetCadastralProperty`: `open_cache` opens a short transaction each time,
    and the service is queried with none open, so a slow WFS never holds a connection."""

    def __init__(
        self,
        gateway: PlotGateway,
        open_cache: CacheSession,
        clock: Callable[[], datetime] = _utc_now,
    ) -> None:
        self._gateway = gateway
        self._open_cache = open_cache
        self._clock = clock

    def execute(self, raw_reference: str) -> Plot:
        """Raises `InvalidCadastralReference`, `PlotNotFound` or `CadastreUnavailable`.

        The plot is keyed by the first 14 characters (the plot, not the unit). An expired cache
        entry is never a fallback: data is fresh or absent.
        """
        plot_reference = validate_cadastral_reference(raw_reference)[:PLOT_LENGTH]
        with self._open_cache() as cache:
            cached = cache.get(plot_reference, CACHE_MAX_AGE)
        if cached is not None:
            return cached
        found = self._gateway.fetch(plot_reference)  # no connection is held during the call
        with self._open_cache() as cache:
            cache.put(found, self._clock())
        return found

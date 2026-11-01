"""Ports of the external data context."""

from __future__ import annotations

from datetime import datetime, timedelta
from typing import Protocol

from backend.app.external_data.domain.cadastral_property import CadastralProperty
from backend.app.external_data.domain.plot import Plot


class CadastreGateway(Protocol):
    def fetch(self, reference: str) -> CadastralProperty:
        """Query the Catastro for a normalized 20-character reference.

        Raises `CadastreNotFound` or `CadastreUnavailable`.
        """
        ...


class CadastreCache(Protocol):
    def get(self, reference: str, max_age: timedelta) -> CadastralProperty | None:
        """The stored property if it is no older than `max_age`; an older one counts as absent."""
        ...

    def put(self, cadastral_property: CadastralProperty, fetched_at: datetime) -> None:
        """Store (or replace) the property for its reference."""
        ...


class PlotGateway(Protocol):
    def fetch(self, plot_reference: str) -> Plot:
        """Query the INSPIRE WFS for a normalized 14-character plot reference.

        Raises `PlotNotFound` or `CadastreUnavailable`.
        """
        ...


class PlotCache(Protocol):
    def get(self, plot_reference: str, max_age: timedelta) -> Plot | None:
        """The stored plot if it is no older than `max_age`; an older one counts as absent."""
        ...

    def put(self, plot: Plot, fetched_at: datetime) -> None:
        """Store (or replace) the plot for its reference."""
        ...

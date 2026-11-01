"""Ports of the external data context."""

from __future__ import annotations

from collections.abc import Sequence
from datetime import datetime, timedelta
from typing import Protocol

from backend.app.external_data.domain.cadastral_property import CadastralProperty
from backend.app.external_data.domain.plot import Plot, Position
from backend.app.external_data.domain.pv import PvLocation, PvYield
from backend.app.external_data.domain.relief import (
    ElevationGrid,
    Relief,
    ReliefOptions,
    ReliefWindow,
)
from backend.app.external_data.domain.terrain import TerrainProfile


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


class ElevationGateway(Protocol):
    def fetch(self, positions: Sequence[Position]) -> list[float]:
        """Ground elevations in metres, one per `(lon, lat)` position and in the same order.

        Raises `ExternalServiceUnavailable`.
        """
        ...


class TerrainCache(Protocol):
    def get(self, plot_reference: str, max_age: timedelta) -> TerrainProfile | None:
        """The stored profile if it is no older than `max_age`; an older one counts as absent."""
        ...

    def put(self, profile: TerrainProfile, fetched_at: datetime) -> None:
        """Store (or replace) the profile for its plot reference."""
        ...


class PvGateway(Protocol):
    def fetch(self, location: PvLocation) -> PvYield:
        """The annual yield of the reference system at the (rounded) location.

        Raises `ExternalServiceUnavailable`.
        """
        ...


class PvCache(Protocol):
    def get(self, location: PvLocation, max_age: timedelta) -> PvYield | None:
        """The stored yield if it is no older than `max_age`; an older one counts as absent."""
        ...

    def put(self, pv_yield: PvYield, fetched_at: datetime) -> None:
        """Store (or replace) the yield for its location."""
        ...


class ReliefGateway(Protocol):
    def fetch(self, window: ReliefWindow) -> ElevationGrid:
        """The heights of the window as a grid of `window.grid_size` cells, north first.

        Raises `ReliefUnavailable`.
        """
        ...


class ReliefCache(Protocol):
    def get(self, plot_reference: str, options: ReliefOptions, max_age: timedelta) -> Relief | None:
        """The stored relief of the plot for those options if it is no older than `max_age`;
        an older one counts as absent."""
        ...

    def put(self, relief: Relief, options: ReliefOptions, fetched_at: datetime) -> None:
        """Store (or replace) the relief for its plot reference and options."""
        ...

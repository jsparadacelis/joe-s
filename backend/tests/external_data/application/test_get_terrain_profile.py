"""GetTerrainProfile with simulated ports: plot first, elevations only on a miss, 30-day cache."""

from datetime import datetime, timedelta, timezone
from unittest.mock import create_autospec

import pytest

from backend.app.external_data.application.get_plot_geometry import GetPlotGeometry
from backend.app.external_data.application.get_terrain_profile import (
    CACHE_MAX_AGE,
    GetTerrainProfile,
)
from backend.app.external_data.domain.cadastral_reference import InvalidCadastralReference
from backend.app.external_data.domain.errors import (
    CadastreUnavailable,
    ExternalServiceUnavailable,
    PlotNotFound,
)
from backend.app.external_data.domain.ports import ElevationGateway, TerrainCache
from backend.app.external_data.domain.terrain import TerrainProfile, sampling_positions
from backend.tests.external_data.application.sessions import Sessions
from backend.tests.external_data.domain.test_plot import (
    PROPERTY_REFERENCE,
    REFERENCE,
    TRIANGLE,
    _plot_from_metres,
)

NOW = datetime(2026, 11, 1, 10, 0, tzinfo=timezone.utc)
PROFILE = TerrainProfile(REFERENCE, 100.0, 10.0)


@pytest.fixture
def plot():
    return _plot_from_metres(TRIANGLE)


@pytest.fixture
def get_plot(plot):
    stub = create_autospec(GetPlotGeometry, spec_set=True, instance=True)
    stub.execute.return_value = plot
    return stub


@pytest.fixture
def gateway():
    stub = create_autospec(ElevationGateway, spec_set=True, instance=True)
    stub.fetch.return_value = [100.0, 103.0, 95.0]
    return stub


@pytest.fixture
def cache():
    stub = create_autospec(TerrainCache, spec_set=True, instance=True)
    stub.get.return_value = None
    return stub


@pytest.fixture
def sessions(cache):
    return Sessions(cache)


@pytest.fixture
def use_case(get_plot, gateway, sessions):
    return GetTerrainProfile(get_plot, gateway, sessions, clock=lambda: NOW)


def test_the_cache_window_is_thirty_days():
    assert CACHE_MAX_AGE == timedelta(days=30)


def test_a_cached_profile_is_returned_without_the_plot_or_the_service(
    use_case, get_plot, gateway, cache
):
    cache.get.return_value = PROFILE

    assert use_case.execute(PROPERTY_REFERENCE) == PROFILE

    cache.get.assert_called_once_with(REFERENCE, CACHE_MAX_AGE)
    get_plot.execute.assert_not_called()
    gateway.fetch.assert_not_called()
    cache.put.assert_not_called()


def test_a_miss_asks_the_centroid_and_the_far_vertices_and_stores_the_profile(
    use_case, get_plot, gateway, cache, plot
):
    result = use_case.execute(" 4714805bc6841s 0001fy ")

    assert result == PROFILE
    get_plot.execute.assert_called_once_with(" 4714805bc6841s 0001fy ")
    gateway.fetch.assert_called_once_with(sampling_positions(plot))
    cache.get.assert_called_once_with(REFERENCE, CACHE_MAX_AGE)
    cache.put.assert_called_once_with(PROFILE, NOW)


@pytest.mark.parametrize("raw", ["", REFERENCE, "ABC", PROPERTY_REFERENCE[:-1] + "-"])
def test_an_invalid_reference_never_reaches_the_cache_the_plot_or_the_service(
    use_case, get_plot, gateway, cache, raw
):
    with pytest.raises(InvalidCadastralReference):
        use_case.execute(raw)

    cache.get.assert_not_called()
    get_plot.execute.assert_not_called()
    gateway.fetch.assert_not_called()


@pytest.mark.parametrize("error", [PlotNotFound, CadastreUnavailable])
def test_plot_errors_propagate_and_the_elevation_service_is_not_called(
    use_case, get_plot, gateway, cache, error
):
    get_plot.execute.side_effect = error()

    with pytest.raises(error):
        use_case.execute(PROPERTY_REFERENCE)

    gateway.fetch.assert_not_called()
    cache.put.assert_not_called()


def test_an_unavailable_elevation_service_propagates_and_nothing_is_stored(
    use_case, gateway, cache, sessions
):
    gateway.fetch.side_effect = ExternalServiceUnavailable()

    with pytest.raises(ExternalServiceUnavailable):
        use_case.execute(PROPERTY_REFERENCE)

    cache.put.assert_not_called()
    assert sessions.open_count == 1


def test_no_cache_session_is_open_while_the_plot_or_the_service_are_queried(
    use_case, get_plot, gateway, sessions
):
    seen = []
    get_plot.execute.side_effect = lambda raw: (
        seen.append(("plot", list(sessions.events))) or _plot_from_metres(TRIANGLE)
    )
    gateway.fetch.side_effect = lambda positions: (
        seen.append(("elevation", list(sessions.events))) or [100.0, 103.0, 95.0]
    )

    use_case.execute(PROPERTY_REFERENCE)

    assert seen == [("plot", ["open", "close"]), ("elevation", ["open", "close"])]
    assert sessions.events == ["open", "close", "open", "close"]


def test_a_cache_hit_opens_a_single_short_session(use_case, cache, sessions):
    cache.get.return_value = PROFILE

    use_case.execute(PROPERTY_REFERENCE)

    assert sessions.events == ["open", "close"]


def test_the_default_clock_is_timezone_aware_utc(get_plot, gateway, cache, sessions):
    GetTerrainProfile(get_plot, gateway, sessions).execute(PROPERTY_REFERENCE)

    assert cache.put.call_args.args[1].utcoffset() == timedelta(0)

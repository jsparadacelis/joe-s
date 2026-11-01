"""GetPvYield with simulated ports: the plot gives the location, PVGIS only on a miss."""

from datetime import datetime, timedelta, timezone
from unittest.mock import create_autospec

import pytest

from backend.app.external_data.application.get_plot_geometry import GetPlotGeometry
from backend.app.external_data.application.get_pv_yield import CACHE_MAX_AGE, GetPvYield
from backend.app.external_data.domain.cadastral_reference import InvalidCadastralReference
from backend.app.external_data.domain.errors import (
    CadastreUnavailable,
    ExternalServiceUnavailable,
    PlotNotFound,
)
from backend.app.external_data.domain.ports import PvCache, PvGateway
from backend.app.external_data.domain.pv import PvLocation, PvYield
from backend.tests.external_data.application.sessions import Sessions
from backend.tests.external_data.domain.test_plot import (
    PROPERTY_REFERENCE,
    REFERENCE,
    a_plot,
)

NOW = datetime(2026, 11, 1, 10, 0, tzinfo=timezone.utc)
PLOT = a_plot()  # the 100 m square near Madrid
LON, LAT = PLOT.centroid
LOCATION = PvLocation(LAT, LON)
YIELD = PvYield(LOCATION, 1617.61, 35.0, -3.0)


@pytest.fixture
def get_plot():
    stub = create_autospec(GetPlotGeometry, spec_set=True, instance=True)
    stub.execute.return_value = PLOT
    return stub


@pytest.fixture
def gateway():
    stub = create_autospec(PvGateway, spec_set=True, instance=True)
    stub.fetch.return_value = YIELD
    return stub


@pytest.fixture
def cache():
    stub = create_autospec(PvCache, spec_set=True, instance=True)
    stub.get.return_value = None
    return stub


@pytest.fixture
def sessions(cache):
    return Sessions(cache)


@pytest.fixture
def use_case(get_plot, gateway, sessions):
    return GetPvYield(get_plot, gateway, sessions, clock=lambda: NOW)


def test_the_cache_window_is_thirty_days():
    assert CACHE_MAX_AGE == timedelta(days=30)


def test_a_miss_asks_pvgis_for_the_rounded_centroid_and_stores_the_answer(
    use_case, get_plot, gateway, cache
):
    assert use_case.execute(PROPERTY_REFERENCE) == YIELD

    get_plot.execute.assert_called_once_with(PROPERTY_REFERENCE)
    cache.get.assert_called_once_with(LOCATION, CACHE_MAX_AGE)
    gateway.fetch.assert_called_once_with(LOCATION)
    cache.put.assert_called_once_with(YIELD, NOW)
    assert (LOCATION.latitude, LOCATION.longitude) == (40.415, -3.707)


def test_a_cached_yield_is_returned_without_calling_pvgis(use_case, gateway, cache):
    cache.get.return_value = YIELD

    assert use_case.execute(PROPERTY_REFERENCE) == YIELD

    gateway.fetch.assert_not_called()
    cache.put.assert_not_called()


@pytest.mark.parametrize("raw", ["", REFERENCE, "ABC"])
def test_an_invalid_reference_reaches_nothing(use_case, get_plot, gateway, cache, raw):
    with pytest.raises(InvalidCadastralReference):
        use_case.execute(raw)

    get_plot.execute.assert_not_called()
    cache.get.assert_not_called()
    gateway.fetch.assert_not_called()


@pytest.mark.parametrize("error", [PlotNotFound, CadastreUnavailable])
def test_plot_errors_propagate(use_case, get_plot, gateway, cache, error):
    get_plot.execute.side_effect = error()

    with pytest.raises(error):
        use_case.execute(PROPERTY_REFERENCE)

    gateway.fetch.assert_not_called()
    cache.get.assert_not_called()


def test_an_unavailable_pvgis_propagates_and_nothing_is_stored(use_case, gateway, cache):
    gateway.fetch.side_effect = ExternalServiceUnavailable()

    with pytest.raises(ExternalServiceUnavailable):
        use_case.execute(PROPERTY_REFERENCE)

    cache.put.assert_not_called()


def test_no_cache_session_is_open_while_pvgis_is_queried(use_case, gateway, sessions):
    seen = []
    gateway.fetch.side_effect = lambda location: seen.append(list(sessions.events)) or YIELD

    use_case.execute(PROPERTY_REFERENCE)

    assert seen == [["open", "close"]]
    assert sessions.events == ["open", "close", "open", "close"]


def test_a_cache_hit_opens_a_single_short_session(use_case, cache, sessions):
    cache.get.return_value = YIELD

    use_case.execute(PROPERTY_REFERENCE)

    assert sessions.events == ["open", "close"]


def test_the_default_clock_is_timezone_aware_utc(get_plot, gateway, cache, sessions):
    GetPvYield(get_plot, gateway, sessions).execute(PROPERTY_REFERENCE)

    assert cache.put.call_args.args[1].utcoffset() == timedelta(0)

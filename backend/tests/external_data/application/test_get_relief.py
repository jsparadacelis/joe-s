"""GetRelief with simulated ports: plot first, the WCS only on a miss, 30-day cache."""

from datetime import datetime, timedelta, timezone
from unittest.mock import create_autospec

import pytest

from backend.app.external_data.application.get_plot_geometry import GetPlotGeometry
from backend.app.external_data.application.get_relief import CACHE_MAX_AGE, GetRelief
from backend.app.external_data.domain.cadastral_reference import InvalidCadastralReference
from backend.app.external_data.domain.errors import (
    CadastreUnavailable,
    PlotNotFound,
    ReliefUnavailable,
)
from backend.app.external_data.domain.ports import ReliefCache, ReliefGateway
from backend.app.external_data.domain.relief import (
    ElevationGrid,
    InvalidReliefData,
    Relief,
    ReliefOptions,
    plan_relief_window,
)
from backend.tests.external_data.application.sessions import Sessions
from backend.tests.external_data.domain.test_plot import (
    PROPERTY_REFERENCE,
    REFERENCE,
    TRIANGLE,
    _plot_from_metres,
)

NOW = datetime(2026, 11, 1, 10, 0, tzinfo=timezone.utc)
OPTIONS = ReliefOptions(25, 300)


def grid_for(window):
    cols, rows = window.grid_size
    return ElevationGrid(cols, rows, tuple(float(i % 9) for i in range(cols * rows)))


@pytest.fixture
def plot():
    return _plot_from_metres(TRIANGLE)


@pytest.fixture
def plan(plot):
    return plan_relief_window(plot, OPTIONS)


@pytest.fixture
def relief(plot, plan):
    return Relief(
        REFERENCE,
        plan.window,
        grid_for(plan.window),
        plan.outline,
        plan.clipped,
        plan.parcel_clipped,
        plot.computed_area_m2,
    )


@pytest.fixture
def get_plot(plot):
    stub = create_autospec(GetPlotGeometry, spec_set=True, instance=True)
    stub.execute.return_value = plot
    return stub


@pytest.fixture
def gateway(plan):
    stub = create_autospec(ReliefGateway, spec_set=True, instance=True)
    stub.fetch.return_value = grid_for(plan.window)
    return stub


@pytest.fixture
def cache():
    stub = create_autospec(ReliefCache, spec_set=True, instance=True)
    stub.get.return_value = None
    return stub


@pytest.fixture
def sessions(cache):
    return Sessions(cache)


@pytest.fixture
def use_case(get_plot, gateway, sessions):
    return GetRelief(get_plot, gateway, sessions, clock=lambda: NOW)


def test_the_cache_window_is_thirty_days():
    assert CACHE_MAX_AGE == timedelta(days=30)


def test_a_cached_relief_is_returned_without_the_plot_or_the_service(
    use_case, get_plot, gateway, cache, relief
):
    cache.get.return_value = relief

    assert use_case.execute(PROPERTY_REFERENCE, OPTIONS) == relief

    cache.get.assert_called_once_with(REFERENCE, OPTIONS, CACHE_MAX_AGE)
    get_plot.execute.assert_not_called()
    gateway.fetch.assert_not_called()
    cache.put.assert_not_called()


def test_a_miss_asks_the_service_for_the_planned_window_and_stores_the_relief(
    use_case, get_plot, gateway, cache, plan, relief
):
    result = use_case.execute(" 4714805bc6841s 0001fy ", OPTIONS)

    assert result == relief
    get_plot.execute.assert_called_once_with(" 4714805bc6841s 0001fy ")
    gateway.fetch.assert_called_once_with(plan.window)
    cache.get.assert_called_once_with(REFERENCE, OPTIONS, CACHE_MAX_AGE)
    cache.put.assert_called_once_with(relief, OPTIONS, NOW)


def test_the_options_default_to_margin_25_and_side_300(use_case, cache, gateway, plan):
    use_case.execute(PROPERTY_REFERENCE)

    cache.get.assert_called_once_with(REFERENCE, ReliefOptions(25, 300), CACHE_MAX_AGE)


def test_the_options_change_the_window_that_is_asked_for(use_case, gateway, plot):
    gateway.fetch.side_effect = lambda window: grid_for(window)
    options = ReliefOptions(0, 100)

    use_case.execute(PROPERTY_REFERENCE, options)

    assert gateway.fetch.call_args.args[0] == plan_relief_window(plot, options).window


@pytest.mark.parametrize("raw", ["", REFERENCE, "ABC", PROPERTY_REFERENCE[:-1] + "-"])
def test_an_invalid_reference_never_reaches_the_cache_the_plot_or_the_service(
    use_case, get_plot, gateway, cache, raw
):
    with pytest.raises(InvalidCadastralReference):
        use_case.execute(raw, OPTIONS)

    cache.get.assert_not_called()
    get_plot.execute.assert_not_called()
    gateway.fetch.assert_not_called()


@pytest.mark.parametrize("error", [PlotNotFound, CadastreUnavailable])
def test_plot_errors_propagate_and_the_service_is_not_called(
    use_case, get_plot, gateway, cache, error
):
    get_plot.execute.side_effect = error()

    with pytest.raises(error):
        use_case.execute(PROPERTY_REFERENCE, OPTIONS)

    gateway.fetch.assert_not_called()
    cache.put.assert_not_called()


def test_an_unavailable_service_propagates_and_nothing_is_stored(
    use_case, gateway, cache, sessions
):
    gateway.fetch.side_effect = ReliefUnavailable()

    with pytest.raises(ReliefUnavailable):
        use_case.execute(PROPERTY_REFERENCE, OPTIONS)

    cache.put.assert_not_called()
    assert sessions.open_count == 1


def test_a_grid_of_the_wrong_size_is_never_stored(use_case, gateway, cache):
    gateway.fetch.side_effect = None
    gateway.fetch.return_value = ElevationGrid(2, 2, (1.0, 2.0, 3.0, 4.0))

    with pytest.raises(InvalidReliefData):
        use_case.execute(PROPERTY_REFERENCE, OPTIONS)

    cache.put.assert_not_called()


def test_no_cache_session_is_open_while_the_plot_or_the_service_are_queried(
    use_case, get_plot, gateway, sessions, plan, plot
):
    seen = []
    get_plot.execute.side_effect = lambda raw: seen.append(("plot", list(sessions.events))) or plot
    gateway.fetch.side_effect = lambda window: (
        seen.append(("wcs", list(sessions.events))) or grid_for(window)
    )

    use_case.execute(PROPERTY_REFERENCE, OPTIONS)

    assert seen == [("plot", ["open", "close"]), ("wcs", ["open", "close"])]
    assert sessions.events == ["open", "close", "open", "close"]


def test_a_cache_hit_opens_a_single_short_session(use_case, cache, sessions, relief):
    cache.get.return_value = relief

    use_case.execute(PROPERTY_REFERENCE, OPTIONS)

    assert sessions.events == ["open", "close"]


def test_the_default_clock_is_timezone_aware_utc(get_plot, gateway, cache, sessions):
    GetRelief(get_plot, gateway, sessions).execute(PROPERTY_REFERENCE, OPTIONS)

    assert cache.put.call_args.args[2].utcoffset() == timedelta(0)

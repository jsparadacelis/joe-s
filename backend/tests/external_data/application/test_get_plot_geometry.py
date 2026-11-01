"""GetPlotGeometry with simulated ports: 14-character key, 30-day cache, short sessions."""

from contextlib import contextmanager
from datetime import datetime, timedelta, timezone
from unittest.mock import create_autospec

import pytest

from backend.app.external_data.application.get_plot_geometry import (
    CACHE_MAX_AGE,
    GetPlotGeometry,
)
from backend.app.external_data.domain.cadastral_reference import InvalidCadastralReference
from backend.app.external_data.domain.errors import CadastreUnavailable, PlotNotFound
from backend.app.external_data.domain.ports import PlotCache, PlotGateway
from backend.tests.external_data.domain.test_plot import REFERENCE as PLOT_REFERENCE
from backend.tests.external_data.domain.test_plot import a_plot

PROPERTY_REFERENCE = PLOT_REFERENCE + "0001FY"
NOW = datetime(2026, 11, 1, 10, 0, tzinfo=timezone.utc)


@pytest.fixture
def gateway():
    return create_autospec(PlotGateway, spec_set=True, instance=True)


@pytest.fixture
def cache():
    stub = create_autospec(PlotCache, spec_set=True, instance=True)
    stub.get.return_value = None
    return stub


class Sessions:
    def __init__(self, cache):
        self.cache = cache
        self.events: list[str] = []
        self.open_count = 0

    @contextmanager
    def __call__(self):
        self.open_count += 1
        self.events.append("open")
        try:
            yield self.cache
        finally:
            self.events.append("close")


@pytest.fixture
def sessions(cache):
    return Sessions(cache)


@pytest.fixture
def use_case(gateway, sessions):
    return GetPlotGeometry(gateway, sessions, clock=lambda: NOW)


def test_the_cache_window_is_thirty_days():
    assert CACHE_MAX_AGE == timedelta(days=30)


def test_a_cached_plot_is_returned_without_calling_the_service(use_case, gateway, cache):
    cache.get.return_value = a_plot()

    assert use_case.execute(PROPERTY_REFERENCE) == a_plot()

    cache.get.assert_called_once_with(PLOT_REFERENCE, CACHE_MAX_AGE)
    gateway.fetch.assert_not_called()
    cache.put.assert_not_called()


def test_a_miss_uses_the_first_fourteen_characters_for_the_service_and_the_cache(
    use_case, gateway, cache
):
    gateway.fetch.return_value = a_plot()

    result = use_case.execute(" 4714805bc6841s 0001fy ")

    assert result == a_plot()
    cache.get.assert_called_once_with(PLOT_REFERENCE, CACHE_MAX_AGE)
    gateway.fetch.assert_called_once_with(PLOT_REFERENCE)
    cache.put.assert_called_once_with(a_plot(), NOW)


@pytest.mark.parametrize("raw", ["", PLOT_REFERENCE, "ABC", PROPERTY_REFERENCE[:-1] + "-"])
def test_an_invalid_reference_never_reaches_the_cache_or_the_service(use_case, gateway, cache, raw):
    with pytest.raises(InvalidCadastralReference):
        use_case.execute(raw)

    cache.get.assert_not_called()
    gateway.fetch.assert_not_called()


@pytest.mark.parametrize("error", [PlotNotFound, CadastreUnavailable])
def test_service_errors_propagate_and_nothing_is_stored(use_case, gateway, cache, error):
    gateway.fetch.side_effect = error()

    with pytest.raises(error):
        use_case.execute(PROPERTY_REFERENCE)

    cache.put.assert_not_called()


def test_when_the_service_fails_no_expired_cache_is_used(use_case, gateway, cache):
    gateway.fetch.side_effect = CadastreUnavailable()

    with pytest.raises(CadastreUnavailable):
        use_case.execute(PROPERTY_REFERENCE)

    assert cache.get.call_count == 1


def test_the_default_clock_is_timezone_aware_utc(gateway, cache, sessions):
    gateway.fetch.return_value = a_plot()

    GetPlotGeometry(gateway, sessions).execute(PROPERTY_REFERENCE)

    assert cache.put.call_args.args[1].utcoffset() == timedelta(0)


def test_no_cache_session_is_open_while_the_service_is_queried(use_case, gateway, sessions):
    seen_during_fetch = []

    def fetch(reference):
        seen_during_fetch.append(list(sessions.events))
        return a_plot()

    gateway.fetch.side_effect = fetch

    use_case.execute(PROPERTY_REFERENCE)

    assert seen_during_fetch == [["open", "close"]]
    assert sessions.events == ["open", "close", "open", "close"]


def test_a_cache_hit_opens_a_single_short_session(use_case, cache, sessions):
    cache.get.return_value = a_plot()

    use_case.execute(PROPERTY_REFERENCE)

    assert sessions.events == ["open", "close"]


def test_a_failing_service_opens_no_write_session(use_case, gateway, sessions):
    gateway.fetch.side_effect = CadastreUnavailable()

    with pytest.raises(CadastreUnavailable):
        use_case.execute(PROPERTY_REFERENCE)

    assert sessions.open_count == 1

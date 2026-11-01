"""GetCadastralProperty with simulated ports: validation, 30-day cache, no stale data."""

from datetime import datetime, timedelta, timezone
from unittest.mock import create_autospec

import pytest

from backend.app.external_data.application.get_cadastral_property import (
    CACHE_MAX_AGE,
    GetCadastralProperty,
)
from backend.app.external_data.domain.cadastral_reference import InvalidCadastralReference
from backend.app.external_data.domain.errors import CadastreNotFound, CadastreUnavailable
from backend.app.external_data.domain.ports import CadastreCache, CadastreGateway
from backend.tests.external_data.domain.test_cadastral_property import REFERENCE, a_property

NOW = datetime(2026, 11, 1, 10, 0, tzinfo=timezone.utc)


@pytest.fixture
def gateway():
    return create_autospec(CadastreGateway, spec_set=True, instance=True)


@pytest.fixture
def cache():
    stub = create_autospec(CadastreCache, spec_set=True, instance=True)
    stub.get.return_value = None
    return stub


@pytest.fixture
def use_case(gateway, cache):
    return GetCadastralProperty(gateway, cache, clock=lambda: NOW)


def test_the_cache_window_is_thirty_days():
    assert CACHE_MAX_AGE == timedelta(days=30)


def test_a_cached_property_is_returned_without_calling_the_service(use_case, gateway, cache):
    cache.get.return_value = a_property()

    result = use_case.execute(REFERENCE)

    assert result == a_property()
    cache.get.assert_called_once_with(REFERENCE, CACHE_MAX_AGE)
    gateway.fetch.assert_not_called()
    cache.put.assert_not_called()


def test_a_miss_queries_the_service_stores_the_result_and_returns_it(use_case, gateway, cache):
    gateway.fetch.return_value = a_property()

    result = use_case.execute(REFERENCE)

    assert result == a_property()
    gateway.fetch.assert_called_once_with(REFERENCE)
    cache.put.assert_called_once_with(a_property(), NOW)


def test_the_reference_is_normalized_before_the_cache_and_the_service(use_case, gateway, cache):
    gateway.fetch.return_value = a_property()

    use_case.execute(" 9872023vh5797s 0001wx ")

    cache.get.assert_called_once_with(REFERENCE, CACHE_MAX_AGE)
    gateway.fetch.assert_called_once_with(REFERENCE)


@pytest.mark.parametrize("raw", ["", "9872023VH5797S", "ABC", "9872023VH5797S0001W-"])
def test_an_invalid_reference_never_reaches_the_cache_or_the_service(use_case, gateway, cache, raw):
    with pytest.raises(InvalidCadastralReference):
        use_case.execute(raw)

    cache.get.assert_not_called()
    gateway.fetch.assert_not_called()


@pytest.mark.parametrize("error", [CadastreNotFound, CadastreUnavailable])
def test_service_errors_propagate_and_nothing_is_stored(use_case, gateway, cache, error):
    gateway.fetch.side_effect = error()

    with pytest.raises(error):
        use_case.execute(REFERENCE)

    cache.put.assert_not_called()


def test_when_the_service_fails_no_expired_cache_is_used(use_case, gateway, cache):
    """The cache answers None for an expired entry; the use case does not look further."""
    gateway.fetch.side_effect = CadastreUnavailable()

    with pytest.raises(CadastreUnavailable):
        use_case.execute(REFERENCE)

    assert cache.get.call_count == 1
    assert cache.get.call_args.args[1] == timedelta(days=30)


def test_the_default_clock_is_timezone_aware_utc(gateway, cache):
    gateway.fetch.return_value = a_property()

    GetCadastralProperty(gateway, cache).execute(REFERENCE)

    fetched_at = cache.put.call_args.args[1]
    assert fetched_at.utcoffset() == timedelta(0)

"""Photovoltaic yield: the rounded location that keys the cache, and the assumptions."""

import math

import pytest

from backend.app.external_data.domain.pv import (
    LOCATION_DECIMALS,
    PEAK_POWER_KWP,
    SYSTEM_LOSS_PCT,
    InvalidPvData,
    PvLocation,
    PvYield,
)


def a_yield(**overrides):
    values = {
        "location": PvLocation(38.640, 0.039),
        "annual_kwh_per_kwp": 1617.61,
        "optimal_slope_deg": 35.0,
        "optimal_azimuth_deg": -3.0,
    }
    values.update(overrides)
    return PvYield(**values)


def test_the_reference_system_is_one_kilowatt_peak_with_fourteen_percent_losses():
    assert (PEAK_POWER_KWP, SYSTEM_LOSS_PCT) == (1, 14)


def test_a_location_is_rounded_to_three_decimals_about_a_hundred_metres():
    location = PvLocation(38.64049, 0.03951)

    assert LOCATION_DECIMALS == 3
    assert (location.latitude, location.longitude) == (38.64, 0.04)


def test_nearby_positions_share_the_cache_key_and_distant_ones_do_not():
    assert PvLocation(38.6402, 0.0392).key == PvLocation(38.6398, 0.03921).key
    assert PvLocation(38.6402, 0.0392).key != PvLocation(38.6415, 0.0392).key


def test_the_key_has_fixed_decimals_and_never_a_negative_zero():
    assert PvLocation(38.6, 0.0).key == "38.600,0.000"
    assert PvLocation(-0.0004, -0.0004).key == "0.000,0.000"
    assert PvLocation(40.4148, -3.7032).key == "40.415,-3.703"


@pytest.mark.parametrize(
    "args",
    [(91.0, 0.0), (-91.0, 0.0), (0.0, 181.0), (math.nan, 0.0), (0.0, math.inf)],
)
def test_a_location_outside_the_globe_is_rejected(args):
    with pytest.raises(InvalidPvData):
        PvLocation(*args)


def test_to_dict_has_the_api_shape_with_the_assumptions_in_english():
    assert a_yield().to_dict() == {
        "annual_kwh_per_kwp": 1617.61,
        "assumptions": {
            "peak_power_kwp": 1,
            "system_loss_pct": 14,
            "optimal_angles": True,
            "slope_deg": 35.0,
            "azimuth_deg": -3.0,
        },
    }


def test_unknown_optimal_angles_are_null_not_missing():
    assumptions = a_yield(optimal_slope_deg=None, optimal_azimuth_deg=None).to_dict()["assumptions"]

    assert assumptions["slope_deg"] is None and assumptions["azimuth_deg"] is None


def test_from_dict_rebuilds_the_yield_and_ignores_other_keys():
    stored = {**a_yield().to_dict(), "extra": 1}

    assert PvYield.from_dict(PvLocation(38.640, 0.039), stored) == a_yield()


@pytest.mark.parametrize("bad", [-1.0, math.nan, math.inf])
def test_an_annual_yield_must_be_a_finite_non_negative_number(bad):
    with pytest.raises(InvalidPvData):
        a_yield(annual_kwh_per_kwp=bad)

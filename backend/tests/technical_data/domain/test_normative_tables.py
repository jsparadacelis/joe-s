"""RGB-27: deterministic CTE and NCSE-02 tables (climate zone, seismic acceleration and K, wind
zone, snow zone). Expected values below were read in the official documents (see
docs/plans/RGB-27/implementation_log.md); nothing is a default or a guess."""

import pytest

from backend.app.technical_data.domain.catalog import definition_of
from backend.app.technical_data.domain.normative_tables import (
    NormativeValue,
    climate_zone,
    seismic_acceleration,
    seismic_k,
    snow_zone,
    wind_zone,
)

BARCELONA, VALENCIA = "08", "46"


def _value(result: NormativeValue | None) -> str | None:
    return None if result is None else result.value


@pytest.mark.parametrize(
    ("province", "altitude", "zone"),
    [
        (BARCELONA, 0, "C2"),
        (BARCELONA, 250, "C2"),
        (BARCELONA, 251, "D2"),
        (BARCELONA, 450, "D2"),
        (BARCELONA, 451, "D1"),
        (BARCELONA, 750, "D1"),
        (BARCELONA, 751, "E1"),
        (BARCELONA, 1500, "E1"),
        (VALENCIA, 0, "B3"),
        (VALENCIA, 50, "B3"),
        (VALENCIA, 51, "C3"),
        (VALENCIA, 500, "C3"),
        (VALENCIA, 501, "D2"),
        (VALENCIA, 950, "D2"),
        (VALENCIA, 951, "E1"),
        (VALENCIA, 1400, "E1"),
    ],
)
def test_climate_zone_at_the_altitude_limits_of_the_table(province, altitude, zone):
    assert _value(climate_zone(province, altitude)) == zone


def test_climate_zone_rounds_the_altitude_to_whole_metres_like_the_table():
    assert _value(climate_zone(BARCELONA, 250.4)) == "C2"
    assert _value(climate_zone(BARCELONA, 250.5)) == "D2"


def test_a_below_sea_level_altitude_falls_in_the_lowest_band():
    assert _value(climate_zone(BARCELONA, -3)) == "C2"


def test_climate_zone_is_unavailable_for_a_province_that_is_not_transcribed():
    assert climate_zone("28", 650) is None
    assert climate_zone("", 650) is None
    assert climate_zone("ZZ", 650) is None


def test_climate_zone_carries_source_and_table():
    result = climate_zone(BARCELONA, 12)

    assert result is not None
    assert result.source == "cte"
    assert "Anejo B" in result.table
    assert result.status == "ok"


@pytest.mark.parametrize(
    ("ine_code", "acceleration"),
    [
        ("08019", "0,04 g"),  # Barcelona
        ("08131", "0,09 g"),  # Montesquiu
        ("08112", "0,08 g"),  # Manlleu
        ("08187", "0,04 g"),  # Sabadell
        ("46250", "0,06 g"),  # València
        ("46131", "0,07 g"),  # Gandia
        ("46145", "0,07 g"),  # Xàtiva
        ("46220", "0,04 g"),  # Sagunt
        ("46010", "0,04 g"),  # Albalat dels Tarongers
    ],
)
def test_seismic_acceleration_of_listed_municipalities(ine_code, acceleration):
    assert _value(seismic_acceleration(ine_code)) == acceleration
    assert _value(seismic_k(ine_code)) == "1,0"


def test_a_municipality_renamed_since_2002_is_found_by_its_current_ine_code():
    # NCSE-02 says "ALFARP"; INE renamed it "Alfarb" in 2023 (code 46026).
    assert _value(seismic_acceleration("46026")) == "0,07 g"


def test_a_municipality_missing_from_annex_1_of_a_transcribed_province_is_below_threshold():
    requena = seismic_acceleration("46213")

    assert requena is not None
    assert requena.value == "< 0,04 g"
    assert requena.status == "ok"
    assert seismic_k("46213") is None


def test_the_default_below_threshold_in_barcelona_waits_for_review_of_an_unresolved_entry():
    calaf = seismic_acceleration("08031")

    assert calaf is not None
    assert calaf.value == "< 0,04 g"
    assert calaf.status == "verify"


@pytest.mark.parametrize("code", ["08999", "46999", "99999", "28079", "", "8019", "abcde", None])
def test_seismic_acceleration_is_unavailable_for_unknown_municipalities(code):
    assert seismic_acceleration(code) is None
    assert seismic_k(code) is None


def test_seismic_acceleration_carries_source_and_table():
    result = seismic_acceleration("46250")

    assert result is not None
    assert result.source == "ncse"
    assert "Anejo 1" in result.table


@pytest.mark.parametrize(
    ("province", "wind", "snow"), [(BARCELONA, "C", "2"), (VALENCIA, "A", "5")]
)
def test_wind_and_snow_zones_read_from_the_maps_wait_for_review(province, wind, snow):
    wind_result, snow_result = wind_zone(province), snow_zone(province)

    assert (_value(wind_result), _value(snow_result)) == (wind, snow)
    assert wind_result.status == snow_result.status == "verify"
    assert wind_result.source == snow_result.source == "cte"
    assert "figura D.1" in wind_result.table
    assert "figura E.2" in snow_result.table


def test_wind_and_snow_zones_are_unavailable_for_a_province_that_is_not_transcribed():
    assert wind_zone("28") is None
    assert snow_zone("28") is None
    assert wind_zone(None) is None


def test_every_returned_value_is_an_option_of_the_catalog_with_the_catalog_source():
    from backend.app.technical_data.domain import normative_tables

    checks = [
        ("climateZone", [climate_zone(p, h) for p in ("08", "46") for h in range(0, 1600, 7)]),
        ("windZone", [wind_zone(p) for p in ("08", "46")]),
        ("snowZone", [snow_zone(p) for p in ("08", "46")]),
        ("seismicAcceleration", [seismic_acceleration(c) for c in normative_tables.all_codes()]),
        ("kCoefficient", [seismic_k(c) for c in normative_tables.all_codes()]),
    ]
    for datum, results in checks:
        definition = definition_of(datum)
        values = [r for r in results if r is not None]
        assert values, datum
        for result in values:
            assert result.value in definition.options, (datum, result)
            assert result.source == definition.source.value, (datum, result)


def test_all_codes_lists_every_municipality_of_both_provinces():
    from backend.app.technical_data.domain import normative_tables

    codes = normative_tables.all_codes()

    assert len(codes) == 577  # 311 in Barcelona + 266 in Valencia (INE, 1-1-2026)
    assert len(set(codes)) == 577
    assert {c[:2] for c in codes} == {"08", "46"}

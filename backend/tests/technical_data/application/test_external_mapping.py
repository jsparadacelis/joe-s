"""From plot, terrain and PV answers to values for the catalog (screen format: decimal comma)."""

from backend.app.external_data.domain.pv import PvLocation, PvYield
from backend.app.external_data.domain.terrain import SLOPE_CATEGORIES, TerrainProfile
from backend.app.technical_data.application.external_mapping import (
    INSPIRE_FIELDS,
    OPEN_METEO_FIELDS,
    PVGIS_FIELDS,
    map_plot,
    map_pv,
    map_terrain,
)
from backend.app.technical_data.domain.catalog import CATALOG, Source, definition_of
from backend.tests.external_data.domain.test_plot import REFERENCE, _plot_from_metres


def test_the_field_lists_are_the_catalog_data_of_each_origin():
    for fields, source in [
        (INSPIRE_FIELDS, Source.INSPIRE),
        (PVGIS_FIELDS, Source.PVGIS),
    ]:
        assert set(fields) == {d.id for d in CATALOG if d.source is source}
    assert set(OPEN_METEO_FIELDS) == {
        d.id for d in CATALOG if d.source is Source.OPEN_METEO or d.id.startswith("slope")
    }
    assert definition_of("slope").source is Source.CALCULATED


def test_the_polygon_area_has_up_to_one_decimal_with_a_comma():
    plot = _plot_from_metres([(0, 0), (10.05, 0), (10.05, 10), (0, 10)])

    assert map_plot(plot) == {"polygonPlotArea": "100,5"}


def test_a_whole_area_has_no_decimals():
    plot = _plot_from_metres([(0, 0), (100, 0), (100, 100), (0, 100)])

    assert map_plot(plot) == {"polygonPlotArea": "10000"}


def test_the_terrain_gives_altitude_slope_and_its_category():
    assert map_terrain(TerrainProfile(REFERENCE, 33.0, 4.2)) == {
        "altitude": "33",
        "slope": "4,2",
        "slopeType": SLOPE_CATEGORIES[1],
    }


def test_the_altitude_keeps_its_decimal_and_a_negative_one_its_sign():
    assert map_terrain(TerrainProfile(REFERENCE, -2.5, 0.0))["altitude"] == "-2,5"


def test_without_a_slope_only_the_altitude_is_mapped():
    assert map_terrain(TerrainProfile(REFERENCE, 33.0, None)) == {"altitude": "33"}


def test_the_pv_yield_is_whole_kwh_per_kwp_and_year():
    assert map_pv(PvYield(PvLocation(38.64, 0.039), 1617.61)) == {"pvProduction": "1618"}


def test_a_tiny_negative_altitude_is_not_written_as_minus_zero():
    assert map_terrain(TerrainProfile(REFERENCE, -0.04, 0.0))["altitude"] == "0"

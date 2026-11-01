"""From what the Catastro says about a property to values for the catalog."""

from backend.app.external_data.domain.cadastral_property import PropertyClass
from backend.app.technical_data.application.cadastral_mapping import CADASTRE_FIELDS, map_property
from backend.app.technical_data.domain.catalog import CATALOG, DataGroup, Source
from backend.tests.external_data.domain.test_cadastral_property import a_property


def test_maps_the_property_to_catalog_values_in_the_format_of_the_screen():
    mapped = map_property(a_property())

    assert mapped == {
        "address": "CL EJEMPLO 1 00000 MUNICIPIO DE EJEMPLO (PROVINCIA DE EJEMPLO)",
        "municipality": "MUNICIPIO DE EJEMPLO (PROVINCIA DE EJEMPLO)",
        "propertyClass": "Urbano",
        "use": "Residencial",
        "year": "1980",
        "builtArea": "308",
        "cadastralPlotArea": "120",
        "coords": "38,5000 N · 3,5000 W",
    }


def test_a_rustic_property_is_rustico():
    assert map_property(a_property(property_class=PropertyClass.RUSTIC))["propertyClass"] == (
        "Rústico"
    )


def test_southern_and_eastern_coordinates_use_their_hemisphere_letters():
    mapped = map_property(a_property(latitude=-12.34567, longitude=2.25))

    assert mapped["coords"] == "12,3457 S · 2,2500 E"


def test_a_use_is_matched_with_the_options_ignoring_case_and_written_as_the_option():
    assert map_property(a_property(use="oficinas"))["use"] == "Oficinas"


def test_a_use_outside_the_options_is_not_mapped():
    assert "use" not in map_property(a_property(use="Mixed uses"))


def test_what_the_catastro_does_not_give_is_not_mapped():
    mapped = map_property(
        a_property(
            property_class=None,
            use=None,
            construction_year=None,
            built_area_m2=None,
            plot_area_m2=None,
            latitude=None,
            longitude=None,
            province="",
        )
    )

    assert set(mapped) == {"address", "municipality"}
    assert mapped["municipality"] == "MUNICIPIO DE EJEMPLO"


def test_one_coordinate_alone_is_not_mapped():
    assert "coords" not in map_property(a_property(longitude=None))


def test_only_origin_data_of_the_catastro_are_mapped_never_planning_ones():
    by_id = {d.id: d for d in CATALOG}

    assert all(by_id[field_id].source is Source.CATASTRO for field_id in CADASTRE_FIELDS)
    assert not any(by_id[field_id].group is DataGroup.PLANNING for field_id in CADASTRE_FIELDS)
    assert set(map_property(a_property())) <= set(CADASTRE_FIELDS)

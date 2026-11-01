"""The cadastral property model: no ownership data, and a lossless JSON round trip."""

import dataclasses

import pytest

from backend.app.external_data.domain.cadastral_property import (
    BuildingUnit,
    CadastralProperty,
    PropertyClass,
)
from backend.app.external_data.domain.errors import CadastreNotFound, CadastreUnavailable

REFERENCE = "9872023VH5797S0001WX"


def a_property(**overrides) -> CadastralProperty:
    values = {
        "reference": REFERENCE,
        "address": "CL EJEMPLO 1 00000 MUNICIPIO DE EJEMPLO (PROVINCIA DE EJEMPLO)",
        "municipality": "MUNICIPIO DE EJEMPLO",
        "province": "PROVINCIA DE EJEMPLO",
        "property_class": PropertyClass.URBAN,
        "use": "Residencial",
        "construction_year": 1980,
        "built_area_m2": 308,
        "plot_area_m2": 120,
        "units": (BuildingUnit(use="VIVIENDA", floor="00", area_m2=109),),
        "latitude": 38.5,
        "longitude": -3.5,
    }
    values.update(overrides)
    return CadastralProperty(**values)


def test_the_round_trip_through_a_dictionary_keeps_everything():
    original = a_property()

    assert CadastralProperty.from_dict(original.to_dict()) == original


def test_the_round_trip_keeps_missing_optional_values():
    original = a_property(
        property_class=None,
        construction_year=None,
        built_area_m2=None,
        plot_area_m2=None,
        units=(),
        latitude=None,
        longitude=None,
    )

    assert CadastralProperty.from_dict(original.to_dict()) == original


def test_the_dictionary_uses_english_keys_and_plain_json_values():
    data = a_property().to_dict()

    assert data["property_class"] == "urban"
    assert data["units"] == [{"use": "VIVIENDA", "floor": "00", "area_m2": 109}]
    assert set(data) == {
        "reference",
        "address",
        "municipality",
        "province",
        "property_class",
        "use",
        "construction_year",
        "built_area_m2",
        "plot_area_m2",
        "units",
        "latitude",
        "longitude",
    }


def test_from_dict_ignores_any_extra_key_such_as_an_owner():
    data = a_property().to_dict() | {"owner": "Someone", "nif": "00000000T"}

    restored = CadastralProperty.from_dict(data)

    assert restored == a_property()
    assert not hasattr(restored, "owner")


def test_no_model_field_can_hold_ownership_data():
    names = {f.name for f in dataclasses.fields(CadastralProperty)} | {
        f.name for f in dataclasses.fields(BuildingUnit)
    }

    assert not {n for n in names if any(w in n for w in ("owner", "holder", "nif", "titular"))}


def test_the_model_is_immutable():
    with pytest.raises(dataclasses.FrozenInstanceError):
        a_property().address = "other"  # type: ignore[misc]


def test_the_two_failures_are_distinct_errors_with_their_spanish_messages():
    assert CadastreNotFound().code == "cadastral_reference_not_found"
    assert CadastreNotFound().message == "No se encontró esa referencia en el Catastro."
    assert CadastreUnavailable().code == "cadastre_unavailable"
    assert (
        CadastreUnavailable().message
        == "No se pudo consultar el Catastro. Introduce los datos a mano."
    )
    assert not issubclass(CadastreNotFound, CadastreUnavailable)

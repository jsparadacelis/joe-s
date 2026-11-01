"""What each type of datum accepts, and how the accepted value is stored."""

import pytest

from backend.app.technical_data.domain.catalog import definition_of
from backend.app.technical_data.domain.errors import InvalidDatumValue
from backend.app.technical_data.domain.values import normalize_value


@pytest.mark.parametrize(
    ("field_id", "raw", "stored"),
    [
        ("address", "  CL EJEMPLO 12  ", "CL EJEMPLO 12"),
        ("builtArea", "142", "142"),
        ("builtArea", "99.4", "99,4"),
        ("builtArea", " 99,4 ", "99,4"),
        ("builtArea", "0", "0"),
        ("year", "1958", "1958"),
        ("altitude", "-12", "-12"),
        ("maxOccupancy", "100", "100"),
        ("propertyClass", "Rústico", "Rústico"),
        ("seismicAcceleration", "< 0,04 g", "< 0,04 g"),
        ("floors", " PB+2 ", "PB+2"),
    ],
)
def test_a_valid_value_is_stored_trimmed_and_with_a_decimal_comma(field_id, raw, stored):
    assert normalize_value(definition_of(field_id), raw) == stored


@pytest.mark.parametrize(
    ("field_id", "raw"),
    [
        ("address", ""),
        ("address", "   "),
        ("address", "x" * 201),
        ("address", "bad\x00text"),
        ("builtArea", ""),
        ("builtArea", "abc"),
        ("builtArea", "1,2,3"),
        ("builtArea", "1.2.3"),
        ("builtArea", "12,"),
        ("builtArea", "1e5"),
        ("builtArea", "-5"),
        ("builtArea", "10000001"),
        ("builtArea", "١٢"),
        ("year", "1958,5"),
        ("year", "999"),
        ("year", "2101"),
        ("maxOccupancy", "100,5"),
        ("altitude", "-501"),
        ("altitude", "9001"),
        ("propertyClass", "Urbana"),
        ("propertyClass", "urbano"),
        ("windZone", "D"),
        ("floors", ""),
    ],
)
def test_an_invalid_value_is_rejected(field_id, raw):
    with pytest.raises(InvalidDatumValue):
        normalize_value(definition_of(field_id), raw)


def test_a_value_that_is_not_text_is_rejected():
    with pytest.raises(InvalidDatumValue):
        normalize_value(definition_of("builtArea"), 142)


def test_the_error_message_is_in_spanish_and_names_the_options_of_a_list():
    with pytest.raises(InvalidDatumValue) as caught:
        normalize_value(definition_of("windZone"), "D")

    assert caught.value.code == "invalid_datum_value"
    assert "A, B, C" in caught.value.message

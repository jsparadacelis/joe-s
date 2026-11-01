"""One technical datum: value, source, original, verified. Editing never loses the original."""

import pytest

from backend.app.technical_data.domain.catalog import Source
from backend.app.technical_data.domain.datum import TechnicalDatum
from backend.app.technical_data.domain.errors import EmptyDatum, InvalidDatumValue


def a_queried_datum(**overrides):
    values = {
        "field_id": "builtArea",
        "value": "142",
        "source": Source.CATASTRO,
        "original": "142",
        "verified": True,
    }
    values.update(overrides)
    return TechnicalDatum(**values)


def a_manual_datum(**overrides):
    values = {
        "field_id": "maxHeight",
        "value": "10,5",
        "source": Source.MANUAL,
        "original": None,
        "verified": True,
    }
    values.update(overrides)
    return TechnicalDatum(**values)


def test_a_datum_is_edited_when_it_has_an_original_and_differs_from_it():
    assert a_queried_datum(value="138").edited is True
    assert a_queried_datum().edited is False


def test_a_manual_datum_is_never_edited():
    assert a_manual_datum(value="12").edited is False


def test_editing_keeps_the_original_changes_the_value_and_unverifies():
    edited = a_queried_datum().edit("138")

    assert (edited.value, edited.original, edited.verified, edited.edited) == (
        "138",
        "142",
        False,
        True,
    )
    assert edited.source is Source.CATASTRO


def test_editing_validates_by_type_and_leaves_the_datum_alone_when_it_fails():
    datum = a_queried_datum()

    with pytest.raises(InvalidDatumValue):
        datum.edit("not a number")

    assert datum == a_queried_datum()


def test_editing_back_to_the_original_value_is_no_longer_an_edit():
    assert a_queried_datum(value="138", verified=False).edit("142").edited is False


def test_a_decimal_point_is_stored_as_a_comma():
    assert a_queried_datum().edit("99.5").value == "99,5"


def test_editing_a_datum_that_never_came_from_a_query_makes_it_manual():
    blank = TechnicalDatum(field_id="address", value="", source=Source.CATASTRO)

    entered = blank.edit("CL EJEMPLO 1")

    assert (entered.value, entered.source, entered.original) == (
        "CL EJEMPLO 1",
        Source.MANUAL,
        None,
    )
    assert entered.edited is False


def test_restoring_goes_back_to_the_original_and_unverifies():
    restored = a_queried_datum(value="138", verified=True).restore()

    assert (restored.value, restored.verified, restored.edited) == ("142", False, False)


def test_restoring_a_manual_datum_does_nothing():
    datum = a_manual_datum()

    assert datum.restore() == datum


def test_restoring_a_datum_that_was_not_edited_keeps_it_verified():
    datum = a_queried_datum()

    assert datum.restore() == datum


def test_verifying_marks_it_verified_and_keeps_the_rest():
    verified = a_queried_datum(value="138", verified=False).verify()

    assert (verified.value, verified.original, verified.verified) == ("138", "142", True)


def test_an_empty_datum_cannot_be_verified():
    with pytest.raises(EmptyDatum):
        TechnicalDatum(field_id="maxHeight", value="", source=Source.MANUAL).verify()


class TestRefreshed:
    def test_a_datum_that_was_not_edited_takes_the_new_value_and_original(self):
        refreshed = a_queried_datum(verified=True).refreshed("150")

        assert (refreshed.value, refreshed.original, refreshed.verified) == ("150", "150", False)

    def test_a_datum_whose_value_did_not_change_stays_verified(self):
        refreshed = a_queried_datum(verified=True).refreshed("142")

        assert refreshed == a_queried_datum(verified=True)

    def test_an_edited_datum_keeps_the_persons_value_and_verification(self):
        edited = a_queried_datum(value="138", verified=True)

        refreshed = edited.refreshed("150")

        assert (refreshed.value, refreshed.original, refreshed.verified) == ("138", "150", True)
        assert refreshed.edited is True

    def test_an_edited_datum_whose_value_equals_the_new_original_stops_being_edited(self):
        refreshed = a_queried_datum(value="150").refreshed("150")

        assert refreshed.edited is False

    def test_a_blank_datum_is_filled_from_the_query(self):
        blank = TechnicalDatum(field_id="builtArea", value="", source=Source.CATASTRO)

        filled = blank.refreshed("142")

        assert (filled.value, filled.original, filled.source, filled.verified) == (
            "142",
            "142",
            Source.CATASTRO,
            False,
        )

    def test_a_value_entered_by_hand_after_a_failed_query_is_replaced(self):
        by_hand = TechnicalDatum(
            field_id="builtArea", value="99", source=Source.MANUAL, original=None, verified=True
        )

        filled = by_hand.refreshed("142")

        assert (filled.value, filled.original, filled.source, filled.verified) == (
            "142",
            "142",
            Source.CATASTRO,
            False,
        )

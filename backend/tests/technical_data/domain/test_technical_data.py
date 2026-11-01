"""The whole sheet of a project: complete by the catalog, with the bulk operations."""

import pytest

from backend.app.technical_data.domain.catalog import CATALOG, Source
from backend.app.technical_data.domain.datum import TechnicalDatum
from backend.app.technical_data.domain.errors import EmptyDatum, UnknownDatum
from backend.app.technical_data.domain.technical_data import TechnicalData


def a_queried_row(field_id, original, **overrides):
    values = {
        "field_id": field_id,
        "value": original,
        "source": Source.CATASTRO,
        "original": original,
        "verified": False,
    }
    values.update(overrides)
    return TechnicalDatum(**values)


def a_sheet(*rows):
    return TechnicalData.from_rows(rows)


def test_an_empty_sheet_has_every_datum_of_the_catalog_in_order_and_blank():
    sheet = TechnicalData.from_rows([])

    assert [d.field_id for d in sheet.data] == [d.id for d in CATALOG]
    assert all(d.value == "" and d.original is None and not d.verified for d in sheet.data)
    assert [d.source for d in sheet.data] == [d.source for d in CATALOG]


def test_stored_rows_replace_the_blanks_and_the_order_stays_the_catalogs():
    sheet = a_sheet(a_queried_row("year", "1958"), a_queried_row("address", "CL EJEMPLO 1"))

    assert sheet.get("year").value == "1958"
    assert sheet.get("address").value == "CL EJEMPLO 1"
    assert [d.field_id for d in sheet.data] == [d.id for d in CATALOG]


def test_a_stored_row_of_an_unknown_datum_is_rejected():
    with pytest.raises(UnknownDatum):
        a_sheet(a_queried_row("owner", "x"))


def test_getting_an_unknown_datum_is_rejected():
    with pytest.raises(UnknownDatum):
        a_sheet().get("owner")


def test_editing_returns_a_new_sheet_and_leaves_the_old_one_alone():
    sheet = a_sheet(a_queried_row("builtArea", "142"))

    edited = sheet.edit("builtArea", "138")

    assert edited.get("builtArea").value == "138"
    assert sheet.get("builtArea").value == "142"


def test_restoring_goes_back_to_the_original():
    sheet = a_sheet(a_queried_row("builtArea", "142", value="138"))

    assert sheet.restore("builtArea").get("builtArea").value == "142"


def test_verifying_one_datum_leaves_the_others_pending():
    sheet = a_sheet(a_queried_row("builtArea", "142"), a_queried_row("year", "1958"))

    verified = sheet.verify("year")

    assert verified.get("year").verified is True
    assert verified.get("builtArea").verified is False


def test_verifying_an_empty_datum_is_rejected():
    with pytest.raises(EmptyDatum):
        a_sheet().verify("maxHeight")


def test_verify_all_verifies_every_datum_with_a_value_and_skips_the_blank_ones():
    sheet = a_sheet(a_queried_row("builtArea", "142"), a_queried_row("year", "1958"))

    verified = sheet.verify_all()

    assert {d.field_id for d in verified.data if d.verified} == {"builtArea", "year"}
    assert verified.get("maxHeight").verified is False


def test_changes_since_lists_only_the_data_that_differ():
    before = a_sheet(a_queried_row("builtArea", "142"), a_queried_row("year", "1958"))

    after = before.edit("builtArea", "138")

    assert [d.field_id for d in after.changes_since(before)] == ["builtArea"]
    assert after.changes_since(after) == ()


class TestRefresh:
    def test_the_queried_values_fill_the_blank_data(self):
        outcome = a_sheet().refresh({"address": "CL EJEMPLO 1", "year": "1958"})

        assert outcome.sheet.get("address").value == "CL EJEMPLO 1"
        assert outcome.sheet.get("year").original == "1958"
        assert outcome.not_applied == ()

    def test_edited_and_verified_data_keep_the_persons_value(self):
        sheet = a_sheet(a_queried_row("builtArea", "142", value="138", verified=True))

        refreshed = sheet.refresh({"builtArea": "150"}).sheet.get("builtArea")

        assert (refreshed.value, refreshed.original, refreshed.verified) == ("138", "150", True)

    def test_the_manual_planning_data_are_never_touched(self):
        planning = TechnicalDatum(
            field_id="maxHeight", value="10,5", source=Source.MANUAL, verified=True
        )
        sheet = a_sheet(planning)

        outcome = sheet.refresh({"maxHeight": "99", "year": "1958"})

        assert outcome.sheet.get("maxHeight") == planning
        assert outcome.not_applied == ("maxHeight",)

    def test_data_the_query_does_not_return_are_left_as_they_are(self):
        sheet = a_sheet(
            a_queried_row("altitude", "490", value="500", verified=True),
            a_queried_row("year", "1958", verified=True),
        )

        outcome = sheet.refresh({"year": "1960"})

        assert outcome.sheet.get("altitude") == sheet.get("altitude")
        assert outcome.sheet.get("year").value == "1960"

    def test_a_value_that_does_not_fit_its_field_is_not_written_and_is_reported(self):
        sheet = a_sheet(a_queried_row("use", "Residencial", verified=True))

        outcome = sheet.refresh({"use": "Mixed use", "year": "1958"})

        assert outcome.sheet.get("use") == sheet.get("use")
        assert outcome.sheet.get("year").value == "1958"
        assert outcome.not_applied == ("use",)

    def test_an_unknown_datum_in_the_query_is_rejected(self):
        with pytest.raises(UnknownDatum):
            a_sheet().refresh({"owner": "x"})

    def test_refreshing_with_an_empty_query_changes_nothing(self):
        sheet = a_sheet(a_queried_row("year", "1958"))

        outcome = sheet.refresh({})

        assert outcome.sheet == sheet

"""Photo of the technical data that is frozen with the brief (RGB-32).

Names fixed here: backend.app.briefing.application.technical_snapshot with
snapshot(data: TechnicalData, query: QueryRecord | None) -> dict and
obtained(data: TechnicalData) -> bool.
"""

from datetime import datetime, timezone

from backend.app.briefing.application.technical_snapshot import obtained, snapshot
from backend.app.technical_data.domain.catalog import CATALOG, Source
from backend.app.technical_data.domain.datum import TechnicalDatum
from backend.app.technical_data.domain.ports import QueryRecord
from backend.app.technical_data.domain.technical_data import TechnicalData

REFERENCE = "0000000AA0000A0000AA"
WHEN = datetime(2026, 11, 1, 9, 30, tzinfo=timezone.utc)


def a_sheet(*rows):
    return TechnicalData.from_rows(rows)


def test_every_datum_of_the_catalog_is_in_the_photo_in_order():
    photo = snapshot(a_sheet(), None)

    assert [d["id"] for d in photo["data"]] == [d.id for d in CATALOG]


def test_a_datum_keeps_value_source_original_edited_and_verified():
    sheet = a_sheet(
        TechnicalDatum("address", "Street 1 (sample)", Source.CATASTRO, "Street 1", True),
        TechnicalDatum("year", "1990", Source.MANUAL),
    )

    data = {d["id"]: d for d in snapshot(sheet, None)["data"]}

    assert data["address"] == {
        "id": "address",
        "value": "Street 1 (sample)",
        "source": "catastro",
        "original": "Street 1",
        "edited": True,
        "verified": True,
    }
    assert data["year"]["original"] is None
    assert data["year"]["source"] == "manual"
    assert data["year"]["verified"] is False


def test_unverified_lists_only_data_with_a_value_that_are_not_verified():
    sheet = a_sheet(
        TechnicalDatum("address", "x", Source.CATASTRO, "x", True),
        TechnicalDatum("year", "1990", Source.CATASTRO, "1990", False),
        TechnicalDatum("use", "Residencial", Source.MANUAL),
    )

    assert snapshot(sheet, None)["unverified"] == ["use", "year"]  # catalog order


def test_the_query_is_part_of_the_photo():
    photo = snapshot(a_sheet(), QueryRecord(REFERENCE, WHEN))

    assert photo["cadastral_reference"] == REFERENCE
    assert photo["queried_at"] == "2026-11-01T09:30:00Z"


def test_without_a_query_those_are_null():
    photo = snapshot(a_sheet(), None)

    assert (photo["cadastral_reference"], photo["queried_at"]) == (None, None)


def test_the_photo_is_plain_json():
    import json

    photo = snapshot(a_sheet(TechnicalDatum("address", "x", Source.MANUAL)), None)

    assert json.loads(json.dumps(photo)) == photo


def test_obtained_needs_at_least_one_value():
    assert obtained(a_sheet()) is False
    assert obtained(a_sheet(TechnicalDatum("address", "x", Source.MANUAL))) is True

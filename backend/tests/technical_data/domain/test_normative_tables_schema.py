"""RGB-27: schema of the packaged JSON tables (metadata, status per entry, catalog options)."""

import json
import re
from datetime import date
from pathlib import Path

import pytest

from backend.app.technical_data.domain.catalog import definition_of

TABLES = Path(__file__).resolve().parents[3] / "app" / "technical_data" / "tables"
META_KEYS = {
    "source",
    "table",
    "document",
    "url",
    "version",
    "transcribed_on",
    "pages",
    "sha256",
    "notes",
}
FILES = ["climate_zones", "seismic", "wind_zones", "snow_zones"]


def _load(name: str) -> dict:
    return json.loads((TABLES / f"{name}.json").read_text(encoding="utf-8"))


@pytest.mark.parametrize("name", FILES)
def test_each_table_declares_its_source_document_version_and_transcription_date(name):
    meta = _load(name)["meta"]

    assert set(meta) >= META_KEYS
    assert meta["source"] in {"cte", "ncse"}
    assert meta["url"].startswith("https://")
    assert re.fullmatch(r"[0-9a-f]{64}", meta["sha256"])
    date.fromisoformat(meta["transcribed_on"])
    assert all(str(meta[key]).strip() for key in META_KEYS)


@pytest.mark.parametrize("name", FILES)
def test_every_entry_has_a_status_and_verify_entries_explain_why(name):
    document = _load(name)
    entries = list(document["provinces"].values())
    entries += document.get("municipalities", {}).values()
    entries += document.get("unresolved", [])

    assert entries
    for entry in entries:
        assert entry["status"] in {"ok", "verify"}
        if entry["status"] == "verify":
            assert entry.get("note", "").strip()


def test_climate_bands_are_ordered_end_open_and_inside_the_catalog_options():
    options = definition_of("climateZone").options
    provinces = _load("climate_zones")["provinces"]

    assert set(provinces) == {"08", "46"}
    for code, province in provinces.items():
        limits = [band["max_altitude_m"] for band in province["bands"]]
        assert limits[-1] is None, code
        assert limits[:-1] == sorted(set(limits[:-1])), code
        assert all(band["zone"] in options for band in province["bands"]), code
        zones = [band["zone"] for band in province["bands"]]
        assert all(a != b for a, b in zip(zones, zones[1:], strict=False)), (
            code
        )  # adjacent bands are merged


def test_seismic_municipalities_use_catalog_options_and_belong_to_their_province():
    document = _load("seismic")
    accelerations = definition_of("seismicAcceleration").options
    ks = definition_of("kCoefficient").options

    assert set(document["provinces"]) == {"08", "46"}
    for code, municipality in document["municipalities"].items():
        province = document["provinces"][code[:2]]
        assert re.fullmatch(r"\d{5}", code)
        assert code in province["municipality_codes"]
        assert municipality["ab"] in accelerations
        assert municipality["ab"] != "< 0,04 g"  # Annex 1 lists only ab >= 0,04 g
        assert municipality["k"] in ks
        assert municipality["name_in_source"].strip()
        assert municipality["page"].strip()


def test_every_annex_1_entry_is_either_a_municipality_or_an_unresolved_entry():
    document = _load("seismic")
    # Entries read in Annex 1: 290 in Barcelona and 221 in Valencia (counted by the K tokens).
    by_province = {"08": 0, "46": 0}
    for code in document["municipalities"]:
        by_province[code[:2]] += 1
    for entry in document["unresolved"]:
        by_province[entry["province"]] += 1

    assert by_province == {"08": 290, "46": 221}
    for entry in document["unresolved"]:
        assert entry["status"] == "verify"
        assert entry["ab"] in definition_of("seismicAcceleration").options


def test_the_default_below_threshold_is_verify_where_an_entry_is_unresolved():
    document = _load("seismic")
    unresolved = {entry["province"] for entry in document["unresolved"]}

    for code, province in document["provinces"].items():
        expected = "verify" if code in unresolved else "ok"
        assert province["below_threshold_status"] == expected, code


@pytest.mark.parametrize(
    ("name", "datum"), [("wind_zones", "windZone"), ("snow_zones", "snowZone")]
)
def test_map_zones_use_catalog_options_and_are_marked_verify(name, datum):
    options = definition_of(datum).options
    provinces = _load(name)["provinces"]

    assert set(provinces) == {"08", "46"}
    for province in provinces.values():
        assert province["value"] in options
        assert province["status"] == "verify"

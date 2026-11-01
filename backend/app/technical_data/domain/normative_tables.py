"""Deterministic CTE and NCSE-02 lookups (RGB-27): climate zone, seismic acceleration and K,
wind zone and snow zone. Pure: the only I/O is reading the JSON tables packaged next to the
code, once, at import. A value that is not transcribed is `None`, never a guess; the single
rule that fills a gap is NCSE-02 2.1 (a municipality absent from Annex 1 has ab < 0,04 g).

Not wired into any use case or route yet: the transcription needs human review first."""

from __future__ import annotations

import json
import re
from dataclasses import dataclass
from math import floor
from pathlib import Path
from typing import Any

_TABLES = Path(__file__).resolve().parents[1] / "tables"
_BELOW_THRESHOLD = "< 0,04 g"
_PROVINCE_CODE = re.compile(r"\d{2}")
_INE_CODE = re.compile(r"\d{5}")


@dataclass(frozen=True)
class NormativeValue:
    """A looked-up value with where it comes from. `source` is the catalog source of the datum
    ("cte" or "ncse"); `status` is "ok" or "verify" (transcribed but pending human review)."""

    value: str
    source: str
    table: str
    status: str


def _load(name: str) -> dict[str, Any]:
    return json.loads((_TABLES / f"{name}.json").read_text(encoding="utf-8"))


_CLIMATE = _load("climate_zones")
_SEISMIC = _load("seismic")
_WIND = _load("wind_zones")
_SNOW = _load("snow_zones")


def _province_key(province_code: object) -> str | None:
    if isinstance(province_code, str) and _PROVINCE_CODE.fullmatch(province_code):
        return province_code
    return None


def climate_zone(province_code: str, altitude_m: float) -> NormativeValue | None:
    """CTE DB-HE Annex B: zone by province and altitude. The table is in whole metres, so the
    altitude is rounded to the nearest metre (half up) before looking up its band."""
    key = _province_key(province_code)
    province = _CLIMATE["provinces"].get(key) if key else None
    if province is None:
        return None
    metres = floor(altitude_m + 0.5)
    for band in province["bands"]:
        limit = band["max_altitude_m"]
        if limit is None or metres <= limit:
            meta = _CLIMATE["meta"]
            return NormativeValue(band["zone"], meta["source"], meta["table"], province["status"])
    return None  # unreachable: the last band has no limit


def _municipality_status(ine_code: object) -> tuple[dict[str, Any] | None, str | None]:
    """The Annex 1 entry (if listed) and the province key; `(None, None)` when the code is
    not a municipality of a transcribed province."""
    if not isinstance(ine_code, str) or not _INE_CODE.fullmatch(ine_code):
        return None, None
    province = _SEISMIC["provinces"].get(ine_code[:2])
    if province is None or ine_code not in province["municipality_codes"]:
        return None, None
    return _SEISMIC["municipalities"].get(ine_code), ine_code[:2]


def seismic_acceleration(ine_code: str) -> NormativeValue | None:
    """NCSE-02 Annex 1: basic seismic acceleration of a municipality (INE code, 5 digits)."""
    entry, province_key = _municipality_status(ine_code)
    if province_key is None:
        return None
    meta = _SEISMIC["meta"]
    if entry is not None:
        return NormativeValue(entry["ab"], meta["source"], meta["table"], entry["status"])
    status = _SEISMIC["provinces"][province_key]["below_threshold_status"]
    return NormativeValue(_BELOW_THRESHOLD, meta["source"], meta["table"], status)


def seismic_k(ine_code: str) -> NormativeValue | None:
    """NCSE-02 Annex 1: contribution coefficient K. Only listed municipalities have one."""
    entry, province_key = _municipality_status(ine_code)
    if entry is None or province_key is None:
        return None
    meta = _SEISMIC["meta"]
    return NormativeValue(entry["k"], meta["source"], meta["table"], entry["status"])


def _province_zone(document: dict[str, Any], province_code: object) -> NormativeValue | None:
    key = _province_key(province_code)
    province = document["provinces"].get(key) if key else None
    if province is None:
        return None
    meta = document["meta"]
    return NormativeValue(province["value"], meta["source"], meta["table"], province["status"])


def wind_zone(province_code: str) -> NormativeValue | None:
    """CTE DB-SE-AE Annex D.1, figure D.1 (map), by province."""
    return _province_zone(_WIND, province_code)


def snow_zone(province_code: str) -> NormativeValue | None:
    """CTE DB-SE-AE Annex E, figure E.2 (map of winter climate zones), by province."""
    return _province_zone(_SNOW, province_code)


def all_codes() -> list[str]:
    """INE codes of every municipality of the transcribed provinces."""
    return sorted(
        code
        for province in _SEISMIC["provinces"].values()
        for code in province["municipality_codes"]
    )

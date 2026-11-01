"""The PVGIS `PVcalc` parser: the annual yield and the optimal angles, nothing else."""

import json

import pytest

from backend.app.external_data.domain.errors import ExternalServiceUnavailable
from backend.app.external_data.domain.pv import PvLocation, PvYield
from backend.app.external_data.infrastructure.pvgis_parser import parse_pv_yield
from backend.tests.external_data.infrastructure.recorded import fixture

LOCATION = PvLocation(38.640, 0.039)


def recorded() -> dict:
    return json.loads(fixture("pvgis_ok.json"))


def parse(payload) -> PvYield:
    return parse_pv_yield(LOCATION, json.dumps(payload).encode())


def test_the_recorded_answer_gives_the_annual_yield_and_the_optimal_angles():
    assert parse_pv_yield(LOCATION, fixture("pvgis_ok.json")) == PvYield(
        LOCATION, 1617.61, 35.0, -3.0
    )


def test_without_the_mounting_angles_the_yield_is_still_valid():
    payload = recorded()
    del payload["inputs"]["mounting_system"]

    assert parse(payload) == PvYield(LOCATION, 1617.61, None, None)


def test_angles_that_are_not_numbers_are_dropped():
    payload = recorded()
    payload["inputs"]["mounting_system"]["fixed"]["slope"]["value"] = "steep"
    payload["inputs"]["mounting_system"]["fixed"]["azimuth"]["value"] = None

    assert parse(payload) == PvYield(LOCATION, 1617.61, None, None)


def test_other_fields_are_ignored():
    payload = recorded()
    payload["owner"] = "NAME SAMPLE"
    payload["outputs"]["totals"]["fixed"]["owner"] = "NAME SAMPLE"

    assert parse(payload).annual_kwh_per_kwp == 1617.61


def _without(path):
    payload = recorded()
    node = payload
    for key in path[:-1]:
        node = node[key]
    del node[path[-1]]
    return payload


def _with_yield(value):
    payload = recorded()
    payload["outputs"]["totals"]["fixed"]["E_y"] = value
    return payload


@pytest.mark.parametrize(
    "payload",
    [
        {"message": "lat: Incorrect value.", "status": 400},
        _without(["outputs"]),
        _without(["outputs", "totals"]),
        _without(["outputs", "totals", "fixed"]),
        _without(["outputs", "totals", "fixed", "E_y"]),
        _with_yield("1617.61"),
        _with_yield(None),
        _with_yield(True),
        _with_yield(-5),
        _with_yield(1_000_000),  # more than the sun ever sends
        [1, 2],
    ],
)
def test_a_missing_or_implausible_yield_is_unavailable(payload):
    with pytest.raises(ExternalServiceUnavailable):
        parse(payload)


@pytest.mark.parametrize("answer", [b"", b"<html>", b"null", b'{"outputs": {"totals": {"fixed": '])
def test_a_body_that_is_not_json_is_unavailable(answer):
    with pytest.raises(ExternalServiceUnavailable):
        parse_pv_yield(LOCATION, answer)


def test_a_non_finite_yield_is_unavailable():
    answer = fixture("pvgis_ok.json").decode().replace("1617.61", "NaN").encode()

    with pytest.raises(ExternalServiceUnavailable):
        parse_pv_yield(LOCATION, answer)

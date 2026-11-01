"""The Open-Meteo elevation parser: a white list, and nothing else gets through."""

import json

import pytest

from backend.app.external_data.domain.errors import ExternalServiceUnavailable
from backend.app.external_data.infrastructure.elevation_parser import parse_elevations
from backend.tests.external_data.infrastructure.recorded import fixture


def body(payload) -> bytes:
    return json.dumps(payload).encode()


def test_the_recorded_answer_gives_the_elevations_in_order():
    assert parse_elevations(fixture("open_meteo_ok.json"), 3) == [45.0, 29.0, 33.0]


def test_integers_are_accepted_as_numbers():
    assert parse_elevations(body({"elevation": [1, 2.5]}), 2) == [1.0, 2.5]


def test_other_fields_are_ignored():
    answer = body({"elevation": [10.0], "generationtime_ms": 0.1, "owner": "NAME SAMPLE"})

    assert parse_elevations(answer, 1) == [10.0]


@pytest.mark.parametrize(
    "answer",
    [
        fixture("open_meteo_error.json"),
        b"",
        b"<html>maintenance</html>",
        b"[1, 2]",
        b'"text"',
        body({}),
        body({"elevation": 5}),
        body({"elevation": [10.0, 11.0]}),  # one too many
        body({"elevation": []}),
        body({"elevation": [None]}),
        body({"elevation": ["12"]}),
        body({"elevation": [True]}),
        b'{"elevation": [NaN]}',
        b'{"elevation": [Infinity]}',
        body({"elevation": [-1000.0]}),  # below any ground on Earth
        body({"elevation": [20000.0]}),
        body({"error": True, "reason": "x", "elevation": [10.0]}),
    ],
)
def test_anything_else_is_unavailable(answer):
    with pytest.raises(ExternalServiceUnavailable):
        parse_elevations(answer, 1)

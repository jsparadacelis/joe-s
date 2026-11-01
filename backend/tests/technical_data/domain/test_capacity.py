"""Buildable capacity: the shared cases (also run by the front) and the rules around them."""

import json
from decimal import Decimal
from pathlib import Path

import pytest

from backend.app.technical_data.domain.capacity import (
    Capacity,
    CapacityResult,
    LimitingCondition,
    compute_capacity,
)

CASES = json.loads((Path(__file__).parent / "capacity_cases.json").read_text())

_KEYS = {
    "surface": "surface",
    "buildableArea": "buildable_area",
    "footprint": "footprint",
    "byFloors": "by_floors",
    "maximum": "maximum",
    "existing": "existing",
    "existingShare": "existing_share",
    "minPlot": "min_plot",
}


def _decimal(number):
    return None if number is None else Decimal(str(number))


@pytest.mark.parametrize("case", CASES, ids=[c["name"] for c in CASES])
def test_shared_cases(case):
    result = compute_capacity(case["values"])

    assert list(result.missing) == case["missing"]
    expected = case["expected"]
    if expected is None:
        assert result.capacity is None
        return
    capacity = result.capacity
    for json_key, attribute in _KEYS.items():
        assert getattr(capacity, attribute) == _decimal(expected[json_key]), json_key
    assert capacity.limited_by.value == expected["limitedBy"]
    assert capacity.meets_min_plot is expected["meetsMinPlot"]


def test_the_acceptance_criterion_is_144_limited_by_buildability():
    values = {
        "cadastralPlotArea": "96",
        "buildability": "1,5",
        "maxOccupancy": "70",
        "floors": "PB+2",
        "calcArea": "Catastral",
    }

    capacity = compute_capacity(values).capacity

    assert capacity.maximum == Decimal("144")
    assert capacity.limited_by is LimitingCondition.BUILDABILITY


def test_arithmetic_is_exact_not_floating_point():
    values = {
        "cadastralPlotArea": "99,4",
        "buildability": "1,5",
        "maxOccupancy": "70",
        "floors": "PB+2",
    }

    assert compute_capacity(values).capacity.buildable_area == Decimal("149.1")


@pytest.mark.parametrize("junk", ["NaN", "Infinity", "-5", "1e3", "1,2,3", "٣"])
def test_values_that_are_not_plain_numbers_count_as_missing(junk):
    values = {
        "cadastralPlotArea": "100",
        "buildability": junk,
        "maxOccupancy": "50",
        "floors": "PB",
    }

    assert compute_capacity(values) == CapacityResult(None, ("buildability",))


def test_an_unknown_number_of_floors_is_missing():
    values = {
        "cadastralPlotArea": "100",
        "buildability": "2",
        "maxOccupancy": "50",
        "floors": "PB+9",
    }

    assert compute_capacity(values).missing == ("floors",)


def test_the_result_is_a_capacity_dataclass():
    values = {
        "cadastralPlotArea": "100",
        "buildability": "2",
        "maxOccupancy": "50",
        "floors": "PB",
    }

    assert isinstance(compute_capacity(values).capacity, Capacity)

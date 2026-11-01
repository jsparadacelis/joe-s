"""The technical data catalog: the 26 definitions of the screen (RGB-29) are the contract."""

import json
from pathlib import Path

import pytest

from backend.app.technical_data.domain.catalog import (
    CATALOG,
    DataGroup,
    DatumType,
    Source,
    definition_of,
)
from backend.app.technical_data.domain.errors import UnknownDatum

SHARED_CASES = json.loads((Path(__file__).parent / "catalog_cases.json").read_text())


def test_the_catalog_has_the_same_data_in_the_same_order_as_the_shared_cases():
    assert [d.id for d in CATALOG] == [case["id"] for case in SHARED_CASES]


@pytest.mark.parametrize("case", SHARED_CASES, ids=[case["id"] for case in SHARED_CASES])
def test_each_definition_matches_the_shared_case(case):
    definition = definition_of(case["id"])

    assert {
        "id": definition.id,
        "group": definition.group.value,
        "type": definition.type.value,
        "unit": definition.unit,
        "options": None if definition.options is None else list(definition.options),
    } == case


def test_there_are_twenty_six_data_with_unique_ids():
    assert len(CATALOG) == 26
    assert len({d.id for d in CATALOG}) == 26


def test_only_list_data_have_options_and_every_list_has_some():
    for definition in CATALOG:
        assert (definition.options is not None) == (definition.type is DatumType.LIST)


def test_planning_data_are_manual_and_the_rest_are_not():
    for definition in CATALOG:
        assert (definition.group is DataGroup.PLANNING) == (definition.source is Source.MANUAL)


def test_an_unknown_id_is_rejected():
    with pytest.raises(UnknownDatum):
        definition_of("owner")

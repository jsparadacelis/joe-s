"""Cadastral reference validation. `cadastral_cases.json` is read by this test and by
`frontend/__tests__/lib/cadastral-reference.test.ts`, so both sides give the same answer."""

import json
from pathlib import Path

import pytest

from backend.app.external_data.domain.cadastral_reference import (
    InvalidCadastralReference,
    normalize_cadastral_reference,
    validate_cadastral_reference,
)

_CASES = json.loads((Path(__file__).parent / "cadastral_cases.json").read_text())
_IDS = [case["name"] for case in _CASES]


@pytest.mark.parametrize("case", _CASES, ids=_IDS)
def test_validation_matches_the_shared_cases(case):
    if case["valid"]:
        assert validate_cadastral_reference(case["input"]) == case["value"]
        return
    with pytest.raises(InvalidCadastralReference) as raised:
        validate_cadastral_reference(case["input"])
    assert raised.value.message == case["message"]


@pytest.mark.parametrize(
    "case", [c for c in _CASES if c["value"] is not None], ids=lambda c: c["name"]
)
def test_normalization_matches_the_shared_cases(case):
    assert normalize_cadastral_reference(case["input"]) == case["value"]


def test_the_error_code_is_stable():
    with pytest.raises(InvalidCadastralReference) as raised:
        validate_cadastral_reference("123")
    assert raised.value.code == "invalid_cadastral_reference"


def test_the_plot_reference_error_has_its_own_code():
    with pytest.raises(InvalidCadastralReference) as raised:
        validate_cadastral_reference("0000000AA0000A")
    assert raised.value.code == "plot_reference_only"


def test_a_non_string_is_rejected_as_missing():
    with pytest.raises(InvalidCadastralReference):
        validate_cadastral_reference(None)  # type: ignore[arg-type]

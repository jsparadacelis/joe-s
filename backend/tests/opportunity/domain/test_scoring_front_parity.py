"""The front end mirrors the score formula and the settings messages; the server is the reference.

`score_cases.json` is read by this test and by `frontend/__tests__/lib/scoring.test.ts`, so both
sides must produce the same score, including exact ties such as 56.25 (half up, not banker's).
"""

import json
from decimal import Decimal
from pathlib import Path

import pytest

from backend.app.opportunity.domain.errors import InvalidThreshold, InvalidWeights
from backend.app.opportunity.domain.scoring import Criterion, compute_score

_CASES = json.loads((Path(__file__).parent / "score_cases.json").read_text())
_FRONT_SCORING = Path(__file__).parents[4] / "frontend" / "lib" / "scoring.ts"


@pytest.mark.parametrize("case", _CASES)
def test_compute_score_matches_the_cases_shared_with_the_front_end(case):
    ratings = {c: case["ratings"][c.value] for c in Criterion}
    weights = {c: Decimal(str(case["weights"][c.value])) for c in Criterion}

    assert str(compute_score(ratings, weights)) == case["score"]


def test_the_front_end_validation_messages_are_the_ones_the_api_returns():
    source = _FRONT_SCORING.read_text()

    assert InvalidWeights().message in source
    assert InvalidThreshold().message in source

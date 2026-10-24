"""Opportunity scoring: seven criteria rated 1 to 5, weighted into a score out of 100.

Pure rules. Score = 100 * sum(weight * rating) / (5 * sum(weights)), rounded half-up to one
decimal; the recommendation is "pursue" when the score reaches the threshold. The decision
stays with the person: nothing here changes a project.
"""

from __future__ import annotations

import math
from collections.abc import Mapping
from dataclasses import dataclass
from datetime import datetime
from decimal import ROUND_HALF_UP, Decimal
from enum import Enum
from typing import Any

from backend.app.opportunity.domain.errors import InvalidRatings, InvalidThreshold, InvalidWeights

MIN_RATING = 1
MAX_RATING = 5
MAX_WEIGHT = Decimal("10")
MIN_THRESHOLD = 1
MAX_THRESHOLD = 100
DEFAULT_THRESHOLD = 60


class Criterion(str, Enum):
    CLIENT_FIT = "client_fit"
    LOCATION = "location"
    TYPOLOGY = "typology"
    BUDGET = "budget"
    TIMELINE = "timeline"
    SOURCE = "source"
    PROBABILITY = "probability"


class Recommendation(str, Enum):
    PURSUE = "pursue"
    DO_NOT_PURSUE = "do_not_pursue"


DEFAULT_WEIGHTS: dict[Criterion, Decimal] = {c: Decimal(1) for c in Criterion}


@dataclass(frozen=True)
class ScoringSettings:
    weights: dict[Criterion, Decimal]
    threshold: int


def default_settings() -> ScoringSettings:
    return ScoringSettings(weights=dict(DEFAULT_WEIGHTS), threshold=DEFAULT_THRESHOLD)


@dataclass(frozen=True)
class ScorableProject:
    id: str
    study_id: str
    code: str
    current_phase: int


@dataclass(frozen=True)
class NewScoring:
    study_id: str
    project_id: str
    project_code: str
    ratings: dict[Criterion, int]
    weights: dict[Criterion, Decimal]
    threshold: int
    score: Decimal
    recommendation: Recommendation
    scored_by: str


@dataclass(frozen=True)
class Scoring:
    project_code: str
    version: int
    ratings: dict[Criterion, int]
    weights: dict[Criterion, Decimal]
    threshold: int
    score: Decimal
    recommendation: Recommendation
    scored_by: str
    scored_at: datetime


def compute_score(
    ratings: Mapping[Criterion, int], weights: Mapping[Criterion, Decimal]
) -> Decimal:
    weighted = sum((weights[c] * ratings[c] for c in Criterion), Decimal(0))
    total = sum((weights[c] for c in Criterion), Decimal(0))
    return (100 * weighted / (MAX_RATING * total)).quantize(Decimal("0.1"), ROUND_HALF_UP)


def recommend(score: Decimal, threshold: int) -> Recommendation:
    return Recommendation.PURSUE if score >= threshold else Recommendation.DO_NOT_PURSUE


def validate_ratings(data: Any) -> dict[Criterion, int]:
    """Every criterion present with an integer 1 to 5; the first problem, in order, is raised."""
    if not isinstance(data, Mapping):
        raise InvalidRatings(None)
    ratings: dict[Criterion, int] = {}
    for criterion in Criterion:
        value = data.get(criterion.value)
        if type(value) is not int or not MIN_RATING <= value <= MAX_RATING:
            raise InvalidRatings(criterion.value)
        ratings[criterion] = value
    extra = [key for key in data if key not in {c.value for c in Criterion}]
    if extra:
        raise InvalidRatings(str(extra[0]))
    return ratings


def validate_settings(data: Any) -> ScoringSettings:
    """Weights are validated before the threshold."""
    if not isinstance(data, Mapping):
        raise InvalidWeights()
    weights = _validate_weights(data.get("weights"))
    threshold = data.get("threshold")
    if type(threshold) is not int or not MIN_THRESHOLD <= threshold <= MAX_THRESHOLD:
        raise InvalidThreshold()
    return ScoringSettings(weights=weights, threshold=threshold)


def _validate_weights(data: Any) -> dict[Criterion, Decimal]:
    keys = {c.value for c in Criterion}
    if not isinstance(data, Mapping) or set(data) != keys:
        raise InvalidWeights()
    return {criterion: _weight(data[criterion.value]) for criterion in Criterion}


def _weight(value: Any) -> Decimal:
    if isinstance(value, bool) or not isinstance(value, int | float | Decimal):
        raise InvalidWeights()
    if isinstance(value, float) and not math.isfinite(value):
        raise InvalidWeights()
    weight = Decimal(str(value))
    if not weight.is_finite() or not 0 < weight <= MAX_WEIGHT:
        raise InvalidWeights()
    if weight != weight.quantize(Decimal("0.01")):
        raise InvalidWeights()
    return weight

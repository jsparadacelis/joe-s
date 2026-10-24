"""Scoring domain: criteria, score formula, recommendation and input validation. Pure."""

from decimal import Decimal

import pytest

from backend.app.opportunity.domain.errors import (
    InvalidRatings,
    InvalidThreshold,
    InvalidWeights,
)
from backend.app.opportunity.domain.scoring import (
    DEFAULT_THRESHOLD,
    DEFAULT_WEIGHTS,
    Criterion,
    Recommendation,
    compute_score,
    default_settings,
    recommend,
    validate_ratings,
    validate_settings,
)

KEYS = [
    "client_fit",
    "location",
    "typology",
    "budget",
    "timeline",
    "source",
    "probability",
]


def ratings(value=3, **overrides):
    data = {key: value for key in KEYS}
    data.update(overrides)
    return data


def weights(value=1, **overrides):
    data = {key: value for key in KEYS}
    data.update(overrides)
    return data


def as_ratings(data):
    return {Criterion(k): v for k, v in data.items()}


def as_weights(data):
    return {Criterion(k): Decimal(str(v)) for k, v in data.items()}


class TestCriteria:
    def test_the_seven_criteria_in_contract_order(self):
        assert [c.value for c in Criterion] == KEYS

    def test_defaults_are_equal_weights_and_threshold_60(self):
        assert DEFAULT_THRESHOLD == 60
        assert DEFAULT_WEIGHTS == {c: Decimal(1) for c in Criterion}
        settings = default_settings()
        assert settings.weights == DEFAULT_WEIGHTS
        assert settings.threshold == 60


class TestComputeScore:
    def test_all_threes_with_equal_weights_is_60(self):
        assert compute_score(as_ratings(ratings(3)), DEFAULT_WEIGHTS) == Decimal("60.0")

    def test_all_fives_is_100_and_all_ones_is_20(self):
        assert compute_score(as_ratings(ratings(5)), DEFAULT_WEIGHTS) == Decimal("100.0")
        assert compute_score(as_ratings(ratings(1)), DEFAULT_WEIGHTS) == Decimal("20.0")

    def test_different_weights_shift_the_score(self):
        # client_fit rated 5 with weight 4, the other six rated 1 with weight 1:
        # 100 * (4*5 + 6*1) / (5 * 10) = 52.0
        data = as_ratings(ratings(1, client_fit=5))
        w = as_weights(weights(1, client_fit=4))
        assert compute_score(data, w) == Decimal("52.0")

    def test_the_scale_of_the_weights_does_not_matter(self):
        data = as_ratings(ratings(2, budget=5))
        small = compute_score(data, as_weights(weights(1)))
        large = compute_score(data, as_weights(weights(10)))
        assert small == large

    def test_rounds_to_one_decimal(self):
        # 100 * 19 / 35 = 54.2857... -> 54.3
        data = ratings(3, client_fit=5, location=5, typology=2, budget=2, timeline=1, source=1)
        assert compute_score(as_ratings(data), DEFAULT_WEIGHTS) == Decimal("54.3")

    def test_a_real_tie_rounds_half_up(self):
        # weights 10,1,1,1,1,1,1 (sum 16); S = 10*3 + 3 + 3 + 3 + 2 + 2 + 2 = 45.
        # 100 * 45 / (5 * 16) = 56.25 exactly -> 56.3 (banker's rounding would give 56.2).
        data = as_ratings(ratings(3, timeline=2, source=2, probability=2))
        w = as_weights(weights(1, client_fit=10))
        assert compute_score(data, w) == Decimal("56.3")

    def test_returns_a_decimal(self):
        assert isinstance(compute_score(as_ratings(ratings(3)), DEFAULT_WEIGHTS), Decimal)


class TestRecommend:
    def test_at_the_threshold_is_pursue(self):
        assert recommend(Decimal("60.0"), 60) is Recommendation.PURSUE

    def test_just_below_the_threshold_is_do_not_pursue(self):
        assert recommend(Decimal("59.9"), 60) is Recommendation.DO_NOT_PURSUE

    def test_above_is_pursue(self):
        assert recommend(Decimal("60.1"), 60) is Recommendation.PURSUE

    def test_values_are_the_contract_strings(self):
        assert Recommendation.PURSUE.value == "pursue"
        assert Recommendation.DO_NOT_PURSUE.value == "do_not_pursue"

    def test_threshold_extremes(self):
        assert recommend(Decimal("20.0"), 1) is Recommendation.PURSUE
        assert recommend(Decimal("99.9"), 100) is Recommendation.DO_NOT_PURSUE
        assert recommend(Decimal("100.0"), 100) is Recommendation.PURSUE


class TestValidateRatings:
    def test_valid_ratings_come_back_keyed_by_criterion(self):
        result = validate_ratings(ratings(4, location=1))

        assert result[Criterion.LOCATION] == 1
        assert result[Criterion.CLIENT_FIT] == 4
        assert list(result) == list(Criterion)

    @pytest.mark.parametrize("value", [1, 5])
    def test_bounds_are_accepted(self, value):
        assert set(validate_ratings(ratings(value)).values()) == {value}

    @pytest.mark.parametrize(
        "value", [0, 6, -1, 3.5, 3.0, "3", None, True, False, [3], {"v": 3}, 10**30]
    )
    def test_a_bad_value_names_its_criterion(self, value):
        with pytest.raises(InvalidRatings) as error:
            validate_ratings(ratings(3, budget=value))

        assert error.value.code == "invalid_ratings"
        assert error.value.field == "budget"
        assert "Presupuesto" in error.value.message

    def test_a_missing_criterion_is_reported(self):
        data = ratings(3)
        del data["source"]

        with pytest.raises(InvalidRatings) as error:
            validate_ratings(data)

        assert error.value.field == "source"

    def test_reports_the_first_invalid_criterion_in_contract_order(self):
        with pytest.raises(InvalidRatings) as error:
            validate_ratings(ratings(3, probability=9, location=0))

        assert error.value.field == "location"

    def test_an_unknown_extra_key_is_rejected_with_its_name(self):
        with pytest.raises(InvalidRatings) as error:
            validate_ratings(ratings(3, bonus=5))

        assert error.value.field == "bonus"

    @pytest.mark.parametrize("data", [None, [], [3] * 7, "x", 3, True])
    def test_a_non_object_has_no_field(self, data):
        with pytest.raises(InvalidRatings) as error:
            validate_ratings(data)

        assert error.value.field is None


class TestValidateSettings:
    def valid(self, **overrides):
        data = {"weights": weights(1), "threshold": 60}
        data.update(overrides)
        return data

    def test_valid_settings(self):
        settings = validate_settings(self.valid(weights=weights(2, budget=0.25), threshold=75))

        assert settings.weights[Criterion.BUDGET] == Decimal("0.25")
        assert settings.weights[Criterion.LOCATION] == Decimal(2)
        assert settings.threshold == 75
        assert list(settings.weights) == list(Criterion)

    @pytest.mark.parametrize("value", [0.01, 1, 10, 10.0, 9.99])
    def test_weight_bounds_accepted(self, value):
        validate_settings(self.valid(weights=weights(value)))

    @pytest.mark.parametrize(
        "value",
        [
            0,
            -1,
            10.01,
            11,
            0.001,
            1.234,
            "1",
            None,
            True,
            False,
            [1],
            {"w": 1},
            float("nan"),
            float("inf"),
            float("-inf"),
            10**30,
            1e-9,
        ],
    )
    def test_a_bad_weight_is_invalid_weights(self, value):
        with pytest.raises(InvalidWeights) as error:
            validate_settings(self.valid(weights=weights(1, typology=value)))

        assert error.value.code == "invalid_weights"
        assert error.value.message

    def test_all_weights_zero_is_invalid_weights(self):
        with pytest.raises(InvalidWeights):
            validate_settings(self.valid(weights=weights(0)))

    def test_a_missing_weight_is_invalid_weights(self):
        data = weights(1)
        del data["timeline"]

        with pytest.raises(InvalidWeights):
            validate_settings(self.valid(weights=data))

    def test_an_extra_weight_key_is_invalid_weights(self):
        with pytest.raises(InvalidWeights):
            validate_settings(self.valid(weights=weights(1, bonus=1)))

    @pytest.mark.parametrize("value", [None, [], [1] * 7, "x", 1, True])
    def test_weights_must_be_an_object(self, value):
        with pytest.raises(InvalidWeights):
            validate_settings(self.valid(weights=value))

    def test_missing_weights_key_is_invalid_weights(self):
        with pytest.raises(InvalidWeights):
            validate_settings({"threshold": 60})

    @pytest.mark.parametrize("data", [None, [], "x", 3, True])
    def test_a_non_object_body_is_invalid_weights(self, data):
        with pytest.raises(InvalidWeights):
            validate_settings(data)

    @pytest.mark.parametrize("value", [1, 60, 100])
    def test_threshold_bounds_accepted(self, value):
        assert validate_settings(self.valid(threshold=value)).threshold == value

    @pytest.mark.parametrize(
        "value", [0, 101, -5, 60.5, 60.0, "60", None, True, False, [60], float("nan"), 10**30]
    )
    def test_a_bad_threshold_is_invalid_threshold(self, value):
        with pytest.raises(InvalidThreshold) as error:
            validate_settings(self.valid(threshold=value))

        assert error.value.code == "invalid_threshold"

    def test_a_missing_threshold_is_invalid_threshold(self):
        with pytest.raises(InvalidThreshold):
            validate_settings({"weights": weights(1)})

    def test_weights_are_checked_before_the_threshold(self):
        with pytest.raises(InvalidWeights):
            validate_settings({"weights": weights(0), "threshold": 0})

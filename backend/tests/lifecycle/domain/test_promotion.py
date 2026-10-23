import pytest

from backend.app.lifecycle.domain.promotion import Action, Promotion, PromotionOutcome


def a_promotion(**overrides):
    values = {
        "study_id": "demo-study",
        "project_id": "demo-project",
        "action": Action.PROMOTE,
        "from_phase": 2,
        "to_phase": 3,
        "user_id": "demo-user",
    }
    return Promotion(**{**values, **overrides})


class TestPromote:
    def test_goes_to_the_following_phase(self):
        promotion = a_promotion()

        assert (promotion.from_phase, promotion.to_phase, promotion.outcome) == (
            2,
            3,
            PromotionOutcome.OK,
        )

    @pytest.mark.parametrize("target", [2, 4, None])
    def test_must_target_exactly_the_next_phase(self, target):
        with pytest.raises(ValueError):
            a_promotion(to_phase=target)

    def test_closing_phase_cannot_be_promoted(self):
        with pytest.raises(ValueError):
            a_promotion(from_phase=7, to_phase=8)


class TestHold:
    def test_requires_a_reason_and_keeps_the_phase(self):
        promotion = a_promotion(
            action=Action.HOLD, to_phase=None, reason="Missing topographic survey"
        )

        assert (promotion.to_phase, promotion.reason) == (None, "Missing topographic survey")

    @pytest.mark.parametrize("reason", [None, "", "  "])
    def test_rejects_a_missing_reason(self, reason):
        with pytest.raises(ValueError):
            a_promotion(action=Action.HOLD, to_phase=None, reason=reason)

    def test_has_no_target_phase(self):
        with pytest.raises(ValueError):
            a_promotion(action=Action.HOLD, to_phase=3, reason="x")


class TestDoNotPursue:
    def test_only_from_the_opportunity_phase(self):
        promotion = a_promotion(
            action=Action.DO_NOT_PURSUE, from_phase=0, to_phase=None, reason="Below threshold"
        )

        assert promotion.action is Action.DO_NOT_PURSUE

    @pytest.mark.parametrize("phase", [1, 3, 7])
    def test_rejected_from_any_other_phase(self, phase):
        with pytest.raises(ValueError):
            a_promotion(action=Action.DO_NOT_PURSUE, from_phase=phase, to_phase=None, reason="x")

    def test_requires_a_reason(self):
        with pytest.raises(ValueError):
            a_promotion(action=Action.DO_NOT_PURSUE, from_phase=0, to_phase=None, reason=None)

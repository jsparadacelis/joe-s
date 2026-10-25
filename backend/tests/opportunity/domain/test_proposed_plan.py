"""Proposed plan of RGB-16: validation of the scale and the 7 weeks, and its derived values.

Names fixed here for the Developer (module -> contents):
- backend.app.opportunity.domain.plan: validate_scale(value) -> Scale
- backend.app.opportunity.domain.errors: InvalidScale (code "invalid_scale"),
  PlanAlreadyConfirmed ("plan_already_confirmed"), PlanNotFound ("plan_not_found"),
  ProjectNotInOpportunityPhase ("project_not_in_opportunity_phase")
- backend.app.opportunity.domain.project_plan: ProposedPlan(project_type, scale, weeks) with
  ProposedPlan.from_input(project_type, scale, weeks) (validates scale first, then weeks, reusing
  validate_weeks), plus weeks_by_phase and total.
"""

import dataclasses

import pytest

from backend.app.opportunity.domain.errors import (
    InvalidScale,
    InvalidWeeks,
    PlanAlreadyConfirmed,
    PlanNotFound,
    ProjectNotInOpportunityPhase,
)
from backend.app.opportunity.domain.plan import ProjectType, Scale, validate_scale, validate_weeks
from backend.app.opportunity.domain.project_plan import ProposedPlan

WEEKS = [2, 2, 4, 5, 8, 40, 4]


class TestValidateScale:
    @pytest.mark.parametrize(("raw", "scale"), [(s.value, s) for s in Scale])
    def test_accepts_the_three_scales(self, raw, scale):
        assert validate_scale(raw) is scale

    @pytest.mark.parametrize(
        "raw", ["huge", "", " small", "Small", "LARGE", None, 1, 0, True, 1.5, ["small"], {}]
    )
    def test_rejects_anything_else_with_invalid_scale(self, raw):
        with pytest.raises(InvalidScale) as caught:
            validate_scale(raw)

        assert caught.value.code == "invalid_scale"
        assert caught.value.message


class TestErrors:
    @pytest.mark.parametrize(
        ("error", "code"),
        [
            (InvalidScale(), "invalid_scale"),
            (PlanAlreadyConfirmed(), "plan_already_confirmed"),
            (PlanNotFound(), "plan_not_found"),
            (ProjectNotInOpportunityPhase(), "project_not_in_opportunity_phase"),
        ],
    )
    def test_each_error_has_a_stable_code_and_a_user_message(self, error, code):
        assert error.code == code
        assert isinstance(error.message, str) and error.message.strip()


class TestProposedPlan:
    def test_builds_from_valid_input(self):
        plan = ProposedPlan.from_input(ProjectType.INDUSTRIAL, "medium", WEEKS)

        assert plan.project_type is ProjectType.INDUSTRIAL
        assert plan.scale is Scale.MEDIUM
        assert plan.weeks == (2, 2, 4, 5, 8, 40, 4)

    def test_derives_weeks_by_phase_and_total(self):
        plan = ProposedPlan.from_input(ProjectType.INDUSTRIAL, "medium", WEEKS)

        assert plan.weeks_by_phase == {1: 2, 2: 2, 3: 4, 4: 5, 5: 8, 6: 40, 7: 4}
        assert plan.total == 65

    @pytest.mark.parametrize("weeks", [[1] * 7, [520] * 7])
    def test_the_limits_1_and_520_are_accepted(self, weeks):
        assert ProposedPlan.from_input(ProjectType.FACILITY, "small", weeks).weeks == tuple(weeks)

    @pytest.mark.parametrize(
        "weeks",
        [
            [1] * 6,
            [1] * 8,
            [],
            None,
            "2245840",
            [0, 2, 4, 5, 8, 40, 4],
            [2, 2, 4, 5, 8, 40, 521],
            [-1, 2, 4, 5, 8, 40, 4],
            [2.0, 2, 4, 5, 8, 40, 4],
            [True, 2, 4, 5, 8, 40, 4],
            ["2", 2, 4, 5, 8, 40, 4],
            [None, 2, 4, 5, 8, 40, 4],
            {"1": 2},
        ],
    )
    def test_invalid_weeks_raise_the_same_error_as_the_plan_settings(self, weeks):
        with pytest.raises(InvalidWeeks) as proposed:
            ProposedPlan.from_input(ProjectType.INDUSTRIAL, "medium", weeks)
        with pytest.raises(InvalidWeeks) as settings:
            validate_weeks(weeks)

        assert proposed.value.code == "invalid_weeks"
        assert proposed.value.message == settings.value.message

    def test_an_invalid_scale_is_reported_before_invalid_weeks(self):
        with pytest.raises(InvalidScale):
            ProposedPlan.from_input(ProjectType.INDUSTRIAL, "huge", [0] * 7)

    def test_it_is_immutable_and_isolated_from_the_input_list(self):
        weeks = list(WEEKS)
        plan = ProposedPlan.from_input(ProjectType.INDUSTRIAL, "medium", weeks)

        weeks[0] = 99

        assert plan.weeks[0] == 2
        with pytest.raises(dataclasses.FrozenInstanceError):
            plan.scale = Scale.LARGE

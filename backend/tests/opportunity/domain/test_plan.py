from decimal import Decimal

import pytest

from backend.app.opportunity.domain.errors import InvalidFactor, InvalidWeeks
from backend.app.opportunity.domain.plan import (
    DEFAULT_SCALE_FACTORS,
    DEFAULT_TEMPLATES,
    ProjectType,
    Scale,
    make_plan,
    validate_factor,
    validate_weeks,
)


class TestDefaults:
    @pytest.mark.parametrize(
        ("project_type", "weeks"),
        [
            (ProjectType.SINGLE_FAMILY_HOUSE, (2, 3, 5, 6, 8, 36, 4)),
            (ProjectType.REHABILITATION, (2, 3, 4, 6, 8, 30, 4)),
            (ProjectType.MULTI_FAMILY, (3, 4, 6, 8, 12, 72, 6)),
            (ProjectType.FACILITY, (3, 4, 6, 8, 12, 52, 6)),
            (ProjectType.INDUSTRIAL, (2, 2, 4, 5, 8, 40, 4)),
            (ProjectType.RENOVATION_INTERIORS, (1, 2, 3, 3, 5, 16, 2)),
        ],
    )
    def test_templates_follow_the_prd(self, project_type, weeks):
        assert DEFAULT_TEMPLATES[project_type] == weeks

    def test_scale_factors_follow_the_prd(self):
        assert DEFAULT_SCALE_FACTORS == {
            Scale.SMALL: Decimal("0.8"),
            Scale.MEDIUM: Decimal("1"),
            Scale.LARGE: Decimal("1.3"),
        }


class TestMakePlan:
    def test_industrial_large_is_3_3_5_7_10_52_5(self):
        plan = make_plan(ProjectType.INDUSTRIAL, Scale.LARGE)

        assert plan.weeks == (3, 3, 5, 7, 10, 52, 5)

    def test_medium_scale_keeps_the_template(self):
        plan = make_plan(ProjectType.MULTI_FAMILY, Scale.MEDIUM)

        assert plan.weeks == (3, 4, 6, 8, 12, 72, 6)

    def test_rounds_half_up_not_to_even(self):
        # 5 weeks x 1.3 = 6.5 must give 7 (Python's round() would give 6).
        plan = make_plan(ProjectType.INDUSTRIAL, Scale.LARGE)

        assert plan.weeks[3] == 7

    def test_small_scale_never_goes_below_one_week(self):
        plan = make_plan(ProjectType.RENOVATION_INTERIORS, Scale.SMALL)

        assert plan.weeks == (1, 2, 2, 2, 4, 13, 2)
        assert min(plan.weeks) >= 1

    def test_a_tiny_factor_still_gives_one_week_per_phase(self):
        plan = make_plan(
            ProjectType.INDUSTRIAL, Scale.SMALL, factors={Scale.SMALL: Decimal("0.01")}
        )

        assert plan.weeks == (1, 1, 1, 1, 1, 1, 1)

    def test_custom_templates_and_factors_override_the_defaults(self):
        plan = make_plan(
            ProjectType.INDUSTRIAL,
            Scale.LARGE,
            templates={ProjectType.INDUSTRIAL: (10, 10, 10, 10, 10, 10, 10)},
            factors={Scale.LARGE: Decimal("2")},
        )

        assert plan.weeks == (20, 20, 20, 20, 20, 20, 20)

    def test_exposes_weeks_by_phase_from_1_to_7_and_the_total(self):
        plan = make_plan(ProjectType.INDUSTRIAL, Scale.MEDIUM)

        assert plan.weeks_by_phase == {1: 2, 2: 2, 3: 4, 4: 5, 5: 8, 6: 40, 7: 4}
        assert plan.total == 65


class TestValidation:
    def test_valid_weeks_pass_through(self):
        assert validate_weeks([1, 2, 3, 4, 5, 6, 7]) == (1, 2, 3, 4, 5, 6, 7)

    @pytest.mark.parametrize(
        "weeks",
        [[1, 2, 3], [1] * 8, [], [0, 1, 1, 1, 1, 1, 1], [-1, 1, 1, 1, 1, 1, 1], [1.5] + [1] * 6],
    )
    def test_weeks_need_seven_positive_integers(self, weeks):
        with pytest.raises(InvalidWeeks):
            validate_weeks(weeks)

    @pytest.mark.parametrize("factor", [0, -1, "0", 11])
    def test_factor_must_be_positive_and_reasonable(self, factor):
        with pytest.raises(InvalidFactor):
            validate_factor(factor)

    def test_factor_is_returned_as_decimal(self):
        assert validate_factor("1.25") == Decimal("1.25")

    def test_errors_carry_a_spanish_message(self):
        with pytest.raises(InvalidWeeks) as error:
            validate_weeks([1])

        assert "7" in error.value.message

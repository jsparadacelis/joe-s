from decimal import Decimal
from unittest.mock import create_autospec

import pytest

from backend.app.audit.domain.event import Outcome
from backend.app.audit.domain.ports import AuditLog
from backend.app.opportunity.application.plan_settings import PlanSettingsService
from backend.app.opportunity.domain.errors import InvalidFactor, InvalidWeeks
from backend.app.opportunity.domain.plan import ProjectType, Scale
from backend.app.opportunity.domain.ports import PlanSettingsRepository
from backend.app.study.domain.context import RequestContext, Role

CONTEXT = RequestContext(study_id="demo-study", user_id="demo-user", role=Role.PARTNER)


@pytest.fixture
def repo():
    repo = create_autospec(PlanSettingsRepository, spec_set=True, instance=True)
    repo.get_templates.return_value = {}
    repo.get_scale_factors.return_value = {}
    return repo


@pytest.fixture
def audit_log():
    return create_autospec(AuditLog, spec_set=True, instance=True)


@pytest.fixture
def service(repo, audit_log):
    return PlanSettingsService(repo, audit_log)


class TestSettings:
    def test_without_overrides_it_returns_the_prd_defaults(self, service):
        settings = service.get_settings()

        assert settings.templates[ProjectType.INDUSTRIAL] == (2, 2, 4, 5, 8, 40, 4)
        assert settings.scale_factors[Scale.LARGE] == Decimal("1.3")

    def test_study_overrides_win_over_the_defaults(self, service, repo):
        repo.get_templates.return_value = {ProjectType.INDUSTRIAL: (9, 9, 9, 9, 9, 9, 9)}
        repo.get_scale_factors.return_value = {Scale.LARGE: Decimal("2")}

        settings = service.get_settings()

        assert settings.templates[ProjectType.INDUSTRIAL] == (9, 9, 9, 9, 9, 9, 9)
        assert settings.templates[ProjectType.REHABILITATION] == (2, 3, 4, 6, 8, 30, 4)
        assert settings.scale_factors[Scale.LARGE] == Decimal("2")
        assert settings.scale_factors[Scale.SMALL] == Decimal("0.8")


class TestMakePlan:
    def test_uses_the_defaults(self, service):
        plan = service.make_plan(ProjectType.INDUSTRIAL, Scale.LARGE)

        assert plan.weeks == (3, 3, 5, 7, 10, 52, 5)

    def test_uses_the_study_overrides(self, service, repo):
        repo.get_scale_factors.return_value = {Scale.LARGE: Decimal("2")}

        plan = service.make_plan(ProjectType.INDUSTRIAL, Scale.LARGE)

        assert plan.weeks == (4, 4, 8, 10, 16, 80, 8)


class TestUpdateTemplate:
    def test_saves_the_weeks_and_audits_old_and_new(self, service, repo, audit_log):
        service.update_template(CONTEXT, ProjectType.INDUSTRIAL, [3, 3, 3, 3, 3, 3, 3])

        repo.save_template.assert_called_once_with(ProjectType.INDUSTRIAL, (3, 3, 3, 3, 3, 3, 3))
        event = audit_log.record.call_args.args[0]
        assert (event.entity, event.entity_id, event.action, event.outcome) == (
            "plan_settings",
            "template:industrial",
            "update",
            Outcome.OK,
        )
        assert event.old_value == {"weeks": [2, 2, 4, 5, 8, 40, 4]}
        assert event.new_value == {"weeks": [3, 3, 3, 3, 3, 3, 3]}

    def test_invalid_weeks_are_rejected_without_saving_or_auditing(self, service, repo, audit_log):
        with pytest.raises(InvalidWeeks):
            service.update_template(CONTEXT, ProjectType.INDUSTRIAL, [1, 2])

        repo.save_template.assert_not_called()
        audit_log.record.assert_not_called()


class TestUpdateScaleFactor:
    def test_saves_the_factor_and_audits_old_and_new(self, service, repo, audit_log):
        service.update_scale_factor(CONTEXT, Scale.LARGE, "1.5")

        repo.save_scale_factor.assert_called_once_with(Scale.LARGE, Decimal("1.5"))
        event = audit_log.record.call_args.args[0]
        assert (event.entity_id, event.old_value, event.new_value) == (
            "scale_factor:large",
            {"factor": "1.3"},
            {"factor": "1.5"},
        )

    @pytest.mark.parametrize("factor", ["0", "-1", "abc", "50"])
    def test_invalid_factor_is_rejected_without_saving(self, service, repo, audit_log, factor):
        with pytest.raises(InvalidFactor):
            service.update_scale_factor(CONTEXT, Scale.LARGE, factor)

        repo.save_scale_factor.assert_not_called()
        audit_log.record.assert_not_called()

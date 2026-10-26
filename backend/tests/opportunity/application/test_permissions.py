"""Scoring, plan settings and creating an opportunity ask the central policy (RGB-4b)."""

from unittest.mock import create_autospec

import pytest

from backend.app.access.domain.errors import NotPermitted
from backend.app.audit.domain.ports import AuditLog
from backend.app.opportunity.application.create_opportunity import CreateOpportunity
from backend.app.opportunity.application.plan_settings import PlanSettingsService
from backend.app.opportunity.application.scoring import ScoringService, ScoringSettingsService
from backend.app.opportunity.domain.plan import ProjectType, Scale
from backend.app.opportunity.domain.ports import (
    OpportunityRepository,
    PlanSettingsRepository,
    ScoringRepository,
    ScoringSettingsRepository,
)
from backend.app.study.domain.context import RequestContext, Role


def a_context(role):
    return RequestContext(study_id="demo-study", user_id="demo-user", role=role)


ARCHITECT = a_context(Role.ARCHITECT)


@pytest.fixture
def audit_log():
    return create_autospec(AuditLog, spec_set=True, instance=True)


def test_scoring_is_refused_before_looking_at_anything(audit_log):
    scorings = create_autospec(ScoringRepository, spec_set=True, instance=True)
    settings = create_autospec(ScoringSettingsRepository, spec_set=True, instance=True)

    with pytest.raises(NotPermitted):
        ScoringService(scorings, settings, audit_log).score(ARCHITECT, "PRY-X", {"ratings": {}})

    scorings.get_project.assert_not_called()
    scorings.add.assert_not_called()
    audit_log.record.assert_not_called()


def test_scoring_settings_are_refused_before_validating_or_saving(audit_log):
    repo = create_autospec(ScoringSettingsRepository, spec_set=True, instance=True)

    with pytest.raises(NotPermitted):
        ScoringSettingsService(repo, audit_log).update(ARCHITECT, "not even a valid body")

    repo.save.assert_not_called()
    audit_log.record.assert_not_called()


def test_plan_templates_are_refused_before_validating_or_saving(audit_log):
    repo = create_autospec(PlanSettingsRepository, spec_set=True, instance=True)

    with pytest.raises(NotPermitted):
        PlanSettingsService(repo, audit_log).update_template(
            ARCHITECT, ProjectType.INDUSTRIAL, "not even weeks"
        )

    repo.save_template.assert_not_called()


def test_scale_factors_are_refused_before_validating_or_saving(audit_log):
    repo = create_autospec(PlanSettingsRepository, spec_set=True, instance=True)

    with pytest.raises(NotPermitted):
        PlanSettingsService(repo, audit_log).update_scale_factor(ARCHITECT, Scale.LARGE, "x")

    repo.save_scale_factor.assert_not_called()


def test_creating_an_opportunity_is_refused_before_validating_or_saving(audit_log):
    repo = create_autospec(OpportunityRepository, spec_set=True, instance=True)

    with pytest.raises(NotPermitted):
        CreateOpportunity(repo, audit_log).execute(ARCHITECT, {})

    repo.next_code.assert_not_called()
    repo.add.assert_not_called()
    audit_log.record.assert_not_called()

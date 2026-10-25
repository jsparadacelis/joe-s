"""StartProject use case (RGB-16) with simulated ports.

Names fixed here for the Developer:
- backend.app.opportunity.domain.project_plan: StartableProject(id, study_id, code,
  current_phase, project_type, client, location), NewProjectPlan(study_id, project_id,
  project_type, scale, weeks, confirmed_by), ConfirmedPlan(project_code, project_type, scale,
  weeks, confirmed_by, confirmed_at) with weeks_by_phase and total, ProposedPlan.
- backend.app.opportunity.domain.ports.ProjectPlans (Protocol): get_project(code, *, lock=True)
  -> StartableProject | None; get(project_id) -> ConfirmedPlan | None; add(NewProjectPlan) ->
  ConfirmedPlan; save_exit_content(project_id, content) (sets the phase 0 exit deliverable
  content and leaves it complete and approved).
- backend.app.opportunity.application.start_project:
  StartProject(plans, scorings, promotion, audit_log).execute(context, code, scale, weeks)
  -> StartResult(transition: Transition, plan: ProposedPlan | None);
  ProjectPlanReader(plans).read(code) -> ConfirmedPlan.
Business rejections are RETURNED (transition.ok False, transition.error = the domain error) so
the transaction commits and the attempt stays audited; only an unknown project is RAISED.
Order of checks: project, phase 0, no plan yet, authority, scale, weeks, saved scoring.
"""

import json
from datetime import datetime, timezone
from decimal import Decimal
from unittest.mock import Mock, create_autospec

import pytest

from backend.app.audit.domain.event import Outcome
from backend.app.audit.domain.ports import AuditLog
from backend.app.lifecycle.application.promotion_service import PromotionService, Transition
from backend.app.lifecycle.domain.errors import IncompleteDeliverable, NoAuthority
from backend.app.opportunity.application.start_project import (
    ProjectPlanReader,
    StartProject,
    StartResult,
)
from backend.app.opportunity.domain.errors import (
    InvalidScale,
    InvalidWeeks,
    PlanAlreadyConfirmed,
    PlanNotFound,
    ProjectNotFound,
    ProjectNotInOpportunityPhase,
)
from backend.app.opportunity.domain.plan import ProjectType, Scale
from backend.app.opportunity.domain.ports import ProjectPlans, ScoringRepository
from backend.app.opportunity.domain.project_plan import (
    ConfirmedPlan,
    NewProjectPlan,
    ProposedPlan,
    StartableProject,
)
from backend.app.opportunity.domain.scoring import (
    DEFAULT_WEIGHTS,
    Criterion,
    Recommendation,
    Scoring,
)
from backend.app.study.domain.context import RequestContext, Role

CODE = "PRY-2026-001"
WEEKS = [2, 2, 4, 5, 8, 40, 4]
WHEN = datetime(2026, 10, 24, 10, 0, tzinfo=timezone.utc)


def a_context(role=Role.PARTNER):
    return RequestContext(study_id="demo-study", user_id="demo-user", role=role)


def a_project(phase=0):
    return StartableProject(
        id="project-1",
        study_id="demo-study",
        code=CODE,
        current_phase=phase,
        project_type=ProjectType.INDUSTRIAL,
        client="Client (sample)",
        location="Town (sample)",
    )


def a_scoring(version=3, score="60.0", recommendation=Recommendation.PURSUE):
    return Scoring(
        project_code=CODE,
        version=version,
        ratings={c: 3 for c in Criterion},
        weights=dict(DEFAULT_WEIGHTS),
        threshold=60,
        score=Decimal(score),
        recommendation=recommendation,
        scored_by="demo-user",
        scored_at=WHEN,
    )


def a_confirmed(new: NewProjectPlan):
    return ConfirmedPlan(
        project_code=CODE,
        project_type=new.project_type,
        scale=new.scale,
        weeks=new.weeks,
        confirmed_by=new.confirmed_by,
        confirmed_at=WHEN,
    )


@pytest.fixture
def plans():
    repo = create_autospec(ProjectPlans, spec_set=True, instance=True)
    repo.get_project.return_value = a_project()
    repo.get.return_value = None
    repo.add.side_effect = a_confirmed
    return repo


@pytest.fixture
def scorings():
    repo = create_autospec(ScoringRepository, spec_set=True, instance=True)
    repo.latest.return_value = a_scoring()
    return repo


@pytest.fixture
def promotion():
    service = create_autospec(PromotionService, spec_set=True, instance=True)
    service.promote.return_value = Transition(True, "promote", 0, 1, 1, None)
    return service


@pytest.fixture
def audit_log():
    return create_autospec(AuditLog, spec_set=True, instance=True)


@pytest.fixture
def use_case(plans, scorings, promotion, audit_log):
    return StartProject(plans, scorings, promotion, audit_log)


def test_promotes_with_the_confirmed_plan_and_returns_the_transition(use_case, promotion):
    result = use_case.execute(a_context(), CODE, "medium", WEEKS)

    promotion.promote.assert_called_once_with(a_context(), CODE)
    assert isinstance(result, StartResult)
    assert result.transition.ok is True
    assert (result.transition.previous_phase, result.transition.current_phase) == (0, 1)
    assert result.transition.frozen_version == 1
    assert result.plan == ProposedPlan(ProjectType.INDUSTRIAL, Scale.MEDIUM, tuple(WEEKS))


def test_the_project_type_comes_from_the_opportunity_not_from_the_caller(use_case, plans):
    use_case.execute(a_context(), CODE, "large", WEEKS)

    plans.get_project.assert_called_once_with(CODE)
    assert plans.add.call_args.args[0].project_type is ProjectType.INDUSTRIAL


def test_stores_the_baseline_plan_as_confirmed_by_the_user(use_case, plans):
    use_case.execute(a_context(), CODE, "large", WEEKS)

    plans.add.assert_called_once_with(
        NewProjectPlan(
            study_id="demo-study",
            project_id="project-1",
            project_type=ProjectType.INDUSTRIAL,
            scale=Scale.LARGE,
            weeks=tuple(WEEKS),
            confirmed_by="demo-user",
        )
    )


def test_leaves_the_scoring_and_the_plan_in_the_exit_deliverable_of_phase_0(
    use_case, plans, scorings
):
    use_case.execute(a_context(), CODE, "medium", WEEKS)

    scorings.latest.assert_called_once_with("project-1")
    plans.save_exit_content.assert_called_once()
    project_id, content = plans.save_exit_content.call_args.args
    assert project_id == "project-1"
    assert content == {
        "project": {
            "client": "Client (sample)",
            "location": "Town (sample)",
            "project_type": "industrial",
            "scale": "medium",
        },
        "scoring": {
            "version": 3,
            "ratings": {c.value: 3 for c in Criterion},
            "weights": {c.value: 1.0 for c in Criterion},
            "threshold": 60,
            "score": 60.0,
            "recommendation": "pursue",
        },
        "plan": {
            "project_type": "industrial",
            "scale": "medium",
            "weeks": WEEKS,
            "total": 65,
        },
    }
    json.dumps(content)  # it must be JSON serializable as is


def test_writes_before_promoting_because_the_promotion_freezes_what_it_finds(
    plans, scorings, promotion, audit_log
):
    manager = Mock()
    manager.attach_mock(plans.add, "add")
    manager.attach_mock(plans.save_exit_content, "save_exit_content")
    manager.attach_mock(promotion.promote, "promote")

    StartProject(plans, scorings, promotion, audit_log).execute(a_context(), CODE, "medium", WEEKS)

    assert [call[0] for call in manager.mock_calls] == ["add", "save_exit_content", "promote"]


def test_the_scoring_does_not_block_the_decision(use_case, promotion, scorings):
    scorings.latest.return_value = a_scoring(
        score="12.0", recommendation=Recommendation.DO_NOT_PURSUE
    )

    result = use_case.execute(a_context(), CODE, "medium", WEEKS)

    assert result.transition.ok is True
    promotion.promote.assert_called_once()


def test_never_writes_a_scoring(use_case, scorings):
    use_case.execute(a_context(), CODE, "medium", WEEKS)

    scorings.add.assert_not_called()


def test_audits_the_confirmed_plan(use_case, audit_log):
    use_case.execute(a_context(), CODE, "medium", WEEKS)

    (event,) = [c.args[0] for c in audit_log.record.call_args_list]
    assert (event.study_id, event.user_id) == ("demo-study", "demo-user")
    assert (event.entity, event.entity_id, event.action) == ("project_plan", CODE, "confirm")
    assert event.outcome is Outcome.OK
    assert event.new_value == {
        "project_type": "industrial",
        "scale": "medium",
        "weeks": WEEKS,
        "total": 65,
        "scoring_version": 3,
    }


@pytest.mark.parametrize("role", [Role.PARTNER, Role.DIRECTOR])
def test_partner_and_director_can_start(role, use_case):
    assert use_case.execute(a_context(role), CODE, "medium", WEEKS).transition.ok is True


def test_an_unknown_project_is_raised_and_nothing_is_touched(use_case, plans, promotion, audit_log):
    plans.get_project.return_value = None

    with pytest.raises(ProjectNotFound):
        use_case.execute(a_context(), CODE, "medium", WEEKS)

    plans.add.assert_not_called()
    promotion.promote.assert_not_called()
    audit_log.record.assert_not_called()


def _no_scoring(scorings):
    scorings.latest.return_value = None


def _already_has_plan(plans):
    plans.get.return_value = a_confirmed(
        NewProjectPlan("s", "project-1", ProjectType.INDUSTRIAL, Scale.SMALL, tuple(WEEKS), "x")
    )


REJECTIONS = [
    pytest.param(
        {"role": Role.ARCHITECT}, None, NoAuthority, "no_authority", id="no-authority-architect"
    ),
    pytest.param(
        {"role": Role.PROJECT_DIRECTOR}, None, NoAuthority, "no_authority", id="no-authority-pd"
    ),
    pytest.param(
        {"role": Role.SITE_COLLABORATOR}, None, NoAuthority, "no_authority", id="no-authority-site"
    ),
    pytest.param({"scale": "huge"}, None, InvalidScale, "invalid_scale", id="invalid-scale"),
    pytest.param({"weeks": [1] * 6}, None, InvalidWeeks, "invalid_weeks", id="six-weeks"),
    pytest.param({"weeks": [0] + [1] * 6}, None, InvalidWeeks, "invalid_weeks", id="zero-weeks"),
    pytest.param({"weeks": [521] + [1] * 6}, None, InvalidWeeks, "invalid_weeks", id="521-weeks"),
    pytest.param({}, _no_scoring, IncompleteDeliverable, "incomplete_deliverable", id="no-scoring"),
    pytest.param(
        {}, _already_has_plan, PlanAlreadyConfirmed, "plan_already_confirmed", id="has-plan"
    ),
]


@pytest.mark.parametrize(("args", "arrange", "error_type", "code"), REJECTIONS)
def test_a_rejection_is_returned_audited_and_writes_nothing(
    args, arrange, error_type, code, use_case, plans, scorings, promotion, audit_log
):
    if arrange:
        arrange(plans if arrange is _already_has_plan else scorings)

    result = use_case.execute(
        a_context(args.get("role", Role.PARTNER)),
        CODE,
        args.get("scale", "medium"),
        args.get("weeks", WEEKS),
    )

    assert result.transition.ok is False
    assert isinstance(result.transition.error, error_type)
    assert result.transition.error.code == code
    assert result.transition.frozen_version is None
    assert (result.transition.previous_phase, result.transition.current_phase) == (0, 0)
    assert result.plan is None
    plans.add.assert_not_called()
    plans.save_exit_content.assert_not_called()
    promotion.promote.assert_not_called()
    (event,) = [c.args[0] for c in audit_log.record.call_args_list]
    assert (event.entity, event.entity_id, event.action) == ("project", CODE, "start")
    assert event.outcome is Outcome.REJECTED
    assert event.new_value == {"error": code}
    assert event.old_value == {"phase": 0}


def test_without_scoring_the_missing_item_is_named(use_case, scorings):
    _no_scoring(scorings)

    result = use_case.execute(a_context(), CODE, "medium", WEEKS)

    assert result.transition.error.missing == ["scoring"]


def test_no_authority_lists_who_can(use_case):
    result = use_case.execute(a_context(Role.ARCHITECT), CODE, "medium", WEEKS)

    assert result.transition.error.allowed == ["Socio", "Director"]


@pytest.mark.parametrize("phase", [1, 2, 7])
def test_only_a_project_in_phase_0_can_start(phase, use_case, plans, promotion, audit_log):
    plans.get_project.return_value = a_project(phase=phase)

    result = use_case.execute(a_context(), CODE, "medium", WEEKS)

    assert isinstance(result.transition.error, ProjectNotInOpportunityPhase)
    assert result.transition.error.code == "project_not_in_opportunity_phase"
    assert (result.transition.previous_phase, result.transition.current_phase) == (phase, phase)
    promotion.promote.assert_not_called()
    plans.add.assert_not_called()
    (event,) = [c.args[0] for c in audit_log.record.call_args_list]
    assert event.outcome is Outcome.REJECTED
    assert event.old_value == {"phase": phase}


class TestOrderOfChecks:
    def test_the_phase_is_checked_before_everything_else(self, use_case, plans, scorings):
        plans.get_project.return_value = a_project(phase=2)
        _already_has_plan(plans)
        _no_scoring(scorings)

        result = use_case.execute(a_context(Role.ARCHITECT), CODE, "huge", [0])

        assert isinstance(result.transition.error, ProjectNotInOpportunityPhase)

    def test_an_existing_plan_is_checked_before_authority(self, use_case, plans):
        _already_has_plan(plans)

        result = use_case.execute(a_context(Role.ARCHITECT), CODE, "huge", [0])

        assert isinstance(result.transition.error, PlanAlreadyConfirmed)

    def test_authority_is_checked_before_the_input(self, use_case):
        result = use_case.execute(a_context(Role.ARCHITECT), CODE, "huge", [0])

        assert isinstance(result.transition.error, NoAuthority)

    def test_the_scale_is_checked_before_the_weeks(self, use_case):
        result = use_case.execute(a_context(), CODE, "huge", [0])

        assert isinstance(result.transition.error, InvalidScale)

    def test_the_weeks_are_checked_before_the_scoring(self, use_case, scorings):
        _no_scoring(scorings)

        result = use_case.execute(a_context(), CODE, "medium", [0])

        assert isinstance(result.transition.error, InvalidWeeks)


class TestPlanReader:
    def test_returns_the_confirmed_plan(self, plans):
        confirmed = a_confirmed(
            NewProjectPlan("s", "project-1", ProjectType.INDUSTRIAL, Scale.SMALL, tuple(WEEKS), "x")
        )
        plans.get.return_value = confirmed

        assert ProjectPlanReader(plans).read(CODE) is confirmed
        plans.get_project.assert_called_once_with(CODE, lock=False)
        plans.get.assert_called_once_with("project-1")

    def test_an_unknown_project_is_not_found(self, plans):
        plans.get_project.return_value = None

        with pytest.raises(ProjectNotFound):
            ProjectPlanReader(plans).read(CODE)

    def test_a_project_without_plan_raises_plan_not_found(self, plans):
        with pytest.raises(PlanNotFound):
            ProjectPlanReader(plans).read(CODE)

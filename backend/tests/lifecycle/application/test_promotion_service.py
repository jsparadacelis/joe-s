from unittest.mock import create_autospec

import pytest

from backend.app.audit.domain.event import Outcome
from backend.app.audit.domain.ports import AuditLog
from backend.app.lifecycle.application.promotion_service import PromotionService
from backend.app.lifecycle.domain.deliverable import ExitDeliverable
from backend.app.lifecycle.domain.errors import (
    ActionNotAllowed,
    IncompleteDeliverable,
    NoAuthority,
    NoNextPhase,
    ProjectNotFound,
    ReasonRequired,
)
from backend.app.lifecycle.domain.frozen_version import FrozenVersion
from backend.app.lifecycle.domain.ports import DeliverableValidator, LifecycleRepository
from backend.app.lifecycle.domain.project import Project
from backend.app.lifecycle.domain.promotion import Action, Promotion
from backend.app.study.domain.context import Qualification, RequestContext, Role

CODE = "PRY-EJ-001"


def a_project(phase):
    return Project(
        id="project-1",
        study_id="demo-study",
        code=CODE,
        name="House (sample)",
        current_phase=phase,
    )


def a_context(role=Role.PROJECT_DIRECTOR, qualifications=()):
    return RequestContext(
        study_id="demo-study",
        user_id="demo-user",
        role=role,
        qualifications=frozenset(qualifications),
    )


def a_deliverable(phase, **overrides):
    values = {
        "phase": phase,
        "content": {"titulo": "Brief (sample)"},
        "complete": True,
        "approved": True,
    }
    return ExitDeliverable(**{**values, **overrides})


@pytest.fixture
def repo():
    repo = create_autospec(LifecycleRepository, spec_set=True, instance=True)
    repo.get_project.return_value = a_project(phase=2)
    repo.get_deliverable.return_value = a_deliverable(phase=2)
    repo.next_version.return_value = 1
    return repo


@pytest.fixture
def audit():
    return create_autospec(AuditLog, spec_set=True, instance=True)


@pytest.fixture
def validators():
    return {}


@pytest.fixture
def service(repo, audit, validators):
    return PromotionService(repo, audit, validators)


def audited(audit):
    return audit.record.call_args.args[0]


class TestPromote:
    def test_moves_the_project_to_the_next_phase(self, service, repo):
        transition = service.promote(a_context(), CODE)

        repo.change_phase.assert_called_once_with("project-1", 3)
        assert (transition.ok, transition.previous_phase, transition.current_phase) == (True, 2, 3)

    def test_freezes_the_deliverable_as_the_next_version(self, service, repo):
        repo.next_version.return_value = 4

        transition = service.promote(a_context(), CODE)

        frozen = repo.freeze.call_args.args[0]
        assert isinstance(frozen, FrozenVersion)
        assert (frozen.phase, frozen.version, frozen.content, frozen.frozen_by) == (
            2,
            4,
            {"titulo": "Brief (sample)"},
            "demo-user",
        )
        assert transition.frozen_version == 4

    def test_records_the_promotion_and_opens_the_next_phase(self, service, repo):
        service.promote(a_context(), CODE)

        promotion = repo.record_promotion.call_args.args[0]
        assert isinstance(promotion, Promotion)
        assert (promotion.action, promotion.from_phase, promotion.to_phase) == (
            Action.PROMOTE,
            2,
            3,
        )
        repo.open_deliverable.assert_called_once_with("project-1", 3)

    def test_audits_who_what_and_the_version(self, service, audit):
        service.promote(a_context(), CODE)

        event = audited(audit)
        assert (event.entity, event.entity_id, event.action, event.user_id) == (
            "project",
            CODE,
            "promote",
            "demo-user",
        )
        assert (event.old_value, event.new_value, event.version, event.outcome) == (
            {"phase": 2},
            {"phase": 3},
            1,
            Outcome.OK,
        )

    def test_unknown_project_raises(self, service, repo):
        repo.get_project.return_value = None

        with pytest.raises(ProjectNotFound):
            service.promote(a_context(), CODE)

    def test_the_project_is_locked_for_the_whole_operation(self, service, repo):
        service.promote(a_context(), CODE)

        repo.get_project.assert_called_once_with(CODE)


class TestPromoteRejected:
    def test_without_authority_names_who_can_and_changes_nothing(self, service, repo):
        transition = service.promote(a_context(Role.ARCHITECT), CODE)

        assert transition.ok is False
        assert isinstance(transition.error, NoAuthority)
        assert transition.error.allowed == ["Director de proyecto"]
        repo.freeze.assert_not_called()
        repo.change_phase.assert_not_called()

    def test_with_the_right_qualification_a_qualified_phase_is_allowed(self, service, repo):
        repo.get_project.return_value = a_project(phase=4)
        repo.get_deliverable.return_value = a_deliverable(phase=4)
        context = a_context(Role.ARCHITECT, [Qualification.LICENSED_SIGNATORY])

        transition = service.promote(context, CODE)

        assert transition.ok is True

    @pytest.mark.parametrize(
        ("overrides", "missing"),
        [
            (
                {"complete": False, "approved": False},
                ["entregable de salida completo", "aprobación del entregable"],
            ),
            ({"approved": False}, ["aprobación del entregable"]),
        ],
    )
    def test_incomplete_deliverable_reports_what_is_missing(
        self, service, repo, overrides, missing
    ):
        repo.get_deliverable.return_value = a_deliverable(phase=2, **overrides)

        transition = service.promote(a_context(), CODE)

        assert isinstance(transition.error, IncompleteDeliverable)
        assert transition.error.missing == missing
        repo.freeze.assert_not_called()
        repo.change_phase.assert_not_called()

    def test_missing_deliverable_counts_as_incomplete(self, service, repo):
        repo.get_deliverable.return_value = None

        transition = service.promote(a_context(), CODE)

        assert transition.error.missing == ["entregable de salida"]

    def test_phase_validator_can_block_the_promotion(self, service, repo, validators):
        validator = create_autospec(DeliverableValidator, spec_set=True, instance=True)
        validator.validate.return_value = ["referencia catastral"]
        validators[2] = validator

        transition = service.promote(a_context(), CODE)

        assert transition.error.missing == ["referencia catastral"]

    def test_closing_phase_has_no_next_phase(self, service, repo):
        repo.get_project.return_value = a_project(phase=7)
        context = a_context(Role.ARCHITECT, [Qualification.SPONSOR])

        transition = service.promote(context, CODE)

        assert isinstance(transition.error, NoNextPhase)

    def test_every_rejection_is_audited_with_its_reason(self, service, audit):
        service.promote(a_context(Role.ARCHITECT), CODE)

        event = audited(audit)
        assert (event.action, event.outcome, event.new_value) == (
            "promote",
            Outcome.REJECTED,
            {"error": "no_authority"},
        )

    def test_a_rejection_does_not_record_a_promotion(self, service, repo):
        service.promote(a_context(Role.ARCHITECT), CODE)

        repo.record_promotion.assert_not_called()


class TestHold:
    def test_records_the_hold_with_its_reason_and_keeps_the_phase(self, service, repo, audit):
        transition = service.hold(a_context(), CODE, "Missing topographic survey")

        promotion = repo.record_promotion.call_args.args[0]
        assert (promotion.action, promotion.from_phase, promotion.to_phase, promotion.reason) == (
            Action.HOLD,
            2,
            None,
            "Missing topographic survey",
        )
        repo.change_phase.assert_not_called()
        assert (transition.ok, transition.current_phase) == (True, 2)
        assert audited(audit).new_value == {"phase": 2, "reason": "Missing topographic survey"}

    @pytest.mark.parametrize("reason", [None, "", "   "])
    def test_requires_a_reason(self, service, repo, reason):
        transition = service.hold(a_context(), CODE, reason)

        assert isinstance(transition.error, ReasonRequired)
        repo.record_promotion.assert_not_called()

    def test_requires_authority_in_the_current_phase(self, service):
        transition = service.hold(a_context(Role.ARCHITECT), CODE, "reason")

        assert isinstance(transition.error, NoAuthority)


class TestDoNotPursue:
    def test_records_the_decision_from_the_opportunity_phase(self, service, repo):
        repo.get_project.return_value = a_project(phase=0)

        transition = service.do_not_pursue(a_context(Role.PARTNER), CODE, "Below threshold")

        promotion = repo.record_promotion.call_args.args[0]
        assert (promotion.action, promotion.from_phase, promotion.reason) == (
            Action.DO_NOT_PURSUE,
            0,
            "Below threshold",
        )
        assert transition.ok is True

    @pytest.mark.parametrize("phase", [1, 3, 7])
    def test_is_not_allowed_after_the_opportunity_phase(self, service, repo, phase):
        repo.get_project.return_value = a_project(phase=phase)

        transition = service.do_not_pursue(a_context(Role.PARTNER), CODE, "reason")

        assert isinstance(transition.error, ActionNotAllowed)
        repo.record_promotion.assert_not_called()

    def test_requires_a_reason(self, service, repo):
        repo.get_project.return_value = a_project(phase=0)

        transition = service.do_not_pursue(a_context(Role.PARTNER), CODE, " ")

        assert isinstance(transition.error, ReasonRequired)

    def test_requires_authority(self, service, repo):
        repo.get_project.return_value = a_project(phase=0)

        transition = service.do_not_pursue(a_context(Role.ARCHITECT), CODE, "reason")

        assert transition.error.allowed == ["Socio", "Director"]

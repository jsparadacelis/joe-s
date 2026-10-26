"""Pause use cases with simulated ports."""

from datetime import date, datetime, timezone
from unittest.mock import create_autospec

import pytest

from backend.app.access.domain.ports import ProjectRoleReader
from backend.app.access.domain.project_roles import ProjectRole
from backend.app.audit.domain.event import Outcome
from backend.app.audit.domain.ports import AuditLog
from backend.app.study.domain.context import RequestContext, Role
from backend.app.timing.application.pause_service import PauseService
from backend.app.timing.domain.errors import (
    AlreadyPaused,
    CannotPauseOpportunity,
    InvalidField,
    NotAllowed,
    NotPaused,
    ProjectNotFound,
)
from backend.app.timing.domain.pause import PausableProject, Pause
from backend.app.timing.domain.ports import PauseRepository
from backend.app.timing.domain.time_tracking import PauseReason

NOW = datetime(2026, 10, 24, 15, 0, tzinfo=timezone.utc)
TODAY = date(2026, 10, 24)
CODE = "PRY-2026-001"
VALID = {"reason": "client_wait", "expected_resumption": "2026-11-09"}


def a_project(phase=1, paused=False):
    return PausableProject(
        id="project-1", study_id="study-1", code=CODE, current_phase=phase, paused=paused
    )


def a_context(role=Role.PROJECT_DIRECTOR):
    return RequestContext(study_id="study-1", user_id="demo-user", role=role)


def a_pause(**overrides):
    values = {
        "id": "pause-1",
        "project_id": "project-1",
        "phase": 1,
        "reason": PauseReason.CLIENT_WAIT,
        "started_on": date(2026, 10, 20),
        "expected_resumption": date(2026, 11, 9),
        "opened_by": "demo-user",
    }
    values.update(overrides)
    return Pause(**values)


@pytest.fixture
def repo():
    repo = create_autospec(PauseRepository, spec_set=True, instance=True)
    repo.get_project.return_value = a_project()
    repo.get_open_pause.return_value = None
    repo.add.side_effect = lambda new: a_pause(
        phase=new.phase,
        reason=new.reason,
        started_on=new.started_on,
        expected_resumption=new.expected_resumption,
        opened_by=new.opened_by,
    )
    repo.close.side_effect = lambda pause_id, resumed_on, closed_by: a_pause(
        resumed_on=resumed_on, closed_by=closed_by
    )
    return repo


@pytest.fixture
def audit_log():
    return create_autospec(AuditLog, spec_set=True, instance=True)


@pytest.fixture
def project_roles():
    """The caller directs the project by default: tests of refusals empty it."""
    reader = create_autospec(ProjectRoleReader, spec_set=True, instance=True)
    reader.roles_of.return_value = frozenset({ProjectRole.PROJECT_DIRECTOR})
    return reader


@pytest.fixture
def service(repo, audit_log, project_roles):
    return PauseService(repo, audit_log, project_roles, clock=lambda: NOW)


def events(audit_log):
    return [call.args[0] for call in audit_log.record.call_args_list]


class TestPause:
    def test_opens_the_pause_marks_the_project_and_audits(self, service, repo, audit_log):
        result = service.pause(a_context(), CODE, VALID)

        assert result.error is None
        new = repo.add.call_args.args[0]
        assert (new.project_id, new.study_id, new.phase) == ("project-1", "study-1", 1)
        assert (new.reason, new.started_on, new.opened_by) == (
            PauseReason.CLIENT_WAIT,
            TODAY,
            "demo-user",
        )
        assert new.expected_resumption == date(2026, 11, 9)
        repo.set_paused.assert_called_once_with("project-1", True)
        [event] = events(audit_log)
        assert (event.entity, event.entity_id, event.action, event.outcome) == (
            "project",
            CODE,
            "pause_project",
            Outcome.OK,
        )
        assert event.new_value == {
            "phase": 1,
            "reason": "client_wait",
            "started_on": "2026-10-24",
            "expected_resumption": "2026-11-09",
        }

    def test_the_view_carries_overdue_computed_with_the_clock(self, service):
        result = service.pause(a_context(), CODE, VALID)

        assert (result.view.overdue, result.view.days_overdue) == (False, 0)

    @pytest.mark.parametrize("role", [Role.PROJECT_DIRECTOR, Role.DIRECTOR, Role.PARTNER])
    def test_authorised_roles_can_pause(self, service, role):
        assert service.pause(a_context(role), CODE, VALID).error is None

    def test_unknown_project_raises_not_found(self, service, repo):
        repo.get_project.return_value = None

        with pytest.raises(ProjectNotFound):
            service.pause(a_context(), CODE, VALID)

    def test_a_project_director_of_another_project_is_rejected(self, service, repo, project_roles):
        """The studio role is not enough: the function is held per project (RGB-4)."""
        project_roles.roles_of.return_value = frozenset()

        result = service.pause(a_context(Role.PROJECT_DIRECTOR), CODE, VALID)

        assert isinstance(result.error, NotAllowed)
        repo.add.assert_not_called()

    def test_management_pauses_any_project_without_a_project_function(self, service, project_roles):
        project_roles.roles_of.return_value = frozenset()

        assert service.pause(a_context(Role.DIRECTOR), CODE, VALID).error is None

    def test_other_roles_are_rejected_and_the_attempt_is_audited(
        self, service, repo, audit_log, project_roles
    ):
        project_roles.roles_of.return_value = frozenset()
        result = service.pause(a_context(Role.ARCHITECT), CODE, VALID)

        assert isinstance(result.error, NotAllowed)
        repo.add.assert_not_called()
        repo.set_paused.assert_not_called()
        [event] = events(audit_log)
        assert (event.action, event.outcome) == ("pause_project", Outcome.REJECTED)
        assert event.new_value == {"error": "not_allowed"}

    def test_permission_is_checked_before_the_phase_and_the_fields(
        self, service, repo, project_roles
    ):
        project_roles.roles_of.return_value = frozenset()
        repo.get_project.return_value = a_project(phase=0)

        result = service.pause(a_context(Role.ARCHITECT), CODE, {})

        assert isinstance(result.error, NotAllowed)

    def test_an_opportunity_cannot_be_paused_before_the_fields_are_validated(
        self, service, repo, audit_log
    ):
        repo.get_project.return_value = a_project(phase=0)

        result = service.pause(a_context(), CODE, {})

        assert isinstance(result.error, CannotPauseOpportunity)
        repo.add.assert_not_called()
        audit_log.record.assert_not_called()

    def test_invalid_fields_come_before_already_paused(self, service, repo):
        repo.get_open_pause.return_value = a_pause()

        result = service.pause(a_context(), CODE, {"reason": "nope"})

        assert isinstance(result.error, InvalidField)
        assert result.error.field == "reason"

    def test_a_date_before_today_uses_the_injected_clock(self, service):
        result = service.pause(
            a_context(), CODE, {"reason": "other", "expected_resumption": "2026-10-23"}
        )

        assert isinstance(result.error, InvalidField)

    def test_a_second_open_pause_is_rejected_without_writes(self, service, repo, audit_log):
        repo.get_open_pause.return_value = a_pause()

        result = service.pause(a_context(), CODE, VALID)

        assert isinstance(result.error, AlreadyPaused)
        repo.add.assert_not_called()
        repo.set_paused.assert_not_called()
        audit_log.record.assert_not_called()

    def test_a_flag_without_an_open_row_does_not_block_pausing(self, service, repo):
        repo.get_project.return_value = a_project(paused=True)

        assert service.pause(a_context(), CODE, VALID).error is None


class TestResume:
    def test_closes_the_pause_unmarks_the_project_and_audits(self, service, repo, audit_log):
        repo.get_project.return_value = a_project(paused=True)
        repo.get_open_pause.return_value = a_pause(expected_resumption=date(2026, 10, 1))

        result = service.resume(a_context(Role.DIRECTOR), CODE)

        assert result.error is None
        repo.close.assert_called_once_with("pause-1", TODAY, "demo-user")
        repo.set_paused.assert_called_once_with("project-1", False)
        assert result.view.pause.resumed_on == TODAY
        assert (result.view.overdue, result.view.days_overdue) == (False, 0)
        [event] = events(audit_log)
        assert (event.action, event.outcome) == ("resume_project", Outcome.OK)
        assert event.old_value["expected_resumption"] == "2026-10-01"
        assert event.new_value == {"phase": 1, "resumed_on": "2026-10-24"}

    def test_unknown_project_raises_not_found(self, service, repo):
        repo.get_project.return_value = None

        with pytest.raises(ProjectNotFound):
            service.resume(a_context(), CODE)

    def test_other_roles_are_rejected_and_audited(self, service, repo, audit_log, project_roles):
        project_roles.roles_of.return_value = frozenset()
        repo.get_open_pause.return_value = a_pause()

        result = service.resume(a_context(Role.SITE_COLLABORATOR), CODE)

        assert isinstance(result.error, NotAllowed)
        repo.close.assert_not_called()
        [event] = events(audit_log)
        assert (event.action, event.outcome) == ("resume_project", Outcome.REJECTED)

    def test_without_an_open_pause_it_is_not_paused(self, service, repo, audit_log):
        result = service.resume(a_context(), CODE)

        assert isinstance(result.error, NotPaused)
        repo.close.assert_not_called()
        audit_log.record.assert_not_called()


class TestHistory:
    def test_splits_the_active_pause_from_the_closed_ones(self, service, repo):
        repo.list_pauses.return_value = [
            a_pause(id="p3", resumed_on=None),
            a_pause(id="p2", resumed_on=date(2026, 10, 1)),
            a_pause(id="p1", resumed_on=date(2026, 9, 1)),
        ]

        result = service.history(CODE)

        assert result.active.pause.id == "p3"
        assert [v.pause.id for v in result.history] == ["p2", "p1"]

    def test_no_active_pause(self, service, repo):
        repo.list_pauses.return_value = []

        result = service.history(CODE)

        assert (result.active, result.history) == (None, [])

    def test_unknown_project_raises_not_found(self, service, repo):
        repo.get_project.return_value = None

        with pytest.raises(ProjectNotFound):
            service.history(CODE)

    def test_reading_does_not_lock_the_project(self, service, repo):
        repo.list_pauses.return_value = []

        service.history(CODE)

        repo.get_project.assert_called_once_with(CODE, lock=False)

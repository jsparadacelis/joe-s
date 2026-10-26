from unittest.mock import create_autospec

import pytest

from backend.app.access.application.manage_project_members import ManageProjectMembers
from backend.app.access.domain.assignment import Assignment
from backend.app.access.domain.errors import (
    AssignmentAlreadyExists,
    AssignmentNotFound,
    MemberNotActive,
    MemberNotFound,
    MissingQualification,
    NoAuthority,
    ProjectNotFound,
    SigningFunctionRestricted,
)
from backend.app.access.domain.ports import ProjectDirectory, ProjectMembers, ProjectRef
from backend.app.access.domain.project_roles import ProjectRole
from backend.app.audit.domain.event import Outcome
from backend.app.audit.domain.ports import AuditLog
from backend.app.study.domain.context import Qualification, RequestContext, Role
from backend.app.study.domain.members import Member, MemberStatus
from backend.app.study.domain.ports import Members

STUDY = "00000000-0000-0000-0000-00000000a001"
PROJECT = ProjectRef(id="project-1", code="PRY-T-001", phase=3)


def a_context(role=Role.PARTNER):
    return RequestContext(study_id=STUDY, user_id="subject-9", role=role)


def a_member(**overrides):
    values = {
        "id": "member-1",
        "study_id": STUDY,
        "email": "ana@example.com",
        "role": Role.ARCHITECT,
        "status": MemberStatus.ACTIVE,
        "user_id": "subject-1",
    }
    return Member(**{**values, **overrides})


def an_assignment(role=ProjectRole.ARCHITECT):
    return Assignment(
        id="assignment-1", study_id=STUDY, project_id="project-1", member_id="member-1", role=role
    )


@pytest.fixture
def directory():
    mock = create_autospec(ProjectDirectory, spec_set=True, instance=True)
    mock.find.return_value = PROJECT
    return mock


@pytest.fixture
def project_members():
    mock = create_autospec(ProjectMembers, spec_set=True, instance=True)
    mock.roles_of.return_value = frozenset()
    mock.add.side_effect = lambda **kw: an_assignment(kw["role"])
    mock.list_for_project.return_value = [an_assignment()]
    mock.remove.return_value = an_assignment()
    return mock


@pytest.fixture
def members():
    mock = create_autospec(Members, spec_set=True, instance=True)
    mock.get.return_value = a_member()
    return mock


@pytest.fixture
def audit_log():
    return create_autospec(AuditLog, spec_set=True, instance=True)


@pytest.fixture
def service(directory, project_members, members, audit_log):
    return ManageProjectMembers(directory, project_members, members, audit_log)


def last_event(audit_log):
    return audit_log.record.call_args.args[0]


class TestAssign:
    def test_a_partner_assigns_a_team_function(self, service, project_members, audit_log):
        result = service.assign(a_context(), "PRY-T-001", "member-1", ProjectRole.ARCHITECT)

        assert result.error is None
        assert result.assignment.role is ProjectRole.ARCHITECT
        project_members.add.assert_called_once_with(
            study_id=STUDY,
            project_id="project-1",
            member_id="member-1",
            role=ProjectRole.ARCHITECT,
            assigned_by="subject-9",
        )
        event = last_event(audit_log)
        assert (event.entity, event.action, event.outcome) == ("project_member", "assign", Outcome.OK)
        assert event.new_value["role"] == "architect"

    def test_the_project_director_of_that_project_assigns_team_functions(
        self, service, project_members
    ):
        project_members.roles_of.return_value = frozenset({ProjectRole.PROJECT_DIRECTOR})
        context = a_context(Role.PROJECT_DIRECTOR)

        result = service.assign(context, "PRY-T-001", "member-1", ProjectRole.TECHNICAL_LEAD)

        assert result.error is None
        project_members.roles_of.assert_called_once_with("project-1", "subject-9")

    @pytest.mark.parametrize("role", [Role.ARCHITECT, Role.TECHNICAL_LEAD, Role.PROJECT_DIRECTOR])
    def test_someone_without_a_directing_function_cannot_assign(
        self, service, project_members, audit_log, role
    ):
        result = service.assign(a_context(role), "PRY-T-001", "member-1", ProjectRole.ARCHITECT)

        assert isinstance(result.error, NoAuthority)
        project_members.add.assert_not_called()
        event = last_event(audit_log)
        assert event.outcome is Outcome.REJECTED
        assert event.new_value["error"] == "no_authority"

    @pytest.mark.parametrize(
        ("function", "qualification"),
        [
            (ProjectRole.LICENSED_SIGNATORY, Qualification.LICENSED_SIGNATORY),
            (ProjectRole.SITE_MANAGEMENT, Qualification.SITE_MANAGEMENT),
            (ProjectRole.SPONSOR, Qualification.SPONSOR),
        ],
    )
    def test_a_signing_function_needs_the_matching_qualification(
        self, service, members, project_members, function, qualification
    ):
        members.get.return_value = a_member(qualifications=frozenset({qualification}))

        assert service.assign(a_context(), "PRY-T-001", "member-1", function).error is None

        members.get.return_value = a_member()
        result = service.assign(a_context(), "PRY-T-001", "member-1", function)
        assert isinstance(result.error, MissingQualification)

    def test_a_qualification_does_not_cover_another_function(self, service, members):
        members.get.return_value = a_member(qualifications=frozenset({Qualification.SPONSOR}))

        result = service.assign(
            a_context(), "PRY-T-001", "member-1", ProjectRole.LICENSED_SIGNATORY
        )

        assert isinstance(result.error, MissingQualification)

    @pytest.mark.parametrize(
        "function",
        [ProjectRole.LICENSED_SIGNATORY, ProjectRole.SITE_MANAGEMENT, ProjectRole.SPONSOR],
    )
    def test_the_project_director_cannot_hand_out_signing_functions(
        self, service, members, project_members, audit_log, function
    ):
        project_members.roles_of.return_value = frozenset({ProjectRole.PROJECT_DIRECTOR})
        members.get.return_value = a_member(qualifications=frozenset(Qualification))

        result = service.assign(a_context(Role.PROJECT_DIRECTOR), "PRY-T-001", "member-1", function)

        assert isinstance(result.error, SigningFunctionRestricted)
        project_members.add.assert_not_called()
        assert last_event(audit_log).outcome is Outcome.REJECTED

    def test_a_director_may_hand_out_signing_functions(self, service, members):
        members.get.return_value = a_member(qualifications=frozenset({Qualification.SPONSOR}))

        result = service.assign(a_context(Role.DIRECTOR), "PRY-T-001", "member-1", ProjectRole.SPONSOR)

        assert result.error is None

    def test_an_unknown_project_is_not_found(self, service, directory, project_members):
        directory.find.return_value = None

        result = service.assign(a_context(), "PRY-NOPE", "member-1", ProjectRole.ARCHITECT)

        assert isinstance(result.error, ProjectNotFound)
        project_members.add.assert_not_called()

    def test_an_unknown_member_is_not_found(self, service, members):
        members.get.return_value = None

        result = service.assign(a_context(), "PRY-T-001", "member-9", ProjectRole.ARCHITECT)

        assert isinstance(result.error, MemberNotFound)

    @pytest.mark.parametrize("status", [MemberStatus.INVITED, MemberStatus.REVOKED])
    def test_only_active_members_get_a_function(self, service, members, project_members, status):
        members.get.return_value = a_member(status=status)

        result = service.assign(a_context(), "PRY-T-001", "member-1", ProjectRole.ARCHITECT)

        assert isinstance(result.error, MemberNotActive)
        project_members.add.assert_not_called()

    def test_a_repeated_assignment_is_reported(self, service, project_members):
        project_members.add.side_effect = AssignmentAlreadyExists()

        result = service.assign(a_context(), "PRY-T-001", "member-1", ProjectRole.ARCHITECT)

        assert isinstance(result.error, AssignmentAlreadyExists)


class TestUnassign:
    def test_a_partner_removes_an_assignment(self, service, project_members, audit_log):
        result = service.unassign(a_context(), "PRY-T-001", "assignment-1")

        assert result.error is None
        project_members.remove.assert_called_once_with("project-1", "assignment-1")
        event = last_event(audit_log)
        assert (event.entity, event.action, event.outcome) == (
            "project_member",
            "unassign",
            Outcome.OK,
        )

    def test_someone_without_authority_cannot_remove(self, service, project_members, audit_log):
        result = service.unassign(a_context(Role.ARCHITECT), "PRY-T-001", "assignment-1")

        assert isinstance(result.error, NoAuthority)
        project_members.remove.assert_not_called()
        assert last_event(audit_log).outcome is Outcome.REJECTED

    def test_the_project_director_cannot_remove_a_signing_function(
        self, service, project_members
    ):
        project_members.roles_of.return_value = frozenset({ProjectRole.PROJECT_DIRECTOR})
        project_members.list_for_project.return_value = [an_assignment(ProjectRole.SPONSOR)]

        result = service.unassign(a_context(Role.PROJECT_DIRECTOR), "PRY-T-001", "assignment-1")

        assert isinstance(result.error, SigningFunctionRestricted)
        project_members.remove.assert_not_called()

    def test_removing_an_unknown_assignment_is_not_found(self, service, project_members):
        project_members.remove.return_value = None
        project_members.list_for_project.return_value = []

        result = service.unassign(a_context(), "PRY-T-001", "assignment-9")

        assert isinstance(result.error, AssignmentNotFound)


class TestList:
    def test_any_member_lists_the_team(self, service, project_members):
        result = service.list_team(a_context(Role.ARCHITECT), "PRY-T-001")

        assert result.error is None
        assert result.assignments == [an_assignment()]

    def test_listing_an_unknown_project_is_not_found(self, service, directory):
        directory.find.return_value = None

        assert isinstance(service.list_team(a_context(), "PRY-NOPE").error, ProjectNotFound)

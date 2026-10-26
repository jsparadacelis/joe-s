"""Project member routes with a simulated use case (dev mode, fictitious context)."""

from contextlib import contextmanager
from unittest.mock import create_autospec

import pytest
from fastapi.testclient import TestClient

from backend.app.access.application.manage_project_members import (
    AssignmentResult,
    ManageProjectMembers,
)
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
from backend.app.access.domain.project_roles import ProjectRole
from backend.app.api.dependencies import get_settings, project_members_unit_of_work
from backend.app.api.main import create_app
from backend.app.study.domain.context import Role
from backend.tests.api.auth_support import STUDY, dev_settings

MEMBER = "00000000-0000-0000-0000-0000000000aa"
ASSIGNMENT = "00000000-0000-0000-0000-0000000000bb"


def an_assignment(role=ProjectRole.ARCHITECT):
    return Assignment(
        id=ASSIGNMENT, study_id=STUDY, project_id="project-1", member_id=MEMBER, role=role
    )


@pytest.fixture
def service():
    return create_autospec(ManageProjectMembers, spec_set=True, instance=True)


@pytest.fixture
def client(service):
    settings = dev_settings()
    app = create_app(settings)
    app.dependency_overrides[get_settings] = lambda: settings

    @contextmanager
    def fake_unit(context):
        yield service

    app.dependency_overrides[project_members_unit_of_work] = lambda: fake_unit
    return TestClient(app)


def assignment_json(role="architect"):
    return {"id": ASSIGNMENT, "member_id": MEMBER, "role": role}


class TestAssign:
    def test_assigns_and_answers_201(self, client, service):
        service.assign.return_value = AssignmentResult(assignment=an_assignment())

        response = client.post(
            "/api/projects/PRY-T-001/members", json={"member_id": MEMBER, "role": "architect"}
        )

        assert response.status_code == 201
        assert response.json() == assignment_json()
        context, code, member_id, role = service.assign.call_args.args
        assert (code, member_id, role) == ("PRY-T-001", MEMBER, ProjectRole.ARCHITECT)
        assert context.role is Role.PARTNER

    @pytest.mark.parametrize(
        ("error", "status", "code"),
        [
            (NoAuthority(), 403, "no_authority"),
            (SigningFunctionRestricted(), 403, "no_authority"),
            (ProjectNotFound(), 404, "project_not_found"),
            (MemberNotFound(), 404, "member_not_found"),
            (MemberNotActive(), 409, "member_not_active"),
            (AssignmentAlreadyExists(), 409, "assignment_already_exists"),
            (MissingQualification(), 422, "missing_qualification"),
        ],
    )
    def test_maps_every_refusal_to_its_status(self, client, service, error, status, code):
        service.assign.return_value = AssignmentResult(error=error)

        response = client.post(
            "/api/projects/PRY-T-001/members", json={"member_id": MEMBER, "role": "sponsor"}
        )

        assert response.status_code == status
        assert response.json() == {"detail": {"code": code, "message": error.message}}

    @pytest.mark.parametrize(
        "body",
        [
            {"member_id": MEMBER, "role": "ai_agent"},
            {"member_id": "not-a-uuid", "role": "architect"},
            {"member_id": MEMBER},
            {"member_id": MEMBER, "role": "architect", "extra": 1},
        ],
    )
    def test_rejects_a_malformed_body_with_422(self, client, service, body):
        response = client.post("/api/projects/PRY-T-001/members", json=body)

        assert response.status_code == 422
        service.assign.assert_not_called()


class TestUnassign:
    def test_removes_and_answers_with_the_assignment(self, client, service):
        service.unassign.return_value = AssignmentResult(assignment=an_assignment())

        response = client.delete(f"/api/projects/PRY-T-001/members/{ASSIGNMENT}")

        assert response.status_code == 200
        assert response.json() == assignment_json()
        _, code, assignment_id = service.unassign.call_args.args
        assert (code, assignment_id) == ("PRY-T-001", ASSIGNMENT)

    def test_an_unknown_assignment_is_404(self, client, service):
        service.unassign.return_value = AssignmentResult(error=AssignmentNotFound())

        response = client.delete(f"/api/projects/PRY-T-001/members/{ASSIGNMENT}")

        assert response.status_code == 404
        assert response.json()["detail"]["code"] == "assignment_not_found"

    def test_a_refusal_is_403(self, client, service):
        service.unassign.return_value = AssignmentResult(error=SigningFunctionRestricted())

        assert client.delete(f"/api/projects/PRY-T-001/members/{ASSIGNMENT}").status_code == 403


class TestList:
    def test_lists_the_team(self, client, service):
        service.list_team.return_value = AssignmentResult(
            assignments=[an_assignment(), an_assignment(ProjectRole.SPONSOR)]
        )

        response = client.get("/api/projects/PRY-T-001/members")

        assert response.status_code == 200
        assert response.json() == {
            "members": [assignment_json(), assignment_json("sponsor")],
        }

    def test_an_unknown_project_is_404(self, client, service):
        service.list_team.return_value = AssignmentResult(error=ProjectNotFound())

        assert client.get("/api/projects/PRY-NOPE/members").status_code == 404

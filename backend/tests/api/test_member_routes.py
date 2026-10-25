"""Member routes with a simulated use case (dev mode, fictitious context)."""

import pytest

from backend.app.study.application.manage_members import MemberResult
from backend.app.study.domain.context import Qualification, Role
from backend.app.study.domain.errors import (
    InvalidEmail,
    LastPartner,
    MemberAlreadyExists,
    MemberNotFound,
    NoAuthority,
    QualificationsRestricted,
    RoleRestricted,
)
from backend.app.study.domain.members import MemberStatus
from backend.tests.api.auth_support import (
    a_member,
    client_with,
    dev_settings,
    members_service_mock,
)

MEMBER_ID = "00000000-0000-0000-0000-0000000000aa"


@pytest.fixture
def service():
    return members_service_mock()


@pytest.fixture
def client(service):
    return client_with(dev_settings(), None, service)


def member_json(**overrides):
    values = {
        "id": "member-1",
        "email": "ana@example.com",
        "role": "partner",
        "qualifications": [],
        "status": "active",
    }
    return {**values, **overrides}


class TestInvite:
    def test_invites_and_answers_201_with_the_member(self, client, service):
        service.invite.return_value = MemberResult(
            member=a_member(status=MemberStatus.INVITED, role=Role.ARCHITECT, user_id=None)
        )

        response = client.post(
            "/api/members/invitations",
            json={"email": "Ana@Example.com", "role": "architect"},
        )

        assert response.status_code == 201
        assert response.json() == member_json(role="architect", status="invited")
        context, email, role, qualifications = service.invite.call_args.args
        assert (email, role, qualifications) == ("Ana@Example.com", Role.ARCHITECT, frozenset())
        assert context.role is Role.PARTNER

    def test_passes_the_qualifications(self, client, service):
        service.invite.return_value = MemberResult(
            member=a_member(
                qualifications=frozenset({Qualification.SPONSOR, Qualification.SITE_MANAGEMENT})
            )
        )

        response = client.post(
            "/api/members/invitations",
            json={
                "email": "ana@example.com",
                "role": "project_director",
                "qualifications": ["sponsor", "site_management"],
            },
        )

        assert service.invite.call_args.args[3] == frozenset(
            {Qualification.SPONSOR, Qualification.SITE_MANAGEMENT}
        )
        assert response.json()["qualifications"] == ["site_management", "sponsor"]

    def test_the_administration_role_can_be_invited(self, client, service):
        service.invite.return_value = MemberResult(member=a_member(role=Role.ADMINISTRATION))

        response = client.post(
            "/api/members/invitations", json={"email": "ana@example.com", "role": "administration"}
        )

        assert response.status_code == 201

    @pytest.mark.parametrize(
        "body",
        [
            {},
            {"email": "ana@example.com"},
            {"role": "architect"},
            {"email": "ana@example.com", "role": "emperor"},
            {"email": "ana@example.com", "role": "architect", "qualifications": ["wizard"]},
            {"email": 5, "role": "architect"},
            {"email": "ana@example.com", "role": "architect", "qualifications": "sponsor"},
        ],
    )
    def test_invalid_bodies_answer_422_invalid_request(self, client, service, body):
        response = client.post("/api/members/invitations", json=body)

        assert response.status_code == 422
        assert response.json()["detail"]["code"] == "invalid_request"
        service.invite.assert_not_called()

    @pytest.mark.parametrize(
        ("error", "status", "code"),
        [
            (NoAuthority(), 403, "no_authority"),
            (RoleRestricted(), 403, "no_authority"),
            (QualificationsRestricted(), 403, "no_authority"),
            (MemberAlreadyExists(), 409, "member_already_exists"),
            (InvalidEmail(), 422, "invalid_email"),
        ],
    )
    def test_business_errors_map_to_http(self, client, service, error, status, code):
        service.invite.return_value = MemberResult(error=error)

        response = client.post(
            "/api/members/invitations", json={"email": "ana@example.com", "role": "architect"}
        )

        assert response.status_code == status
        assert response.json() == {"detail": {"code": code, "message": error.message}}


class TestList:
    def test_lists_the_members_of_the_study(self, client, service):
        service.list_members.return_value = [
            a_member(),
            a_member(id="member-2", email="b@example.com", status=MemberStatus.INVITED),
        ]

        response = client.get("/api/members")

        assert response.status_code == 200
        assert response.json() == {
            "members": [
                member_json(),
                member_json(id="member-2", email="b@example.com", status="invited"),
            ]
        }

    def test_an_empty_study_lists_nothing(self, client):
        assert client.get("/api/members").json() == {"members": []}

    def test_the_response_never_exposes_the_linked_user_id(self, client, service):
        service.list_members.return_value = [a_member()]

        assert "user_id" not in client.get("/api/members").json()["members"][0]


class TestRevoke:
    def test_revokes_and_answers_the_member(self, client, service):
        service.revoke.return_value = MemberResult(member=a_member(status=MemberStatus.REVOKED))

        response = client.post(f"/api/members/{MEMBER_ID}/revoke")

        assert response.status_code == 200
        assert response.json() == member_json(status="revoked")
        assert service.revoke.call_args.args[1] == MEMBER_ID

    @pytest.mark.parametrize(
        ("error", "status", "code"),
        [
            (NoAuthority(), 403, "no_authority"),
            (RoleRestricted(), 403, "no_authority"),
            (LastPartner(), 409, "last_partner"),
            (MemberNotFound(), 404, "member_not_found"),
        ],
    )
    def test_business_errors_map_to_http(self, client, service, error, status, code):
        service.revoke.return_value = MemberResult(error=error)

        response = client.post(f"/api/members/{MEMBER_ID}/revoke")

        assert response.status_code == status
        assert response.json() == {"detail": {"code": code, "message": error.message}}

    def test_a_malformed_id_is_an_invalid_request(self, client, service):
        response = client.post("/api/members/not-a-uuid/revoke")

        assert response.status_code == 422
        assert response.json()["detail"]["code"] == "invalid_request"
        service.revoke.assert_not_called()

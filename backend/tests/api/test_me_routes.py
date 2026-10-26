"""`GET /api/me`: who the authenticated request is (role and qualifications)."""

from backend.app.study.domain.context import Qualification, Role
from backend.app.study.domain.ports import Resolution
from backend.tests.api.auth_support import (
    a_member,
    client_with,
    dev_settings,
    members_service_mock,
    supabase_client,
)
from backend.tests.api.test_auth_modes import bearer


def test_dev_mode_answers_with_the_fictitious_user():
    client = client_with(dev_settings(dev_role="architect", dev_qualifications=["sponsor"]))

    response = client.get("/api/me")

    assert response.status_code == 200
    assert response.json() == {"role": "architect", "qualifications": ["sponsor"]}


def test_supabase_mode_answers_with_the_role_of_the_member_who_signed_in():
    member = a_member(
        role=Role.DIRECTOR,
        qualifications=frozenset({Qualification.SITE_MANAGEMENT, Qualification.LICENSED_SIGNATORY}),
    )
    client = supabase_client(Resolution(member, activated=False), members_service_mock())

    response = client.get("/api/me", headers=bearer(aal="aal2"))

    assert response.status_code == 200
    assert response.json() == {
        "role": "director",
        "qualifications": ["licensed_signatory", "site_management"],
    }


def test_supabase_mode_without_a_token_is_401():
    client = supabase_client(Resolution(a_member(), activated=False), members_service_mock())

    response = client.get("/api/me")

    assert response.status_code == 401
    assert response.json()["detail"]["code"] == "unauthenticated"


def test_a_partner_with_only_the_first_factor_is_asked_for_the_second():
    client = supabase_client(Resolution(a_member(role=Role.PARTNER), activated=False), None)

    response = client.get("/api/me", headers=bearer(aal="aal1"))

    assert response.status_code == 403
    assert response.json()["detail"]["code"] == "mfa_required"

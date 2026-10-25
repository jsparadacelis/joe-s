import pytest

from backend.app.lifecycle.domain.authority import has_authority
from backend.app.study.domain.context import RequestContext, Role
from backend.app.study.domain.mfa import AAL2, requires_mfa


@pytest.mark.parametrize("role", [Role.PARTNER, Role.DIRECTOR, Role.ADMINISTRATION])
def test_management_roles_require_two_factor(role):
    assert requires_mfa(role) is True


@pytest.mark.parametrize(
    "role",
    [Role.PROJECT_DIRECTOR, Role.TECHNICAL_LEAD, Role.ARCHITECT, Role.SITE_COLLABORATOR],
)
def test_other_roles_do_not_require_two_factor(role):
    assert requires_mfa(role) is False


def test_every_role_has_an_explicit_answer():
    assert {role for role in Role if requires_mfa(role)} == {
        Role.PARTNER,
        Role.DIRECTOR,
        Role.ADMINISTRATION,
    }


def test_the_required_assurance_level_is_aal2():
    assert AAL2 == "aal2"


def test_administration_role_is_a_valid_role_value():
    assert Role("administration") is Role.ADMINISTRATION


@pytest.mark.parametrize("authority", ["partner_director", "project_director"])
def test_administration_gains_no_promotion_authority(authority):
    context = RequestContext(study_id="demo-study", user_id="demo-user", role=Role.ADMINISTRATION)

    assert has_authority(authority, context) is False

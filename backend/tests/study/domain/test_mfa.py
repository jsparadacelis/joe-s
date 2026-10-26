import pytest

from backend.app.access.domain.actions import Action
from backend.app.access.domain.actor import PersonActor
from backend.app.access.domain.policy import can
from backend.app.access.domain.resource import ProjectResource
from backend.app.study.domain.context import Role
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


@pytest.mark.parametrize("phase", range(8))
def test_administration_gains_no_promotion_authority(phase):
    actor = PersonActor(study_id="demo-study", user_id="demo-user", study_role=Role.ADMINISTRATION)

    decision = can(actor, Action.PROMOTE, ProjectResource(project_id="project-1", phase=phase))

    assert decision.allowed is False

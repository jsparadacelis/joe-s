import pytest

from backend.app.study.domain.context import Qualification, Role
from backend.app.study.domain.invitation_policy import (
    can_grant_qualifications,
    manageable_roles,
)

RESTRICTED = {Role.PARTNER, Role.DIRECTOR, Role.ADMINISTRATION}


def test_a_partner_manages_every_role():
    assert manageable_roles(Role.PARTNER) == frozenset(Role)


def test_a_director_manages_only_the_non_management_roles():
    assert manageable_roles(Role.DIRECTOR) == frozenset(Role) - RESTRICTED
    assert manageable_roles(Role.DIRECTOR) == {
        Role.PROJECT_DIRECTOR,
        Role.TECHNICAL_LEAD,
        Role.ARCHITECT,
        Role.SITE_COLLABORATOR,
    }


@pytest.mark.parametrize(
    "role",
    [
        Role.ADMINISTRATION,
        Role.PROJECT_DIRECTOR,
        Role.TECHNICAL_LEAD,
        Role.ARCHITECT,
        Role.SITE_COLLABORATOR,
    ],
)
def test_nobody_else_manages_anyone(role):
    assert manageable_roles(role) == frozenset()


def test_only_a_partner_grants_qualifications():
    assert can_grant_qualifications(Role.PARTNER) is True
    assert not any(can_grant_qualifications(r) for r in Role if r is not Role.PARTNER)


def test_the_sensitive_qualifications_are_all_of_them():
    assert set(Qualification) == {
        Qualification.LICENSED_SIGNATORY,
        Qualification.SITE_MANAGEMENT,
        Qualification.SPONSOR,
    }

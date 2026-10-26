import pytest

from backend.app.access.domain.project_roles import ProjectRole
from backend.app.access.infrastructure.dev_project_roles import DevProjectRoles
from backend.app.study.domain.context import Qualification, RequestContext, Role


def a_context(role, qualifications=()):
    return RequestContext(
        study_id="demo-study",
        user_id="demo-user",
        role=role,
        qualifications=frozenset(qualifications),
    )


@pytest.mark.parametrize(
    ("role", "function"),
    [
        (Role.PROJECT_DIRECTOR, ProjectRole.PROJECT_DIRECTOR),
        (Role.TECHNICAL_LEAD, ProjectRole.TECHNICAL_LEAD),
        (Role.ARCHITECT, ProjectRole.ARCHITECT),
        (Role.SITE_COLLABORATOR, ProjectRole.SITE_COLLABORATOR),
    ],
)
def test_the_studio_role_gives_the_matching_function_in_every_project(role, function):
    assert DevProjectRoles(a_context(role)).roles_of("any-project", "demo-user") == {function}


@pytest.mark.parametrize("role", [Role.PARTNER, Role.DIRECTOR, Role.ADMINISTRATION])
def test_management_roles_have_no_project_function(role):
    assert DevProjectRoles(a_context(role)).roles_of("any-project", "demo-user") == frozenset()


def test_qualifications_give_the_signing_functions():
    context = a_context(Role.ARCHITECT, list(Qualification))

    assert DevProjectRoles(context).roles_of("any-project", "demo-user") == {
        ProjectRole.ARCHITECT,
        ProjectRole.LICENSED_SIGNATORY,
        ProjectRole.SITE_MANAGEMENT,
        ProjectRole.SPONSOR,
    }

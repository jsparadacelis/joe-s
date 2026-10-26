import pytest

from backend.app.access.application.guard import require
from backend.app.access.domain.actions import Action
from backend.app.access.domain.errors import NotPermitted
from backend.app.study.domain.context import RequestContext, Role


def a_context(role):
    return RequestContext(study_id="demo-study", user_id="demo-user", role=role)


@pytest.mark.parametrize("action", [Action.SCORE, Action.EDIT_SETTINGS])
@pytest.mark.parametrize("role", [Role.PARTNER, Role.DIRECTOR])
def test_management_may_score_and_edit_settings(action, role):
    require(a_context(role), action)


@pytest.mark.parametrize("action", [Action.SCORE, Action.EDIT_SETTINGS])
@pytest.mark.parametrize(
    "role",
    [
        Role.PROJECT_DIRECTOR,
        Role.TECHNICAL_LEAD,
        Role.ARCHITECT,
        Role.SITE_COLLABORATOR,
        Role.ADMINISTRATION,
    ],
)
def test_other_roles_may_not(action, role):
    with pytest.raises(NotPermitted) as raised:
        require(a_context(role), action)

    assert raised.value.code == "no_authority"


@pytest.mark.parametrize("role", [Role.PARTNER, Role.DIRECTOR, Role.PROJECT_DIRECTOR])
def test_creating_an_opportunity_also_allows_the_project_director(role):
    require(a_context(role), Action.CREATE_OPPORTUNITY)


@pytest.mark.parametrize("role", [Role.ARCHITECT, Role.TECHNICAL_LEAD, Role.ADMINISTRATION])
def test_creating_an_opportunity_is_refused_to_the_rest(role):
    with pytest.raises(NotPermitted):
        require(a_context(role), Action.CREATE_OPPORTUNITY)


def test_each_action_has_its_own_spanish_message():
    messages = set()
    for action in (Action.SCORE, Action.EDIT_SETTINGS, Action.CREATE_OPPORTUNITY):
        with pytest.raises(NotPermitted) as raised:
            require(a_context(Role.ARCHITECT), action)
        messages.add(raised.value.message)

    assert len(messages) == 3
    assert all(m.startswith("Solo ") for m in messages)

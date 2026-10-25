import dataclasses

import pytest

from backend.app.study.domain.context import RequestContext, Role


def a_context(**overrides):
    values = {"study_id": "demo-study", "user_id": "demo-user", "role": Role.PARTNER}
    return RequestContext(**{**values, **overrides})


class TestRequestContext:
    def test_keeps_study_user_and_role(self):
        context = a_context()

        assert (context.study_id, context.user_id, context.role) == (
            "demo-study",
            "demo-user",
            Role.PARTNER,
        )

    @pytest.mark.parametrize("field", ["study_id", "user_id"])
    @pytest.mark.parametrize("blank", ["", "   "])
    def test_rejects_blank_identifiers(self, field, blank):
        with pytest.raises(ValueError):
            a_context(**{field: blank})

    def test_is_immutable(self):
        context = a_context()

        with pytest.raises(dataclasses.FrozenInstanceError):
            context.study_id = "otro"


def test_roles_are_the_prd_roles():
    assert {r.value for r in Role} == {
        "partner",
        "director",
        "project_director",
        "technical_lead",
        "architect",
        "site_collaborator",
        "administration",
    }

import pytest

from backend.app.lifecycle.domain.authority import has_authority, who_can
from backend.app.study.domain.context import Qualification, RequestContext, Role


def a_context(role=Role.ARCHITECT, qualifications=()):
    return RequestContext(
        study_id="demo-study",
        user_id="demo-user",
        role=role,
        qualifications=frozenset(qualifications),
    )


class TestHasAuthority:
    @pytest.mark.parametrize("role", [Role.PARTNER, Role.DIRECTOR])
    def test_partner_and_director_hold_partner_director(self, role):
        assert has_authority("partner_director", a_context(role)) is True

    @pytest.mark.parametrize(
        "role",
        [Role.PROJECT_DIRECTOR, Role.TECHNICAL_LEAD, Role.ARCHITECT, Role.SITE_COLLABORATOR],
    )
    def test_other_roles_do_not_hold_partner_director(self, role):
        assert has_authority("partner_director", a_context(role)) is False

    def test_project_director_holds_project_director(self):
        assert has_authority("project_director", a_context(Role.PROJECT_DIRECTOR)) is True

    def test_partner_does_not_hold_project_director(self):
        assert has_authority("project_director", a_context(Role.PARTNER)) is False

    @pytest.mark.parametrize(
        ("authority", "qualification"),
        [
            ("licensed_signatory", Qualification.LICENSED_SIGNATORY),
            ("site_management", Qualification.SITE_MANAGEMENT),
            ("sponsor", Qualification.SPONSOR),
        ],
    )
    def test_qualified_authorities_need_the_matching_qualification(self, authority, qualification):
        assert has_authority(authority, a_context(qualifications=[qualification])) is True
        assert has_authority(authority, a_context(Role.PARTNER)) is False

    def test_a_qualification_does_not_grant_another_authority(self):
        context = a_context(qualifications=[Qualification.SPONSOR])

        assert has_authority("licensed_signatory", context) is False

    def test_unknown_authority_is_never_granted(self):
        assert has_authority("inventada", a_context(Role.PARTNER)) is False


class TestWhoCan:
    @pytest.mark.parametrize(
        ("authority", "labels"),
        [
            ("partner_director", ["Socio", "Director"]),
            ("project_director", ["Director de proyecto"]),
            ("licensed_signatory", ["Firmante habilitado"]),
            ("site_management", ["Dirección facultativa"]),
            ("sponsor", ["Sponsor"]),
        ],
    )
    def test_names_who_can_act_in_spanish(self, authority, labels):
        assert who_can(authority) == labels

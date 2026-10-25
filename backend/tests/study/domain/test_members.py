import dataclasses

import pytest

from backend.app.study.domain.context import Qualification, RequestContext, Role
from backend.app.study.domain.errors import InvalidEmail
from backend.app.study.domain.members import Member, MemberStatus, normalize_email


def a_member(**overrides):
    values = {
        "id": "member-1",
        "study_id": "demo-study",
        "email": "ana@example.com",
        "role": Role.ARCHITECT,
        "status": MemberStatus.INVITED,
    }
    return Member(**{**values, **overrides})


class TestMemberStatus:
    def test_statuses_are_the_three_of_the_invitation_lifecycle(self):
        assert {s.value for s in MemberStatus} == {"invited", "active", "revoked"}


class TestMember:
    def test_defaults_to_no_qualifications_and_no_linked_user(self):
        member = a_member()

        assert member.qualifications == frozenset()
        assert member.user_id is None

    def test_is_immutable(self):
        with pytest.raises(dataclasses.FrozenInstanceError):
            a_member().status = MemberStatus.ACTIVE

    @pytest.mark.parametrize("field", ["id", "study_id", "email"])
    @pytest.mark.parametrize("blank", ["", "   "])
    def test_rejects_blank_identifiers(self, field, blank):
        with pytest.raises(ValueError):
            a_member(**{field: blank})

    def test_rejects_an_email_that_is_not_normalized(self):
        with pytest.raises(ValueError):
            a_member(email="Ana@Example.com")

    def test_only_invited_and_active_members_may_enter(self):
        assert a_member(status=MemberStatus.INVITED).may_enter is True
        assert a_member(status=MemberStatus.ACTIVE).may_enter is True
        assert a_member(status=MemberStatus.REVOKED).may_enter is False

    def test_builds_the_request_context_from_the_row_and_the_token_subject(self):
        member = a_member(
            role=Role.PROJECT_DIRECTOR, qualifications=frozenset({Qualification.SPONSOR})
        )

        context = member.context_for("subject-1")

        assert context == RequestContext(
            study_id="demo-study",
            user_id="subject-1",
            role=Role.PROJECT_DIRECTOR,
            qualifications=frozenset({Qualification.SPONSOR}),
        )


class TestNormalizeEmail:
    def test_lowercases_and_trims(self):
        assert normalize_email("  Ana.Perez@Example.COM ") == "ana.perez@example.com"

    @pytest.mark.parametrize("raw", ["", "   ", "no-at-sign", "@example.com", "ana@", "a b@c.com"])
    def test_rejects_something_that_is_not_an_email(self, raw):
        with pytest.raises(InvalidEmail):
            normalize_email(raw)


class TestEmailStorability:
    @pytest.mark.parametrize(
        "raw", ["a\x00b@example.com", "ana@exam\x00ple.com", "a\ud800@example.com", "\x00"]
    )
    def test_rejects_nul_and_lone_surrogates(self, raw):
        with pytest.raises(InvalidEmail):
            normalize_email(raw)

    def test_accepts_the_maximum_length_of_254(self):
        email = "a" * 242 + "@example.com"

        assert len(email) == 254
        assert normalize_email(email) == email

    def test_rejects_more_than_254_characters(self):
        with pytest.raises(InvalidEmail):
            normalize_email("a" * 243 + "@example.com")

    def test_accepts_non_ascii_letters(self):
        assert normalize_email("Ñandú@Example.com") == "ñandú@example.com"

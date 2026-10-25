from unittest.mock import create_autospec

import pytest

from backend.app.audit.domain.event import Outcome
from backend.app.audit.domain.ports import AuditLog
from backend.app.study.application.authenticate import Authenticate
from backend.app.study.domain.context import Qualification, RequestContext, Role
from backend.app.study.domain.errors import (
    EmailNotVerified,
    MemberRevoked,
    MfaRequired,
    NotInvited,
    Unauthenticated,
)
from backend.app.study.domain.members import Member, MemberStatus
from backend.app.study.domain.ports import (
    MemberResolver,
    Resolution,
    TokenClaims,
    TokenVerifier,
)

STUDY = "00000000-0000-0000-0000-00000000a001"


def claims(**overrides):
    values = {
        "subject": "subject-1",
        "email": "ana@example.com",
        "email_verified": True,
        "aal": "aal1",
    }
    return TokenClaims(**{**values, **overrides})


def a_member(**overrides):
    values = {
        "id": "member-1",
        "study_id": STUDY,
        "email": "ana@example.com",
        "role": Role.ARCHITECT,
        "status": MemberStatus.ACTIVE,
        "user_id": "subject-1",
    }
    return Member(**{**values, **overrides})


@pytest.fixture
def verifier():
    mock = create_autospec(TokenVerifier, spec_set=True, instance=True)
    mock.verify.return_value = claims()
    return mock


@pytest.fixture
def resolver():
    mock = create_autospec(MemberResolver, spec_set=True, instance=True)
    mock.resolve.return_value = Resolution(a_member(), activated=False)
    return mock


@pytest.fixture
def audit_log():
    return create_autospec(AuditLog, spec_set=True, instance=True)


@pytest.fixture
def authenticate(verifier, resolver, audit_log):
    return Authenticate(verifier, resolver, audit_log)


class TestValidToken:
    def test_builds_the_context_with_study_role_and_qualifications(
        self, authenticate, resolver, verifier
    ):
        resolver.resolve.return_value = Resolution(
            a_member(
                role=Role.PROJECT_DIRECTOR,
                qualifications=frozenset({Qualification.SPONSOR}),
            ),
            activated=False,
        )

        context = authenticate.execute("the-token")

        verifier.verify.assert_called_once_with("the-token")
        assert context == RequestContext(
            study_id=STUDY,
            user_id="subject-1",
            role=Role.PROJECT_DIRECTOR,
            qualifications=frozenset({Qualification.SPONSOR}),
        )

    def test_looks_the_member_up_by_normalized_email_and_subject(
        self, authenticate, resolver, verifier
    ):
        verifier.verify.return_value = claims(email="  Ana@Example.COM ")

        authenticate.execute("the-token")

        resolver.resolve.assert_called_once_with("ana@example.com", "subject-1")

    def test_an_already_active_member_leaves_no_audit_trace(self, authenticate, audit_log):
        authenticate.execute("the-token")

        audit_log.record.assert_not_called()


class TestFirstEntry:
    def test_a_pending_invitation_that_got_activated_is_audited(
        self, authenticate, resolver, audit_log
    ):
        resolver.resolve.return_value = Resolution(
            a_member(status=MemberStatus.ACTIVE), activated=True
        )

        context = authenticate.execute("the-token")

        audit_log.record.assert_called_once()
        event = audit_log.record.call_args.args[0]
        assert (event.study_id, event.user_id, event.entity, event.entity_id) == (
            STUDY,
            "subject-1",
            "member",
            "member-1",
        )
        assert event.action == "activate"
        assert event.old_value == {"status": "invited"}
        assert event.new_value == {"status": "active", "user_id": "subject-1"}
        assert event.outcome is Outcome.OK
        assert context.study_id == STUDY


class TestRejections:
    def test_an_invalid_token_is_rejected_before_touching_the_database(
        self, authenticate, verifier, resolver
    ):
        verifier.verify.side_effect = Unauthenticated()

        with pytest.raises(Unauthenticated):
            authenticate.execute("bad")

        resolver.resolve.assert_not_called()

    def test_an_unverified_email_is_rejected_before_the_lookup(
        self, authenticate, verifier, resolver
    ):
        verifier.verify.return_value = claims(email_verified=False)

        with pytest.raises(EmailNotVerified):
            authenticate.execute("the-token")

        resolver.resolve.assert_not_called()

    def test_no_invitation_means_not_invited(self, authenticate, resolver, audit_log):
        resolver.resolve.return_value = None

        with pytest.raises(NotInvited):
            authenticate.execute("the-token")

        audit_log.record.assert_not_called()

    def test_a_revoked_member_is_rejected(self, authenticate, resolver):
        resolver.resolve.return_value = Resolution(
            a_member(status=MemberStatus.REVOKED), activated=False
        )

        with pytest.raises(MemberRevoked):
            authenticate.execute("the-token")

    def test_a_revoked_member_is_rejected_even_with_aal2(self, authenticate, resolver, verifier):
        verifier.verify.return_value = claims(aal="aal2")
        resolver.resolve.return_value = Resolution(
            a_member(role=Role.PARTNER, status=MemberStatus.REVOKED), activated=False
        )

        with pytest.raises(MemberRevoked):
            authenticate.execute("the-token")


class TestTwoFactor:
    @pytest.mark.parametrize("role", [Role.PARTNER, Role.DIRECTOR, Role.ADMINISTRATION])
    def test_roles_with_two_factor_are_rejected_with_aal1(
        self, authenticate, resolver, verifier, role
    ):
        verifier.verify.return_value = claims(aal="aal1")
        resolver.resolve.return_value = Resolution(a_member(role=role), activated=False)

        with pytest.raises(MfaRequired):
            authenticate.execute("the-token")

    @pytest.mark.parametrize("role", [Role.PARTNER, Role.DIRECTOR, Role.ADMINISTRATION])
    def test_roles_with_two_factor_enter_with_aal2(self, authenticate, resolver, verifier, role):
        verifier.verify.return_value = claims(aal="aal2")
        resolver.resolve.return_value = Resolution(a_member(role=role), activated=False)

        context = authenticate.execute("the-token")

        assert context.role is role

    @pytest.mark.parametrize("aal", ["aal1", "", "AAL2", "aal3"])
    def test_only_the_exact_aal2_level_counts(self, authenticate, resolver, verifier, aal):
        verifier.verify.return_value = claims(aal=aal)
        resolver.resolve.return_value = Resolution(a_member(role=Role.PARTNER), activated=False)

        with pytest.raises(MfaRequired):
            authenticate.execute("the-token")

    @pytest.mark.parametrize(
        "role",
        [Role.PROJECT_DIRECTOR, Role.TECHNICAL_LEAD, Role.ARCHITECT, Role.SITE_COLLABORATOR],
    )
    def test_the_other_roles_enter_with_aal1(self, authenticate, resolver, role):
        resolver.resolve.return_value = Resolution(a_member(role=role), activated=False)

        context = authenticate.execute("the-token")

        assert context.role is role

from unittest.mock import create_autospec

import pytest

from backend.app.audit.domain.event import Outcome
from backend.app.audit.domain.ports import AuditLog
from backend.app.study.application.manage_members import ManageMembers
from backend.app.study.domain.context import Qualification, RequestContext, Role
from backend.app.study.domain.errors import (
    InvalidEmail,
    LastPartner,
    MemberAlreadyExists,
    MemberNotFound,
    NoAuthority,
    QualificationsRestricted,
    RoleRestricted,
)
from backend.app.study.domain.members import Member, MemberStatus
from backend.app.study.domain.ports import Members

STUDY = "00000000-0000-0000-0000-00000000a001"


def a_context(role=Role.PARTNER):
    return RequestContext(study_id=STUDY, user_id="subject-9", role=role)


def a_member(**overrides):
    values = {
        "id": "member-1",
        "study_id": STUDY,
        "email": "ana@example.com",
        "role": Role.ARCHITECT,
        "status": MemberStatus.INVITED,
    }
    return Member(**{**values, **overrides})


@pytest.fixture
def members():
    mock = create_autospec(Members, spec_set=True, instance=True)
    mock.find_by_email.return_value = None
    mock.add.side_effect = lambda **kw: a_member(
        email=kw["email"], role=kw["role"], qualifications=kw["qualifications"]
    )
    return mock


@pytest.fixture
def audit_log():
    return create_autospec(AuditLog, spec_set=True, instance=True)


@pytest.fixture
def service(members, audit_log):
    return ManageMembers(members, audit_log)


def last_event(audit_log):
    return audit_log.record.call_args.args[0]


class TestInvite:
    @pytest.mark.parametrize("role", [Role.PARTNER, Role.DIRECTOR])
    def test_partner_and_director_can_invite(self, service, members, role):
        result = service.invite(a_context(role), "ana@example.com", Role.ARCHITECT)

        assert result.error is None
        assert result.member.status is MemberStatus.INVITED
        members.add.assert_called_once_with(
            study_id=STUDY,
            email="ana@example.com",
            role=Role.ARCHITECT,
            qualifications=frozenset(),
            invited_by="subject-9",
        )

    def test_the_email_is_stored_in_lowercase(self, service, members):
        service.invite(a_context(), "  Ana.Perez@Example.COM ", Role.ARCHITECT)

        assert members.add.call_args.kwargs["email"] == "ana.perez@example.com"
        members.find_by_email.assert_called_once_with("ana.perez@example.com")

    def test_qualifications_are_kept(self, service, members):
        service.invite(
            a_context(),
            "ana@example.com",
            Role.PROJECT_DIRECTOR,
            frozenset({Qualification.LICENSED_SIGNATORY}),
        )

        assert members.add.call_args.kwargs["qualifications"] == frozenset(
            {Qualification.LICENSED_SIGNATORY}
        )

    def test_the_invitation_is_audited(self, service, audit_log):
        service.invite(a_context(), "ana@example.com", Role.ARCHITECT)

        event = last_event(audit_log)
        assert (event.study_id, event.user_id, event.entity, event.entity_id, event.action) == (
            STUDY,
            "subject-9",
            "member",
            "member-1",
            "invite",
        )
        assert event.new_value == {
            "email": "ana@example.com",
            "role": "architect",
            "qualifications": [],
        }
        assert event.outcome is Outcome.OK

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
    def test_without_authority_it_is_refused_and_the_refusal_audited(
        self, service, members, audit_log, role
    ):
        result = service.invite(a_context(role), "Ana@Example.com", Role.ARCHITECT)

        assert result.member is None
        assert isinstance(result.error, NoAuthority)
        members.add.assert_not_called()
        event = last_event(audit_log)
        assert (event.entity, event.entity_id, event.action) == (
            "member",
            "invitation",
            "invite",
        )
        assert event.outcome is Outcome.REJECTED
        assert event.user_id == "subject-9"

    def test_a_duplicate_email_is_refused_without_adding(self, service, members, audit_log):
        members.find_by_email.return_value = a_member(status=MemberStatus.ACTIVE)

        result = service.invite(a_context(), "ANA@example.com", Role.ARCHITECT)

        assert isinstance(result.error, MemberAlreadyExists)
        members.add.assert_not_called()
        audit_log.record.assert_not_called()

    def test_a_revoked_member_cannot_be_invited_again_by_this_flow(self, service, members):
        members.find_by_email.return_value = a_member(status=MemberStatus.REVOKED)

        result = service.invite(a_context(), "ana@example.com", Role.ARCHITECT)

        assert isinstance(result.error, MemberAlreadyExists)

    def test_the_adapter_reporting_a_duplicate_is_also_a_refusal(self, service, members):
        members.add.side_effect = MemberAlreadyExists()

        result = service.invite(a_context(), "ana@example.com", Role.ARCHITECT)

        assert isinstance(result.error, MemberAlreadyExists)

    def test_an_invalid_email_is_refused(self, service, members, audit_log):
        result = service.invite(a_context(), "not-an-email", Role.ARCHITECT)

        assert isinstance(result.error, InvalidEmail)
        members.add.assert_not_called()
        audit_log.record.assert_not_called()

    def test_authority_is_checked_before_the_email(self, service):
        result = service.invite(a_context(Role.ARCHITECT), "not-an-email", Role.ARCHITECT)

        assert isinstance(result.error, NoAuthority)


class TestRoleEscalation:
    @pytest.mark.parametrize("target", [Role.PARTNER, Role.DIRECTOR, Role.ADMINISTRATION])
    def test_a_director_cannot_invite_management_roles_and_it_is_audited(
        self, service, members, audit_log, target
    ):
        result = service.invite(a_context(Role.DIRECTOR), "ana@example.com", target)

        assert isinstance(result.error, RoleRestricted)
        members.add.assert_not_called()
        event = last_event(audit_log)
        assert (event.action, event.outcome, event.entity_id) == (
            "invite",
            Outcome.REJECTED,
            "invitation",
        )

    @pytest.mark.parametrize(
        "target",
        [Role.PROJECT_DIRECTOR, Role.TECHNICAL_LEAD, Role.ARCHITECT, Role.SITE_COLLABORATOR],
    )
    def test_a_director_can_invite_the_other_roles(self, service, members, target):
        result = service.invite(a_context(Role.DIRECTOR), "ana@example.com", target)

        assert result.error is None
        members.add.assert_called_once()

    @pytest.mark.parametrize("target", [Role.PARTNER, Role.DIRECTOR, Role.ADMINISTRATION])
    def test_a_partner_can_invite_management_roles(self, service, target):
        assert service.invite(a_context(Role.PARTNER), "ana@example.com", target).error is None

    @pytest.mark.parametrize("qualification", list(Qualification))
    def test_a_director_cannot_grant_any_qualification(
        self, service, members, audit_log, qualification
    ):
        result = service.invite(
            a_context(Role.DIRECTOR),
            "ana@example.com",
            Role.PROJECT_DIRECTOR,
            frozenset({qualification}),
        )

        assert isinstance(result.error, QualificationsRestricted)
        members.add.assert_not_called()
        assert last_event(audit_log).outcome is Outcome.REJECTED

    @pytest.mark.parametrize("qualification", list(Qualification))
    def test_a_partner_can_grant_qualifications(self, service, qualification):
        result = service.invite(
            a_context(Role.PARTNER),
            "ana@example.com",
            Role.PROJECT_DIRECTOR,
            frozenset({qualification}),
        )

        assert result.error is None

    def test_a_director_cannot_revoke_a_management_member(self, service, members, audit_log):
        members.get.return_value = a_member(role=Role.PARTNER, status=MemberStatus.ACTIVE)

        result = service.revoke(a_context(Role.DIRECTOR), "member-1")

        assert isinstance(result.error, RoleRestricted)
        members.revoke.assert_not_called()
        event = last_event(audit_log)
        assert (event.action, event.outcome, event.entity_id) == (
            "revoke",
            Outcome.REJECTED,
            "member-1",
        )

    def test_a_director_can_revoke_an_architect(self, service, members):
        members.get.return_value = a_member(role=Role.ARCHITECT, status=MemberStatus.ACTIVE)
        members.revoke.return_value = a_member(status=MemberStatus.REVOKED)

        assert service.revoke(a_context(Role.DIRECTOR), "member-1").error is None


class TestLastPartner:
    def partners(self, *ids):
        return [
            a_member(id=i, email=f"{i}@example.com", role=Role.PARTNER, status=MemberStatus.ACTIVE)
            for i in ids
        ]

    def test_the_last_active_partner_cannot_be_revoked_and_it_is_audited(
        self, service, members, audit_log
    ):
        target = self.partners("p1")[0]
        members.get.return_value = target
        members.lock_active_partners.return_value = [target]

        result = service.revoke(a_context(Role.PARTNER), "p1")

        assert isinstance(result.error, LastPartner)
        members.revoke.assert_not_called()
        event = last_event(audit_log)
        assert (event.action, event.outcome, event.entity_id) == (
            "revoke",
            Outcome.REJECTED,
            "p1",
        )

    def test_a_partner_cannot_revoke_themselves_if_they_are_the_last(self, service, members):
        target = self.partners("p1")[0]
        members.get.return_value = target
        members.lock_active_partners.return_value = [target]

        result = service.revoke(a_context(Role.PARTNER), "p1")

        assert isinstance(result.error, LastPartner)

    def test_a_partner_can_be_revoked_when_another_is_active(self, service, members):
        p1, p2 = self.partners("p1", "p2")
        members.get.return_value = p1
        members.lock_active_partners.return_value = [p1, p2]
        members.revoke.return_value = a_member(status=MemberStatus.REVOKED)

        result = service.revoke(a_context(Role.PARTNER), "p1")

        assert result.error is None
        members.revoke.assert_called_once_with("p1")

    def test_a_pending_partner_invitation_can_be_revoked_even_if_no_partner_is_active(
        self, service, members
    ):
        pending = a_member(id="p9", role=Role.PARTNER, status=MemberStatus.INVITED)
        members.get.return_value = pending
        members.revoke.return_value = a_member(status=MemberStatus.REVOKED)

        assert service.revoke(a_context(Role.PARTNER), "p9").error is None
        members.lock_active_partners.assert_not_called()

    def test_non_partners_do_not_take_the_partner_lock(self, service, members):
        members.get.return_value = a_member(role=Role.ARCHITECT, status=MemberStatus.ACTIVE)
        members.revoke.return_value = a_member(status=MemberStatus.REVOKED)

        service.revoke(a_context(Role.PARTNER), "member-1")

        members.lock_active_partners.assert_not_called()

    def test_a_partner_revoked_meanwhile_by_someone_else_is_a_no_op(
        self, service, members, audit_log
    ):
        p1, p2 = self.partners("p1", "p2")
        members.get.side_effect = [
            p1,
            a_member(id="p1", role=Role.PARTNER, status=MemberStatus.REVOKED),
        ]
        members.lock_active_partners.return_value = [p2]

        result = service.revoke(a_context(Role.PARTNER), "p1")

        assert result.error is None
        assert result.member.status is MemberStatus.REVOKED
        members.revoke.assert_not_called()
        audit_log.record.assert_not_called()


class TestRejectedInvitationAudit:
    def test_stores_the_requested_role_and_the_reason_never_the_email(self, service, audit_log):
        service.invite(a_context(Role.ARCHITECT), "Eve.Secret@Example.com", Role.PARTNER)

        event = last_event(audit_log)
        assert event.entity_id == "invitation"
        assert event.new_value == {"role": "partner", "error": "no_authority"}
        assert "secret" not in repr(event).lower()

    def test_an_escalation_refusal_records_the_same_shape(self, service, audit_log):
        service.invite(a_context(Role.DIRECTOR), "eve@example.com", Role.PARTNER)

        assert last_event(audit_log).new_value == {"role": "partner", "error": "no_authority"}

    def test_a_revoke_refusal_records_the_reason(self, service, audit_log):
        service.revoke(a_context(Role.ARCHITECT), "member-1")

        assert last_event(audit_log).new_value == {"error": "no_authority"}

    def test_the_last_partner_refusal_records_the_reason(self, service, members, audit_log):
        target = a_member(role=Role.PARTNER, status=MemberStatus.ACTIVE)
        members.get.return_value = target
        members.lock_active_partners.return_value = [target]

        service.revoke(a_context(Role.PARTNER), "member-1")

        assert last_event(audit_log).new_value == {"error": "last_partner"}

    @pytest.mark.parametrize("email", ["a\x00b@example.com", "a\ud800@example.com", "x" * 300])
    def test_authority_is_checked_before_the_email_is_looked_at(
        self, service, members, audit_log, email
    ):
        result = service.invite(a_context(Role.ARCHITECT), email, Role.ARCHITECT)

        assert isinstance(result.error, NoAuthority)
        members.find_by_email.assert_not_called()
        event = last_event(audit_log)
        assert event.entity_id == "invitation"
        assert "\x00" not in repr(event)

    @pytest.mark.parametrize("email", ["a\x00b@example.com", "a\ud800@example.com", "x" * 300])
    def test_an_unstorable_or_too_long_email_with_authority_is_invalid(
        self, service, members, audit_log, email
    ):
        result = service.invite(a_context(Role.PARTNER), email, Role.ARCHITECT)

        assert isinstance(result.error, InvalidEmail)
        members.find_by_email.assert_not_called()
        audit_log.record.assert_not_called()


class TestRevoke:
    def test_revokes_and_audits(self, service, members, audit_log):
        members.get.return_value = a_member(status=MemberStatus.ACTIVE)
        members.revoke.return_value = a_member(status=MemberStatus.REVOKED)

        result = service.revoke(a_context(Role.DIRECTOR), "member-1")

        assert result.error is None
        assert result.member.status is MemberStatus.REVOKED
        members.revoke.assert_called_once_with("member-1")
        event = last_event(audit_log)
        assert (event.entity, event.entity_id, event.action) == ("member", "member-1", "revoke")
        assert event.old_value == {"status": "active"}
        assert event.new_value == {"status": "revoked"}
        assert event.outcome is Outcome.OK

    def test_without_authority_it_is_refused_and_audited(self, service, members, audit_log):
        result = service.revoke(a_context(Role.ARCHITECT), "member-1")

        assert isinstance(result.error, NoAuthority)
        members.revoke.assert_not_called()
        event = last_event(audit_log)
        assert (event.entity_id, event.action, event.outcome) == (
            "member-1",
            "revoke",
            Outcome.REJECTED,
        )

    def test_an_unknown_member_is_not_found(self, service, members, audit_log):
        members.get.return_value = None

        result = service.revoke(a_context(), "member-1")

        assert isinstance(result.error, MemberNotFound)
        members.revoke.assert_not_called()
        audit_log.record.assert_not_called()

    def test_revoking_twice_is_a_no_op_without_new_audit(self, service, members, audit_log):
        members.get.return_value = a_member(status=MemberStatus.REVOKED)

        result = service.revoke(a_context(), "member-1")

        assert result.error is None
        assert result.member.status is MemberStatus.REVOKED
        members.revoke.assert_not_called()
        audit_log.record.assert_not_called()

    def test_a_pending_invitation_can_be_revoked(self, service, members, audit_log):
        members.get.return_value = a_member(status=MemberStatus.INVITED)
        members.revoke.return_value = a_member(status=MemberStatus.REVOKED)

        service.revoke(a_context(), "member-1")

        assert last_event(audit_log).old_value == {"status": "invited"}


class TestList:
    @pytest.mark.parametrize("role", list(Role))
    def test_any_member_of_the_study_can_list_it(self, service, members, role):
        members.list.return_value = [a_member(), a_member(id="member-2", email="b@example.com")]

        listed = service.list_members(a_context(role))

        assert [m.id for m in listed] == ["member-1", "member-2"]

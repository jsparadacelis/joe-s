"""Invite, list and revoke study members. Refusals are returned (not raised) so the
transaction commits and a refused attempt stays in the audit log."""

from __future__ import annotations

from dataclasses import dataclass

from backend.app.audit.application.record import audit
from backend.app.audit.domain.event import Outcome
from backend.app.audit.domain.ports import AuditLog
from backend.app.study.domain.context import Qualification, RequestContext, Role
from backend.app.study.domain.errors import (
    LastPartner,
    MemberAlreadyExists,
    MemberNotFound,
    NoAuthority,
    QualificationsRestricted,
    RoleRestricted,
    StudyError,
)
from backend.app.study.domain.invitation_policy import (
    can_grant_qualifications,
    manageable_roles,
)
from backend.app.study.domain.members import Member, MemberStatus, normalize_email
from backend.app.study.domain.ports import Members

INVITATION = "invitation"  # fixed audit entity id of a refused invitation
_CAN_MANAGE = frozenset({Role.PARTNER, Role.DIRECTOR})


@dataclass(frozen=True)
class MemberResult:
    member: Member | None = None
    error: StudyError | None = None


class ManageMembers:
    def __init__(self, members: Members, audit_log: AuditLog) -> None:
        self._members = members
        self._audit_log = audit_log

    def invite(
        self,
        context: RequestContext,
        email: str,
        role: Role,
        qualifications: frozenset[Qualification] = frozenset(),
    ) -> MemberResult:
        # Refusals never look at, or store, the raw email: it may be invalid or private.
        asked = {"role": role.value}
        if context.role not in _CAN_MANAGE:
            return self._reject(context, INVITATION, "invite", NoAuthority(), asked)
        if role not in manageable_roles(context.role):
            return self._reject(context, INVITATION, "invite", RoleRestricted(), asked)
        if qualifications and not can_grant_qualifications(context.role):
            return self._reject(context, INVITATION, "invite", QualificationsRestricted(), asked)
        try:
            normalized = normalize_email(email)
        except StudyError as error:
            return MemberResult(error=error)
        if self._members.find_by_email(normalized) is not None:
            return MemberResult(error=MemberAlreadyExists())
        try:
            member = self._members.add(
                study_id=context.study_id,
                email=normalized,
                role=role,
                qualifications=qualifications,
                invited_by=context.user_id,
            )
        except MemberAlreadyExists as error:
            return MemberResult(error=error)
        audit(
            self._audit_log,
            context,
            entity="member",
            entity_id=member.id,
            action="invite",
            new_value={
                "email": member.email,
                "role": member.role.value,
                "qualifications": sorted(q.value for q in member.qualifications),
            },
        )
        return MemberResult(member=member)

    def revoke(self, context: RequestContext, member_id: str) -> MemberResult:
        if context.role not in _CAN_MANAGE:
            return self._reject(context, member_id, "revoke", NoAuthority())
        member = self._members.get(member_id)
        if member is None:
            return MemberResult(error=MemberNotFound())
        if member.status is MemberStatus.REVOKED:
            return MemberResult(member=member)
        if member.role not in manageable_roles(context.role):
            return self._reject(context, member_id, "revoke", RoleRestricted())
        if member.role is Role.PARTNER and member.status is MemberStatus.ACTIVE:
            # Lock the partners first: a concurrent revocation waits here and then sees the
            # result of this one, so the study never ends up without an active partner.
            active = self._members.lock_active_partners()
            current = self._members.get(member_id)
            if current is None:
                return MemberResult(error=MemberNotFound())
            if current.status is MemberStatus.REVOKED:
                return MemberResult(member=current)
            if len(active) <= 1:
                return self._reject(context, member_id, "revoke", LastPartner())
        revoked = self._members.revoke(member_id)
        if revoked is None:
            return MemberResult(error=MemberNotFound())
        audit(
            self._audit_log,
            context,
            entity="member",
            entity_id=member_id,
            action="revoke",
            old_value={"status": member.status.value},
            new_value={"status": MemberStatus.REVOKED.value},
        )
        return MemberResult(member=revoked)

    def list_members(self, context: RequestContext) -> list[Member]:
        return self._members.list()

    def _reject(
        self,
        context: RequestContext,
        entity_id: str,
        action: str,
        error: StudyError,
        asked: dict | None = None,
    ) -> MemberResult:
        audit(
            self._audit_log,
            context,
            entity="member",
            entity_id=entity_id,
            action=action,
            new_value={**(asked or {}), "error": error.code},
            outcome=Outcome.REJECTED,
        )
        return MemberResult(error=error)

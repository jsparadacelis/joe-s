"""Authenticate: access token -> request context of an invited member."""

from __future__ import annotations

from backend.app.audit.application.record import audit
from backend.app.audit.domain.ports import AuditLog
from backend.app.study.domain.context import RequestContext
from backend.app.study.domain.errors import (
    EmailNotVerified,
    MemberRevoked,
    MfaRequired,
    NotInvited,
)
from backend.app.study.domain.members import MemberStatus, normalize_email
from backend.app.study.domain.mfa import AAL2, requires_mfa
from backend.app.study.domain.ports import MemberResolver, TokenClaims, TokenVerifier


def check_token(verifier: TokenVerifier, token: str) -> TokenClaims:
    """Everything that can be decided without the database. Callers run it before opening a
    connection, so garbage tokens cost none."""
    claims = verifier.verify(token)
    if not claims.email_verified:
        raise EmailNotVerified()
    return claims


class Authenticate:
    def __init__(
        self, verifier: TokenVerifier, resolver: MemberResolver, audit_log: AuditLog
    ) -> None:
        self._verifier = verifier
        self._resolver = resolver
        self._audit_log = audit_log

    def execute(self, token: str) -> RequestContext:
        """Raise a `StudyError` when the person may not enter. The caller's transaction rolls
        back on a raise, so a rejected sign-in leaves no half-activated invitation."""
        return self.admit(check_token(self._verifier, token))

    def admit(self, claims: TokenClaims) -> RequestContext:
        """Second half: claims already checked by `check_token`, now the member lookup."""
        resolution = self._resolver.resolve(normalize_email(claims.email), claims.subject)
        if resolution is None:
            raise NotInvited()
        member = resolution.member
        if member.status is MemberStatus.REVOKED:
            raise MemberRevoked()
        if requires_mfa(member.role) and claims.aal != AAL2:
            raise MfaRequired()
        context = member.context_for(claims.subject)
        if resolution.activated:
            audit(
                self._audit_log,
                context,
                entity="member",
                entity_id=member.id,
                action="activate",
                old_value={"status": MemberStatus.INVITED.value},
                new_value={"status": MemberStatus.ACTIVE.value, "user_id": claims.subject},
            )
        return context

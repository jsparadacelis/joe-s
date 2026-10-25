"""Ports of the study context."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Protocol

from backend.app.study.domain.context import Qualification, Role
from backend.app.study.domain.members import Member


@dataclass(frozen=True)
class TokenClaims:
    """What the API trusts from a verified access token."""

    subject: str
    email: str
    email_verified: bool
    aal: str


class TokenVerifier(Protocol):
    def verify(self, token: str) -> TokenClaims:
        """Raise `Unauthenticated` when the token cannot be trusted."""
        ...


@dataclass(frozen=True)
class Resolution:
    member: Member
    activated: bool


class MemberResolver(Protocol):
    def resolve(self, email: str, subject: str) -> Resolution | None:
        """Find the member for a verified email, activating a pending invitation and linking
        it to `subject`. None when there is no usable row. Runs before the study is known."""
        ...


class Members(Protocol):
    """Members of the current study (row level security applies)."""

    def add(
        self,
        *,
        study_id: str,
        email: str,
        role: Role,
        qualifications: frozenset[Qualification],
        invited_by: str,
    ) -> Member: ...

    def find_by_email(self, email: str) -> Member | None: ...

    def get(self, member_id: str) -> Member | None: ...

    def list(self) -> list[Member]: ...

    def revoke(self, member_id: str) -> Member | None: ...

    def lock_active_partners(self) -> list[Member]:
        """Active partners of the study, locked until the transaction ends, so two concurrent
        revocations are serialized."""
        ...

"""Study members: people invited to a study, with a role and qualifications."""

from __future__ import annotations

import re
from dataclasses import dataclass
from enum import Enum

from backend.app.shared.text import is_storable
from backend.app.study.domain.context import Qualification, RequestContext, Role
from backend.app.study.domain.errors import InvalidEmail

_EMAIL = re.compile(r"^[^@\s]+@[^@\s]+$")
MAX_EMAIL_LENGTH = 254  # RFC 5321


class MemberStatus(str, Enum):
    INVITED = "invited"
    ACTIVE = "active"
    REVOKED = "revoked"


def normalize_email(raw: str) -> str:
    if not is_storable(raw):
        raise InvalidEmail()
    email = raw.strip().lower()
    if len(email) > MAX_EMAIL_LENGTH or not _EMAIL.match(email):
        raise InvalidEmail()
    return email


@dataclass(frozen=True)
class Member:
    id: str
    study_id: str
    email: str
    role: Role
    status: MemberStatus
    qualifications: frozenset[Qualification] = frozenset()
    user_id: str | None = None

    def __post_init__(self) -> None:
        for name in ("id", "study_id", "email"):
            if not getattr(self, name).strip():
                raise ValueError(f"{name} no puede estar vacío")
        if self.email != self.email.strip().lower():
            raise ValueError("email debe estar normalizado (minúsculas, sin espacios)")

    @property
    def may_enter(self) -> bool:
        return self.status is not MemberStatus.REVOKED

    def context_for(self, user_id: str) -> RequestContext:
        return RequestContext(
            study_id=self.study_id,
            user_id=user_id,
            role=self.role,
            qualifications=self.qualifications,
        )

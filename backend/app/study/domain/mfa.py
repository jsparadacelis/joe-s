"""Two-factor rule: which roles must sign in with assurance level aal2."""

from __future__ import annotations

from backend.app.study.domain.context import Role

AAL2 = "aal2"

_MFA_ROLES = frozenset({Role.PARTNER, Role.DIRECTOR, Role.ADMINISTRATION})


def requires_mfa(role: Role) -> bool:
    return role in _MFA_ROLES

"""Who may invite or revoke whom. A director cannot raise anyone to (or remove anyone from) the
management roles, and only a partner hands out qualifications."""

from __future__ import annotations

from backend.app.study.domain.context import Role

_MANAGEMENT = frozenset({Role.PARTNER, Role.DIRECTOR, Role.ADMINISTRATION})


def manageable_roles(actor: Role) -> frozenset[Role]:
    """Roles the actor may invite and revoke."""
    if actor is Role.PARTNER:
        return frozenset(Role)
    if actor is Role.DIRECTOR:
        return frozenset(Role) - _MANAGEMENT
    return frozenset()


def can_grant_qualifications(actor: Role) -> bool:
    return actor is Role.PARTNER

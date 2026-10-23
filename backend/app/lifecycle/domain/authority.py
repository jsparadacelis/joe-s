"""Who can promote in each phase. The keys come from the PRD (`phase_config.authority`)."""

from __future__ import annotations

from backend.app.study.domain.context import Qualification, RequestContext, Role

_ROLES = {
    "partner_director": {Role.PARTNER, Role.DIRECTOR},
    "project_director": {Role.PROJECT_DIRECTOR},
}

_QUALIFICATIONS = {
    "licensed_signatory": Qualification.LICENSED_SIGNATORY,
    "site_management": Qualification.SITE_MANAGEMENT,
    "sponsor": Qualification.SPONSOR,
}

_LABELS = {
    "partner_director": ["Socio", "Director"],
    "project_director": ["Director de proyecto"],
    "licensed_signatory": ["Firmante habilitado"],
    "site_management": ["Dirección facultativa"],
    "sponsor": ["Sponsor"],
}


def has_authority(authority: str, context: RequestContext) -> bool:
    if authority in _ROLES:
        return context.role in _ROLES[authority]
    qualification = _QUALIFICATIONS.get(authority)
    return qualification is not None and qualification in context.qualifications


def who_can(authority: str) -> list[str]:
    return list(_LABELS.get(authority, []))

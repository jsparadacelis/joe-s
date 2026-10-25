"""Context of every request: which study and user it belongs to, and with which role."""

from __future__ import annotations

from dataclasses import dataclass
from enum import Enum


class Role(str, Enum):
    PARTNER = "partner"
    DIRECTOR = "director"
    PROJECT_DIRECTOR = "project_director"
    TECHNICAL_LEAD = "technical_lead"
    ARCHITECT = "architect"
    SITE_COLLABORATOR = "site_collaborator"
    ADMINISTRATION = "administration"


class Qualification(str, Enum):
    """User attributes that grant authority in advanced phases (assigned by RGB-4)."""

    LICENSED_SIGNATORY = "licensed_signatory"
    SITE_MANAGEMENT = "site_management"
    SPONSOR = "sponsor"


@dataclass(frozen=True)
class RequestContext:
    study_id: str
    user_id: str
    role: Role
    qualifications: frozenset[Qualification] = frozenset()

    def __post_init__(self) -> None:
        for name in ("study_id", "user_id"):
            if not getattr(self, name).strip():
                raise ValueError(f"{name} no puede estar vacío")

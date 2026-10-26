"""Functions a person holds in one project, apart from their role in the studio.

The last three are the PRD's promoting functions that match no studio role."""

from __future__ import annotations

from enum import Enum


class ProjectRole(str, Enum):
    PROJECT_DIRECTOR = "project_director"
    TECHNICAL_LEAD = "technical_lead"
    ARCHITECT = "architect"
    SITE_COLLABORATOR = "site_collaborator"
    LICENSED_SIGNATORY = "licensed_signatory"
    SITE_MANAGEMENT = "site_management"
    SPONSOR = "sponsor"


# The functions that decide who promotes the late phases: handing them out is restricted and
# each one needs the matching qualification of the studio member.
SIGNING_FUNCTIONS = frozenset(
    {ProjectRole.LICENSED_SIGNATORY, ProjectRole.SITE_MANAGEMENT, ProjectRole.SPONSOR}
)

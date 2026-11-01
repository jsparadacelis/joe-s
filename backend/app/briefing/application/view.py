"""How a brief is shown to a person: live in phase 2, frozen afterwards."""

from __future__ import annotations

from collections.abc import Mapping
from typing import Any

from backend.app.briefing.application.technical_snapshot import obtained, snapshot
from backend.app.briefing.domain.brief import (
    BRIEF_KEY,
    FROZEN_BRIEF_VERSION,
    TECHNICAL_DATA_KEY,
    BriefPermissions,
    ProjectBrief,
    brief_permissions,
    build_brief,
    completeness,
)
from backend.app.briefing.domain.ports import BriefProject
from backend.app.briefing.domain.validator import has_values
from backend.app.technical_data.domain.ports import QueryRecord
from backend.app.technical_data.domain.technical_data import TechnicalData


def live_view(
    project: BriefProject,
    stored: Mapping[str, Any],
    data: TechnicalData,
    query: QueryRecord | None,
    *,
    authorized: bool,
) -> ProjectBrief:
    brief = build_brief(stored)
    found = completeness(
        brief, technical_data_obtained=obtained(data), technical_data_queried=query is not None
    )
    return ProjectBrief(
        code=project.code,
        phase=project.current_phase,
        frozen_version=None,
        fields=brief.fields,
        completeness=found,
        technical_data=snapshot(data, query),
        permissions=brief_permissions(
            phase=project.current_phase, authorized=authorized, completeness=found
        ),
    )


def frozen_view(project: BriefProject, frozen: Mapping[str, Any]) -> ProjectBrief:
    brief = build_brief(frozen.get(BRIEF_KEY))
    photo = frozen.get(TECHNICAL_DATA_KEY) or {}
    found = completeness(
        brief,
        technical_data_obtained=has_values(photo),
        technical_data_queried=photo.get("queried_at") is not None,
    )
    return ProjectBrief(
        code=project.code,
        phase=project.current_phase,
        frozen_version=FROZEN_BRIEF_VERSION,
        fields=brief.fields,
        completeness=found,
        technical_data=photo,
        permissions=BriefPermissions(can_edit=False, can_promote=False),
    )

"""What is missing from a project's exit deliverable, by phase.

Nothing is duplicated: each phase asks the rule it already has (the sheet's required fields, the
brief's completeness, the deliverable validators the promotion uses). In phases 0 to 2 the
deliverable is only marked complete and approved at the moment of promoting, so their content
rules are evaluated directly; from phase 3 the stored marks and the validators decide.
"""

from __future__ import annotations

from backend.app.briefing.application.technical_snapshot import obtained
from backend.app.briefing.domain.brief import BRIEF_KEY, build_brief, completeness
from backend.app.lifecycle.application.validators import VALIDATORS_BY_PHASE
from backend.app.lifecycle.domain.ports import DeliverableValidator
from backend.app.opportunity.domain.project_sheet import (
    build_sheet,
    missing_required_labels,
)
from backend.app.to_promote.domain.candidate import Candidate

_OPPORTUNITY, _SHEET, _BRIEF = 0, 1, 2


def missing_for(
    candidate: Candidate, validators: dict[int, DeliverableValidator] | None = None
) -> list[str]:
    """Spanish labels of what stops the promotion today; empty when it would go through."""
    phase = candidate.phase
    if phase == _OPPORTUNITY:
        return [] if candidate.scored else ["Scoring de la oportunidad"]
    if phase == _SHEET:
        return _sheet_missing(candidate)
    if phase == _BRIEF:
        return _brief_missing(candidate)
    deliverable = candidate.deliverable
    if deliverable is None:
        return ["entregable de salida"]
    registered = VALIDATORS_BY_PHASE if validators is None else validators
    return deliverable.missing(registered.get(phase))


def _sheet_missing(candidate: Candidate) -> list[str]:
    inputs = candidate.sheet
    if inputs is None:
        return ["Ficha del proyecto"]
    sheet = build_sheet(project=inputs.project, plan=inputs.plan, manual=inputs.stored)
    return missing_required_labels(sheet)


def _brief_missing(candidate: Candidate) -> list[str]:
    content = candidate.deliverable.content if candidate.deliverable is not None else {}
    technical = candidate.technical
    found = completeness(
        build_brief(content.get(BRIEF_KEY)),
        technical_data_obtained=technical is not None and obtained(technical.data),
        technical_data_queried=technical is not None and technical.last_query is not None,
    )
    return found.blockers()

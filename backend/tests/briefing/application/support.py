"""Builders shared by the briefing use case tests."""

from datetime import datetime, timezone

from backend.app.access.domain.project_roles import ProjectRole
from backend.app.audit.domain.event import Outcome
from backend.app.briefing.domain.ports import BriefProject
from backend.app.study.domain.context import RequestContext, Role
from backend.app.technical_data.domain.catalog import Source
from backend.app.technical_data.domain.datum import TechnicalDatum
from backend.app.technical_data.domain.ports import QueryRecord
from backend.app.technical_data.domain.technical_data import TechnicalData

CODE = "PRY-2026-001"
DIRECTOR = frozenset({ProjectRole.PROJECT_DIRECTOR})
BRIEF = {
    "needs": "Needs (sample)",
    "program": "Program (sample)",
    "constraints": "Constraints (sample)",
    "target_budget": 250000,
    "deadline": "2027-06-30",
    "client_approval": "email",
}


def a_context(role=Role.PROJECT_DIRECTOR):
    return RequestContext(study_id="demo-study", user_id="demo-user", role=role)


def a_project(phase=2):
    return BriefProject(id="project-1", code=CODE, current_phase=phase)


def some_data(verified=False):
    return TechnicalData.from_rows(
        [TechnicalDatum("address", "Street (sample)", Source.CATASTRO, "Street (sample)", verified)]
    )


def a_query():
    return QueryRecord("0000000AA0000A0000AA", datetime(2026, 11, 1, 9, 0, tzinfo=timezone.utc))


def events(audit_log, outcome=None):
    found = [call.args[0] for call in audit_log.record.call_args_list]
    return [e for e in found if outcome is None or e.outcome is outcome]


def rejected(audit_log):
    return events(audit_log, Outcome.REJECTED)

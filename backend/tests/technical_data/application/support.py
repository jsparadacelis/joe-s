"""Builders and fixtures shared by the technical data use case tests."""

from datetime import datetime, timezone

from backend.app.audit.domain.event import Outcome
from backend.app.study.domain.context import RequestContext, Role
from backend.app.technical_data.domain.catalog import Source
from backend.app.technical_data.domain.datum import TechnicalDatum
from backend.app.technical_data.domain.ports import TechnicalProject
from backend.app.technical_data.domain.technical_data import TechnicalData

STUDY = "00000000-0000-0000-0000-00000000e001"
NOW = datetime(2026, 11, 1, 10, 0, tzinfo=timezone.utc)


def a_context(role=Role.PROJECT_DIRECTOR):
    return RequestContext(study_id=STUDY, user_id="user-1", role=role)


def a_project(phase=2):
    return TechnicalProject(id="project-1", code="PRY-T-001", phase=phase)


def a_row(field_id, original, **overrides):
    values = {
        "field_id": field_id,
        "value": original,
        "source": Source.CATASTRO,
        "original": original,
        "verified": False,
    }
    values.update(overrides)
    return TechnicalDatum(**values)


def a_sheet(*rows):
    return TechnicalData.from_rows(rows)


def rejected_events(audit_log):
    return [
        call.args[0]
        for call in audit_log.record.call_args_list
        if call.args[0].outcome is Outcome.REJECTED
    ]


def ok_events(audit_log):
    return [
        call.args[0]
        for call in audit_log.record.call_args_list
        if call.args[0].outcome is Outcome.OK
    ]

"""Builders of sample candidates for the "to promote" tests (fictitious data)."""

from datetime import date, datetime, timezone

from backend.app.lifecycle.domain.deliverable import ExitDeliverable
from backend.app.opportunity.domain.plan import ProjectType, Scale, make_plan
from backend.app.opportunity.domain.project_plan import ConfirmedPlan
from backend.app.opportunity.domain.project_sheet import SheetProject
from backend.app.technical_data.domain.catalog import Source
from backend.app.technical_data.domain.datum import TechnicalDatum
from backend.app.technical_data.domain.technical_data import TechnicalData
from backend.app.to_promote.domain.candidate import Candidate, SheetInputs, TechnicalInputs

NOW = datetime(2026, 11, 1, 9, 0, tzinfo=timezone.utc)
SINCE = datetime(2026, 10, 1, 9, 0, tzinfo=timezone.utc)

COMPLETE_MANUAL_SHEET = {
    "cadastral_reference": "0000000AA0000A0000AA (sample)",
    "scope_included": "Included (sample)",
    "scope_excluded": "Excluded (sample)",
    "contract_signed_on": "2026-09-01",
    "sponsor": "Sponsor (sample)",
    "project_director": "Director (sample)",
    "technical_lead": "Lead (sample)",
    "contact": "Contact (sample)",
    "next_milestone": "Kick-off (sample)",
    "next_milestone_on": "2026-12-01",
    "main_risk": "Risk (sample)",
    "risk_owner": "Owner (sample)",
    "repository_path": "/repo/sample",
}

COMPLETE_BRIEF = {
    "needs": "Needs (sample)",
    "program": "Program (sample)",
    "constraints": "Constraints (sample)",
    "target_budget": 100000,
    "deadline": "2027-06-01",
    "client_approval": "signed",
}


def a_sheet_inputs(stored=None, with_plan=True):
    project = SheetProject(
        id="p-1",
        code="PRY-T-001",
        current_phase=1,
        name="House (sample)",
        client="Client (sample)",
        location="Valencia",
        project_type=ProjectType.SINGLE_FAMILY_HOUSE,
        traffic_light=None,
    )
    plan = None
    if with_plan:
        weeks = make_plan(ProjectType.SINGLE_FAMILY_HOUSE, Scale.MEDIUM).weeks
        plan = ConfirmedPlan(
            "PRY-T-001", ProjectType.SINGLE_FAMILY_HOUSE, Scale.MEDIUM, weeks, "u", NOW
        )
    return SheetInputs(project, plan, stored)


def a_technical_inputs(with_value=True):
    rows = [TechnicalDatum("year", "1990", Source.MANUAL)] if with_value else []
    return TechnicalInputs(TechnicalData.from_rows(rows), None)


def a_candidate(phase=0, **overrides) -> Candidate:
    values = {
        "id": "p-1",
        "code": "PRY-T-001",
        "name": "House (sample)",
        "phase": phase,
        "paused": False,
        "in_phase_since": SINCE,
        "expected_resumption": None,
    }
    values.update(overrides)
    return Candidate(**values)


def a_deliverable(phase, complete=True, approved=True, content=None):
    return ExitDeliverable(phase, content or {}, complete, approved)


TODAY = date(2026, 11, 1)

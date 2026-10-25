"""UpdateProjectSheet use case (RGB-17b) with simulated ports.

Names fixed here for the Developer:
- backend.app.opportunity.domain.ports.ProjectSheets gains save_content(project_id, content):
  merges `content` over the existing content of the phase 1 exit deliverable (keys not in
  `content` are kept); a key whose value is None is removed.
- backend.app.opportunity.application.update_project_sheet:
  UpdateProjectSheet(sheets, plans, audit_log).execute(context, code, fields, plan)
  -> UpdateSheetResult(sheet: ProjectSheet | None, error: Exception | None).
  Business rejections are RETURNED (and audited); only an unknown project is RAISED
  (opportunity ProjectNotFound). Order of checks: project, phase 1 (SheetNotEditable), authority
  of phase 1 (NoAuthority), validation (validate_sheet_update errors).
- Saved content: {field: value} for the touched fields (None = delete) plus, when a plan is
  sent, "plan": {project_type, scale, weeks (list), total}.
- Audit: entity "project_sheet", entity_id = code. action "update" (old_value/new_value map
  each touched field to its previous / new value, None when empty) when `fields` is sent;
  action "recalculate_plan" when `plan` is sent, with old_value/new_value of
  {project_type, scale, weeks, total}; the old plan is the saved one, else the baseline, else
  None. Rejections: action "update", outcome REJECTED, old_value {"phase": n},
  new_value {"error": code}.
- The result sheet is built with the new content (no second read of the content).
"""

from datetime import datetime, timezone
from unittest.mock import create_autospec

import pytest

from backend.app.audit.domain.event import AuditEvent, Outcome
from backend.app.audit.domain.ports import AuditLog
from backend.app.lifecycle.domain.errors import NoAuthority
from backend.app.opportunity.application.update_project_sheet import (
    UpdateProjectSheet,
    UpdateSheetResult,
)
from backend.app.opportunity.domain.errors import (
    InvalidProjectType,
    InvalidScale,
    InvalidSheetField,
    InvalidSheetRequest,
    InvalidWeeks,
    ProjectNotFound,
    SheetNotEditable,
    UnknownSheetField,
)
from backend.app.opportunity.domain.plan import ProjectType, Scale
from backend.app.opportunity.domain.ports import ProjectPlans, ProjectSheets
from backend.app.opportunity.domain.project_plan import ConfirmedPlan
from backend.app.opportunity.domain.project_sheet import ProjectSheet, SheetProject, build_sheet
from backend.app.study.domain.context import RequestContext, Role

CODE = "PRY-2026-001"
BASELINE = (2, 2, 4, 5, 8, 40, 4)
PLAN = {"project_type": "rehabilitation", "scale": "large", "weeks": [3, 4, 6, 8, 9, 40, 5]}
SAVED_PLAN = {**PLAN, "total": 75}
BASELINE_JSON = {
    "project_type": "industrial",
    "scale": "medium",
    "weeks": list(BASELINE),
    "total": 65,
}


def a_context(role=Role.PARTNER):
    return RequestContext(study_id="demo-study", user_id="demo-user", role=role)


def a_project(phase=1):
    return SheetProject(
        id="project-1",
        code=CODE,
        current_phase=phase,
        name="Warehouse (sample)",
        client="Client (sample)",
        location="Town (sample)",
        project_type=ProjectType.INDUSTRIAL,
        traffic_light=None,
    )


def a_baseline():
    return ConfirmedPlan(
        project_code=CODE,
        project_type=ProjectType.INDUSTRIAL,
        scale=Scale.MEDIUM,
        weeks=BASELINE,
        confirmed_by="sample-user",
        confirmed_at=datetime(2026, 10, 24, 10, 0, tzinfo=timezone.utc),
    )


@pytest.fixture
def sheets():
    port = create_autospec(ProjectSheets, spec_set=True, instance=True)
    port.get_project.return_value = a_project()
    port.get_content.return_value = {"sponsor": "Old sponsor", "team": "Old team"}
    return port


@pytest.fixture
def plans():
    port = create_autospec(ProjectPlans, spec_set=True, instance=True)
    port.get.return_value = a_baseline()
    return port


@pytest.fixture
def audit_log():
    return create_autospec(AuditLog, spec_set=True, instance=True)


@pytest.fixture
def use_case(sheets, plans, audit_log):
    return UpdateProjectSheet(sheets, plans, audit_log)


def events(audit_log) -> list[AuditEvent]:
    return [c.args[0] for c in audit_log.record.call_args_list]


class TestSaving:
    def test_saves_the_touched_fields_and_returns_the_sheet(self, use_case, sheets):
        result = use_case.execute(
            a_context(), CODE, {"sponsor": "  New sponsor ", "team": "", "contact": "Ana"}, None
        )

        assert isinstance(result, UpdateSheetResult)
        assert result.error is None
        assert isinstance(result.sheet, ProjectSheet)
        sheets.save_content.assert_called_once_with(
            "project-1", {"sponsor": "New sponsor", "team": None, "contact": "Ana"}
        )

    def test_the_returned_sheet_reflects_the_new_content_over_the_old(self, use_case):
        result = use_case.execute(a_context(), CODE, {"sponsor": "New", "team": ""}, None)

        assert result.sheet == build_sheet(
            project=a_project(),
            plan=a_baseline(),
            manual={"sponsor": "New"},
        )

    def test_the_keys_not_touched_survive_in_the_returned_sheet(self, use_case):
        result = use_case.execute(a_context(), CODE, {"contact": "Ana"}, None)

        found = {f.field: f.value for b in result.sheet.blocks for f in b.fields}
        assert found["sponsor"] == "Old sponsor"
        assert found["contact"] == "Ana"

    def test_works_without_a_deliverable_row(self, use_case, sheets):
        sheets.get_content.return_value = None

        result = use_case.execute(a_context(), CODE, {"contact": "Ana"}, None)

        assert result.error is None
        sheets.save_content.assert_called_once_with("project-1", {"contact": "Ana"})

    def test_saves_the_plan_with_its_total(self, use_case, sheets):
        result = use_case.execute(a_context(), CODE, None, PLAN)

        sheets.save_content.assert_called_once_with("project-1", {"plan": SAVED_PLAN})
        found = {f.field: f.value for b in result.sheet.blocks for f in b.fields}
        assert found["scale"] == "large"
        assert found["project_type"] == "rehabilitation"
        assert found["confirmed_plan"]["total"] == 75

    def test_fields_and_plan_in_a_single_save(self, use_case, sheets):
        use_case.execute(a_context(), CODE, {"contact": "Ana"}, PLAN)

        sheets.save_content.assert_called_once_with(
            "project-1", {"contact": "Ana", "plan": SAVED_PLAN}
        )

    def test_the_baseline_is_never_written(self, use_case, plans):
        use_case.execute(a_context(), CODE, None, PLAN)

        assert {c[0] for c in plans.method_calls} <= {"get"}

    @pytest.mark.parametrize("role", [Role.PARTNER, Role.DIRECTOR])
    def test_partner_and_director_can_edit(self, use_case, role):
        assert use_case.execute(a_context(role), CODE, {"contact": "x"}, None).error is None

    def test_it_never_touches_the_phase(self, use_case, sheets):
        use_case.execute(a_context(), CODE, {"contact": "x"}, PLAN)

        assert {c[0] for c in sheets.method_calls} <= {"get_project", "get_content", "save_content"}


class TestRejections:
    def test_unknown_project_is_raised_and_not_audited(self, use_case, sheets, audit_log):
        sheets.get_project.return_value = None

        with pytest.raises(ProjectNotFound) as error:
            use_case.execute(a_context(), CODE, {"contact": "x"}, None)

        assert error.value.code == "project_not_found"
        sheets.save_content.assert_not_called()
        audit_log.record.assert_not_called()

    @pytest.mark.parametrize("phase", [0, 2, 5, 7])
    def test_only_phase_1_is_editable(self, use_case, sheets, audit_log, phase):
        sheets.get_project.return_value = a_project(phase=phase)

        result = use_case.execute(a_context(), CODE, {"contact": "x"}, None)

        assert result.sheet is None
        assert isinstance(result.error, SheetNotEditable)
        sheets.save_content.assert_not_called()
        (event,) = events(audit_log)
        assert (event.entity, event.entity_id, event.action) == ("project_sheet", CODE, "update")
        assert event.outcome is Outcome.REJECTED
        assert event.old_value == {"phase": phase}
        assert event.new_value == {"error": "sheet_not_editable"}
        assert (event.study_id, event.user_id) == ("demo-study", "demo-user")

    @pytest.mark.parametrize(
        "role", [Role.PROJECT_DIRECTOR, Role.TECHNICAL_LEAD, Role.ARCHITECT, Role.SITE_COLLABORATOR]
    )
    def test_the_other_roles_have_no_authority(self, use_case, sheets, role):
        result = use_case.execute(a_context(role), CODE, {"contact": "x"}, None)

        assert isinstance(result.error, NoAuthority)
        sheets.save_content.assert_not_called()

    def test_a_role_without_authority_is_rejected_and_audited(self, use_case, sheets, audit_log):
        result = use_case.execute(a_context(Role.PROJECT_DIRECTOR), CODE, {"contact": "x"}, None)

        assert result.sheet is None
        assert isinstance(result.error, NoAuthority)
        assert result.error.phase == 1
        assert result.error.allowed == ["Socio", "Director"]
        sheets.save_content.assert_not_called()
        (event,) = events(audit_log)
        assert event.outcome is Outcome.REJECTED
        assert event.new_value == {"error": "no_authority"}
        assert event.old_value == {"phase": 1}

    def test_the_phase_is_checked_before_the_authority(self, use_case, sheets):
        sheets.get_project.return_value = a_project(phase=3)

        result = use_case.execute(a_context(Role.PROJECT_DIRECTOR), CODE, {"contact": "x"}, None)

        assert isinstance(result.error, SheetNotEditable)

    def test_the_authority_is_checked_before_the_validation(self, use_case):
        result = use_case.execute(a_context(Role.PROJECT_DIRECTOR), CODE, {"nonsense": 1}, None)

        assert isinstance(result.error, NoAuthority)

    @pytest.mark.parametrize(
        "fields, plan, error_type, code",
        [
            ({"nonsense": "x"}, None, UnknownSheetField, "unknown_field"),
            ({"code": "x"}, None, UnknownSheetField, "unknown_field"),
            ({"sponsor": 5}, None, InvalidSheetField, "invalid_field"),
            ({"sponsor": "a\x00b"}, None, InvalidSheetField, "invalid_field"),
            ({"team": "x\ud800"}, None, InvalidSheetField, "invalid_field"),
            ({"contract_signed_on": "31/12/2026"}, None, InvalidSheetField, "invalid_field"),
            (None, {**PLAN, "project_type": "x"}, InvalidProjectType, "invalid_project_type"),
            (None, {**PLAN, "scale": "x"}, InvalidScale, "invalid_scale"),
            (None, {**PLAN, "weeks": [1, 2]}, InvalidWeeks, "invalid_weeks"),
            (None, None, InvalidSheetRequest, "invalid_request"),
            ("sponsor", None, InvalidSheetRequest, "invalid_request"),
        ],
    )
    def test_invalid_input_is_returned_audited_and_nothing_is_saved(
        self, use_case, sheets, audit_log, fields, plan, error_type, code
    ):
        result = use_case.execute(a_context(), CODE, fields, plan)

        assert result.sheet is None
        assert isinstance(result.error, error_type)
        sheets.save_content.assert_not_called()
        (event,) = events(audit_log)
        assert event.action == "update"
        assert event.outcome is Outcome.REJECTED
        assert event.new_value == {"error": code}
        assert event.old_value == {"phase": 1}

    def test_nothing_is_read_or_saved_when_rejected_for_the_phase(self, use_case, sheets, plans):
        sheets.get_project.return_value = a_project(phase=2)

        use_case.execute(a_context(), CODE, {"contact": "x"}, None)

        sheets.get_content.assert_not_called()
        plans.get.assert_not_called()


class TestAudit:
    def test_update_records_previous_and_new_values_of_the_touched_fields(
        self, use_case, audit_log
    ):
        use_case.execute(a_context(), CODE, {"sponsor": "New", "team": "", "contact": "Ana"}, None)

        (event,) = events(audit_log)
        assert (event.entity, event.entity_id, event.action) == ("project_sheet", CODE, "update")
        assert event.outcome is Outcome.OK
        assert event.old_value == {"sponsor": "Old sponsor", "team": "Old team", "contact": None}
        assert event.new_value == {"sponsor": "New", "team": None, "contact": "Ana"}
        assert (event.study_id, event.user_id) == ("demo-study", "demo-user")

    def test_untouched_fields_are_not_in_the_audit(self, use_case, audit_log):
        use_case.execute(a_context(), CODE, {"contact": "Ana"}, None)

        (event,) = events(audit_log)
        assert set(event.old_value) == set(event.new_value) == {"contact"}

    def test_recalculating_the_plan_records_the_baseline_as_previous_value(
        self, use_case, audit_log
    ):
        use_case.execute(a_context(), CODE, None, PLAN)

        (event,) = events(audit_log)
        assert (event.entity, event.entity_id, event.action) == (
            "project_sheet",
            CODE,
            "recalculate_plan",
        )
        assert event.outcome is Outcome.OK
        assert event.old_value == BASELINE_JSON
        assert event.new_value == SAVED_PLAN

    def test_a_previously_saved_plan_is_the_previous_value(self, use_case, sheets, audit_log):
        previous = {
            "project_type": "facility",
            "scale": "small",
            "weeks": [1, 1, 1, 1, 1, 1, 1],
            "total": 7,
        }
        sheets.get_content.return_value = {"plan": previous}

        use_case.execute(a_context(), CODE, None, PLAN)

        (event,) = events(audit_log)
        assert event.old_value == previous
        assert event.new_value == SAVED_PLAN

    def test_without_baseline_nor_saved_plan_the_previous_value_is_none(
        self, use_case, plans, audit_log
    ):
        plans.get.return_value = None

        use_case.execute(a_context(), CODE, None, PLAN)

        (event,) = events(audit_log)
        assert event.old_value is None

    def test_fields_and_plan_write_one_event_each(self, use_case, audit_log):
        use_case.execute(a_context(), CODE, {"contact": "Ana"}, PLAN)

        assert [e.action for e in events(audit_log)] == ["update", "recalculate_plan"]

    def test_only_fields_do_not_write_a_plan_event(self, use_case, audit_log):
        use_case.execute(a_context(), CODE, {"contact": "Ana"}, None)

        assert [e.action for e in events(audit_log)] == ["update"]

    def test_no_event_reports_a_phase_change(self, use_case, audit_log):
        use_case.execute(a_context(), CODE, {"contact": "Ana"}, PLAN)

        assert all(e.entity == "project_sheet" for e in events(audit_log))

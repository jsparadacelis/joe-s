"""PromoteProjectSheet use case (RGB-19) with simulated ports.

Names fixed here for the Developer:
- backend.app.opportunity.domain.ports.ProjectSheets gains
  finalize_content(project_id, content): sets the phase 1 exit deliverable content to
  `content` (replace, not merge) and leaves it complete and approved (creates it if missing);
  and get_frozen(project_id, phase) -> dict | None: content of the latest frozen version.
- backend.app.opportunity.domain.errors.PromotionRejected(error): raised when the promotion
  service rejects after the content was finalized, so the unit of work rolls everything back.
  `.error` is the BusinessError; `.code` its code.
- backend.app.opportunity.application.promote_project_sheet:
  PromoteProjectSheet(sheets, plans, promotion, audit_log).execute(context, code)
  -> PromoteSheetResult(sheet: ProjectSheet | None, transition: Transition | None,
  error: Exception | None). Business rejections are RETURNED (and audited); only an unknown
  project is RAISED (opportunity ProjectNotFound). Order: project, phase 1 (SheetNotEditable),
  authority of phase 1 (NoAuthority), completeness (IncompleteDeliverable with Spanish labels).
- Rejection audit: entity "project_sheet", entity_id code, action "promote", outcome REJECTED,
  old_value {"phase": n}, new_value {"error": code}.
- Success: finalize_content(project.id, {**stored, "sheet": sheet_content(sheet)}) with the
  sheet built by build_sheet (same 100 % as the screen), then PromotionService.promote(context,
  code); then audit entity "project_sheet", action "freeze", old {"phase": 1}, new
  {"frozen_version": v}, version v. The returned sheet is the one a GET would give afterwards:
  phase = transition.current_phase, frozen_version = v, both permissions false.
- If promote returns a rejection, PromotionRejected is raised (no audit of its own here).
"""

from dataclasses import replace
from datetime import datetime, timezone
from unittest.mock import MagicMock, create_autospec

import pytest

from backend.app.audit.domain.event import AuditEvent, Outcome
from backend.app.audit.domain.ports import AuditLog
from backend.app.lifecycle.application.promotion_service import PromotionService, Transition
from backend.app.lifecycle.domain.errors import IncompleteDeliverable, NoAuthority, NoNextPhase
from backend.app.opportunity.application.promote_project_sheet import (
    PromoteProjectSheet,
    PromoteSheetResult,
)
from backend.app.opportunity.domain.errors import (
    ProjectNotFound,
    PromotionRejected,
    SheetNotEditable,
)
from backend.app.opportunity.domain.plan import ProjectType, Scale
from backend.app.opportunity.domain.ports import ProjectPlans, ProjectSheets
from backend.app.opportunity.domain.project_plan import ConfirmedPlan
from backend.app.opportunity.domain.project_sheet import (
    SheetPermissions,
    SheetProject,
    build_sheet,
    missing_required_labels,
    sheet_content,
)
from backend.app.study.domain.context import RequestContext, Role

CODE = "PRY-2026-001"
MANUAL = {
    name: f"{name} (sample)"
    for name in (
        "cadastral_reference",
        "scope_included",
        "scope_excluded",
        "contract_signed_on",
        "sponsor",
        "project_director",
        "technical_lead",
        "contact",
        "next_milestone",
        "next_milestone_on",
        "main_risk",
        "risk_owner",
        "repository_path",
    )
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
        weeks=(2, 2, 4, 5, 8, 40, 4),
        confirmed_by="sample-user",
        confirmed_at=datetime(2026, 10, 24, 10, 0, tzinfo=timezone.utc),
    )


def the_sheet(manual=None):
    return build_sheet(
        project=a_project(), plan=a_baseline(), manual=MANUAL if manual is None else manual
    )


@pytest.fixture
def calls():
    """One parent mock to see the order of the calls across ports."""
    return MagicMock()


@pytest.fixture
def sheets(calls):
    port = create_autospec(ProjectSheets, spec_set=True, instance=True)
    port.get_project.return_value = a_project()
    port.get_content.return_value = dict(MANUAL)
    calls.attach_mock(port.finalize_content, "finalize_content")
    return port


@pytest.fixture
def plans():
    port = create_autospec(ProjectPlans, spec_set=True, instance=True)
    port.get.return_value = a_baseline()
    return port


@pytest.fixture
def promotion(calls):
    service = create_autospec(PromotionService, spec_set=True, instance=True)
    service.promote.return_value = Transition(True, "promote", 1, 2, 1, None)
    calls.attach_mock(service.promote, "promote")
    return service


@pytest.fixture
def audit_log():
    return create_autospec(AuditLog, spec_set=True, instance=True)


@pytest.fixture
def use_case(sheets, plans, promotion, audit_log):
    return PromoteProjectSheet(sheets, plans, promotion, audit_log)


def events(audit_log) -> list[AuditEvent]:
    return [c.args[0] for c in audit_log.record.call_args_list]


class TestSuccess:
    def test_finalizes_the_content_with_the_resolved_sheet(self, use_case, sheets):
        use_case.execute(a_context(), CODE)

        sheets.finalize_content.assert_called_once_with(
            "project-1", {**MANUAL, "sheet": sheet_content(the_sheet())}
        )

    def test_the_frozen_sheet_is_the_one_the_person_sees(self, use_case, sheets):
        use_case.execute(a_context(), CODE)

        content = sheets.finalize_content.call_args.args[1]
        assert content["sheet"]["completion"] == {"filled": 20, "required": 20, "percent": 100}
        values = {f["field"]: f["value"] for b in content["sheet"]["blocks"] for f in b["fields"]}
        assert values["client"] == "Client (sample)"
        assert values["sponsor"] == "sponsor (sample)"
        assert values["confirmed_plan"]["total"] == 65

    def test_the_saved_recalculated_plan_is_what_gets_frozen(self, use_case, sheets):
        saved = {"project_type": "rehabilitation", "scale": "large", "weeks": [3] * 7, "total": 21}
        sheets.get_content.return_value = {**MANUAL, "plan": saved}

        use_case.execute(a_context(), CODE)

        content = sheets.finalize_content.call_args.args[1]
        assert content["plan"] == saved
        values = {f["field"]: f["value"] for b in content["sheet"]["blocks"] for f in b["fields"]}
        assert (values["project_type"], values["scale"]) == ("rehabilitation", "large")
        assert values["confirmed_plan"]["total"] == 21

    def test_finalizes_first_and_then_delegates_in_the_promotion_service(
        self, use_case, calls, promotion
    ):
        use_case.execute(a_context(), CODE)

        assert [c[0] for c in calls.mock_calls] == ["finalize_content", "promote"]
        promotion.promote.assert_called_once_with(a_context(), CODE)

    def test_returns_the_sheet_as_a_get_would_after_the_promotion(self, use_case):
        result = use_case.execute(a_context(), CODE)

        assert isinstance(result, PromoteSheetResult)
        assert result.error is None
        assert result.transition == Transition(True, "promote", 1, 2, 1, None)
        assert result.sheet == replace(
            the_sheet(),
            phase=2,
            frozen_version=1,
            permissions=SheetPermissions(False, False),
        )

    def test_audits_the_freeze_with_the_version(self, use_case, audit_log):
        use_case.execute(a_context(), CODE)

        (event,) = events(audit_log)
        assert (event.entity, event.entity_id, event.action) == ("project_sheet", CODE, "freeze")
        assert event.outcome is Outcome.OK
        assert event.old_value == {"phase": 1}
        assert event.new_value == {"frozen_version": 1}
        assert event.version == 1
        assert (event.study_id, event.user_id) == ("demo-study", "demo-user")

    @pytest.mark.parametrize("role", [Role.PARTNER, Role.DIRECTOR])
    def test_partner_and_director_can_promote(self, use_case, role):
        assert use_case.execute(a_context(role), CODE).error is None

    def test_works_without_the_baseline_only_if_the_saved_plan_completes_the_sheet(
        self, use_case, sheets, plans
    ):
        plans.get.return_value = None
        saved = {"project_type": "industrial", "scale": "medium", "weeks": [1] * 7, "total": 7}
        sheets.get_content.return_value = {**MANUAL, "plan": saved}

        result = use_case.execute(a_context(), CODE)

        assert result.error is None

    def test_a_promotion_rejected_afterwards_is_raised_so_the_unit_rolls_back(
        self, use_case, promotion
    ):
        rejection = NoNextPhase()
        promotion.promote.return_value = Transition(False, "promote", 1, 1, None, rejection)

        with pytest.raises(PromotionRejected) as raised:
            use_case.execute(a_context(), CODE)

        assert raised.value.error is rejection
        assert raised.value.code == rejection.code


class TestRejections:
    def test_unknown_project_is_raised_and_not_audited(
        self, use_case, sheets, promotion, audit_log
    ):
        sheets.get_project.return_value = None

        with pytest.raises(ProjectNotFound) as error:
            use_case.execute(a_context(), CODE)

        assert error.value.code == "project_not_found"
        sheets.finalize_content.assert_not_called()
        promotion.promote.assert_not_called()
        audit_log.record.assert_not_called()

    @pytest.mark.parametrize("phase", [0, 2, 5, 7])
    def test_outside_phase_1_it_is_not_editable_and_audited(
        self, use_case, sheets, promotion, audit_log, phase
    ):
        sheets.get_project.return_value = a_project(phase=phase)

        result = use_case.execute(a_context(), CODE)

        assert result.sheet is None and result.transition is None
        assert isinstance(result.error, SheetNotEditable)
        sheets.finalize_content.assert_not_called()
        promotion.promote.assert_not_called()
        (event,) = events(audit_log)
        assert (event.entity, event.entity_id, event.action) == ("project_sheet", CODE, "promote")
        assert event.outcome is Outcome.REJECTED
        assert event.old_value == {"phase": phase}
        assert event.new_value == {"error": "sheet_not_editable"}

    @pytest.mark.parametrize(
        "role", [Role.PROJECT_DIRECTOR, Role.TECHNICAL_LEAD, Role.ARCHITECT, Role.SITE_COLLABORATOR]
    )
    def test_without_authority_it_is_rejected_and_audited(
        self, use_case, sheets, promotion, audit_log, role
    ):
        result = use_case.execute(a_context(role), CODE)

        assert isinstance(result.error, NoAuthority)
        assert result.error.phase == 1
        sheets.finalize_content.assert_not_called()
        promotion.promote.assert_not_called()
        (event,) = events(audit_log)
        assert event.outcome is Outcome.REJECTED
        assert event.new_value == {"error": "no_authority"}
        assert event.old_value == {"phase": 1}

    def test_the_phase_is_checked_before_the_authority(self, use_case, sheets):
        sheets.get_project.return_value = a_project(phase=2)

        result = use_case.execute(a_context(Role.ARCHITECT), CODE)

        assert isinstance(result.error, SheetNotEditable)

    def test_the_authority_is_checked_before_the_completeness(self, use_case, sheets):
        sheets.get_content.return_value = {}

        result = use_case.execute(a_context(Role.ARCHITECT), CODE)

        assert isinstance(result.error, NoAuthority)

    def test_an_incomplete_sheet_returns_the_missing_labels_and_is_audited(
        self, use_case, sheets, promotion, audit_log
    ):
        sheets.get_content.return_value = {**MANUAL, "sponsor": "  ", "contact": None}
        del sheets.get_content.return_value["main_risk"]

        result = use_case.execute(a_context(), CODE)

        assert isinstance(result.error, IncompleteDeliverable)
        assert result.error.missing == ["Promotor", "Contacto del cliente", "Riesgo principal"]
        assert result.error.missing == missing_required_labels(
            the_sheet({**MANUAL, "sponsor": "", "contact": None, "main_risk": None})
        )
        sheets.finalize_content.assert_not_called()
        promotion.promote.assert_not_called()
        (event,) = events(audit_log)
        assert event.outcome is Outcome.REJECTED
        assert event.action == "promote"
        assert event.new_value == {"error": "incomplete_deliverable"}

    def test_without_a_deliverable_row_every_manual_field_is_missing(self, use_case, sheets):
        sheets.get_content.return_value = None

        result = use_case.execute(a_context(), CODE)

        assert isinstance(result.error, IncompleteDeliverable)
        assert len(result.error.missing) == 13

    def test_without_a_plan_the_plan_fields_are_missing(self, use_case, plans):
        plans.get.return_value = None

        result = use_case.execute(a_context(), CODE)

        assert result.error.missing == ["Escala", "Plan confirmado"]

    def test_a_rejection_never_freezes_or_changes_anything(self, use_case, sheets, promotion):
        sheets.get_content.return_value = {}

        use_case.execute(a_context(), CODE)

        assert {c[0] for c in sheets.method_calls} <= {"get_project", "get_content"}
        promotion.promote.assert_not_called()


class TestSerialization:
    """Fix after the Tester (finding 1): concurrent promotions are serialized per project."""

    def test_the_project_is_read_locked_before_anything_else(self, use_case, sheets, calls):
        calls.attach_mock(sheets.get_project, "get_project")
        calls.attach_mock(sheets.get_content, "get_content")

        use_case.execute(a_context(), CODE)

        sheets.get_project.assert_called_once_with(CODE, lock=True)
        assert [c[0] for c in calls.mock_calls][:2] == ["get_project", "get_content"]

    def test_the_loser_sees_phase_2_and_gets_an_audited_not_editable(
        self, use_case, sheets, promotion, audit_log
    ):
        # What the lock guarantees: once the winner commits, the loser reads phase 2.
        sheets.get_project.return_value = a_project(phase=2)

        result = use_case.execute(a_context(), CODE)

        assert isinstance(result.error, SheetNotEditable)
        promotion.promote.assert_not_called()
        (event,) = events(audit_log)
        assert event.outcome is Outcome.REJECTED
        assert (event.action, event.new_value) == ("promote", {"error": "sheet_not_editable"})


def test_the_incomplete_message_does_not_repeat_the_labels(use_case, sheets):
    sheets.get_content.return_value = {**MANUAL, "main_risk": None}

    error = use_case.execute(a_context(), CODE).error

    assert error.code == "incomplete_deliverable"
    assert error.missing == ["Riesgo principal"]
    assert "Riesgo principal" not in error.message
    assert error.message == "La ficha no está completa: falta 1 campo obligatorio."


def test_the_incomplete_message_counts_in_plural(use_case, sheets):
    sheets.get_content.return_value = {}

    error = use_case.execute(a_context(), CODE).error

    assert error.message == "La ficha no está completa: faltan 13 campos obligatorios."

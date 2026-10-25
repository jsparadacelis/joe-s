"""GetProjectSheet use case (RGB-17a) with simulated ports.

Names fixed here for the Developer:
- backend.app.opportunity.domain.project_sheet: SheetProject, build_sheet, ProjectSheet (see
  tests/opportunity/domain/test_project_sheet.py).
- backend.app.opportunity.domain.ports.ProjectSheets (Protocol): get_project(code) ->
  SheetProject | None; get_content(project_id) -> dict | None (the content of the phase 1 exit
  deliverable, None when there is no row yet).
- backend.app.opportunity.domain.errors.SheetNotFound: code "sheet_not_found", Spanish `message`.
- backend.app.opportunity.application.get_project_sheet.GetProjectSheet(sheets, plans)
  .read(code) -> ProjectSheet. The confirmed plan is read through ProjectPlans.get(project.id).
  Raises ProjectNotFound (unknown code) or SheetNotFound (phase 0). Read-only: nothing is saved.

RGB-19 extension of the contract (asked for in docs/plans/RGB-19/plan.md): read(context, code)
now takes the RequestContext first, because the permissions depend on the role.
- Phase 1: the live sheet, frozen_version None, permissions SheetPermissions(can_edit,
  can_promote) from sheet_permissions (phase 1 + authority of phase 1; 100 % to promote).
- Phase > 1: the frozen sheet (ProjectSheets.get_frozen(project_id, 1)["sheet"]) with
  phase = the current phase, frozen_version 1 and both permissions false; nothing is rebuilt.
  A project with no frozen sheet (legacy) falls back to the live build with frozen_version None
  and both permissions false.
"""

from dataclasses import replace
from datetime import datetime, timezone
from unittest.mock import create_autospec

import pytest

from backend.app.opportunity.application.get_project_sheet import GetProjectSheet
from backend.app.opportunity.domain.errors import ProjectNotFound, SheetNotFound
from backend.app.opportunity.domain.plan import ProjectType, Scale
from backend.app.opportunity.domain.ports import ProjectPlans, ProjectSheets
from backend.app.opportunity.domain.project_plan import ConfirmedPlan
from backend.app.opportunity.domain.project_sheet import (
    ProjectSheet,
    SheetPermissions,
    SheetProject,
    build_sheet,
    sheet_content,
)
from backend.app.study.domain.context import RequestContext, Role

CODE = "PRY-2026-001"
WEEKS = (2, 2, 4, 5, 8, 40, 4)


def a_context(role=Role.PARTNER):
    return RequestContext(study_id="demo-study", user_id="demo-user", role=role)


def a_project(phase=1, traffic_light="green"):
    return SheetProject(
        id="project-1",
        code=CODE,
        current_phase=phase,
        name="Warehouse (sample)",
        client="Client (sample)",
        location="Town (sample)",
        project_type=ProjectType.INDUSTRIAL,
        traffic_light=traffic_light,
    )


def a_plan():
    return ConfirmedPlan(
        project_code=CODE,
        project_type=ProjectType.INDUSTRIAL,
        scale=Scale.MEDIUM,
        weeks=WEEKS,
        confirmed_by="sample-user",
        confirmed_at=datetime(2026, 10, 24, 10, 0, tzinfo=timezone.utc),
    )


def frozen_content():
    sheet = build_sheet(project=a_project(), plan=a_plan(), manual={"sponsor": "Frozen sponsor"})
    return {"sponsor": "Frozen sponsor", "sheet": sheet_content(sheet)}


@pytest.fixture
def sheets():
    port = create_autospec(ProjectSheets, spec_set=True, instance=True)
    port.get_project.return_value = a_project()
    port.get_content.return_value = {"sponsor": "Sponsor (sample)", "main_risk": "  "}
    port.get_frozen.return_value = frozen_content()
    return port


@pytest.fixture
def plans():
    port = create_autospec(ProjectPlans, spec_set=True, instance=True)
    port.get.return_value = a_plan()
    return port


@pytest.fixture
def use_case(sheets, plans):
    return GetProjectSheet(sheets, plans)


class TestRead:
    def test_unknown_project(self, use_case, sheets, plans):
        sheets.get_project.return_value = None

        with pytest.raises(ProjectNotFound) as error:
            use_case.read(a_context(), CODE)

        assert error.value.code == "project_not_found"
        assert CODE in str(error.value)
        sheets.get_content.assert_not_called()
        plans.get.assert_not_called()

    def test_an_opportunity_has_no_sheet(self, use_case, sheets, plans):
        sheets.get_project.return_value = a_project(phase=0)

        with pytest.raises(SheetNotFound) as error:
            use_case.read(a_context(), CODE)

        assert error.value.code == "sheet_not_found"
        assert error.value.message
        sheets.get_content.assert_not_called()
        plans.get.assert_not_called()

    @pytest.mark.parametrize("phase", [1, 2, 4, 7])
    def test_from_phase_1_the_sheet_exists(self, use_case, sheets, phase):
        sheets.get_project.return_value = a_project(phase=phase)

        result = use_case.read(a_context(), CODE)

        assert isinstance(result, ProjectSheet)
        assert result.phase == phase

    def test_composes_project_plan_content_and_traffic_light(self, use_case, sheets, plans):
        result = use_case.read(a_context(), CODE)

        assert result == replace(
            build_sheet(
                project=a_project(),
                plan=a_plan(),
                manual={"sponsor": "Sponsor (sample)", "main_risk": "  "},
            ),
            permissions=SheetPermissions(can_edit=True, can_promote=False),
        )
        by_name = {f.field: f for b in result.blocks for f in b.fields}
        assert by_name["sponsor"].value == "Sponsor (sample)"
        assert by_name["main_risk"].value is None
        assert by_name["traffic_light"].value == "green"
        assert by_name["confirmed_plan"].value["total"] == 65

    def test_reads_with_the_right_keys_and_without_locking(self, use_case, sheets, plans):
        use_case.read(a_context(), CODE)

        sheets.get_project.assert_called_once_with(CODE)
        sheets.get_content.assert_called_once_with("project-1")
        plans.get.assert_called_once_with("project-1")

    def test_without_a_deliverable_row_everything_manual_is_empty(self, use_case, sheets):
        sheets.get_content.return_value = None

        result = use_case.read(a_context(), CODE)

        assert result == replace(
            build_sheet(project=a_project(), plan=a_plan(), manual={}),
            permissions=SheetPermissions(can_edit=True, can_promote=False),
        )
        assert result.completion.filled == 7

    def test_without_a_plan_the_sheet_is_still_built(self, use_case, plans):
        plans.get.return_value = None

        result = use_case.read(a_context(), CODE)

        by_name = {f.field: f for b in result.blocks for f in b.fields}
        assert by_name["confirmed_plan"].value is None

    def test_it_only_reads(self, use_case, sheets, plans):
        use_case.read(a_context(), CODE)

        assert {c[0] for c in sheets.method_calls} <= {
            "get_project",
            "get_content",
            "get_frozen",
        }
        assert {c[0] for c in plans.method_calls} <= {"get"}


MANUAL_100 = {
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


class TestPermissionsInPhase1:
    def test_partner_with_an_incomplete_sheet_can_edit_but_not_promote(self, use_case):
        result = use_case.read(a_context(Role.PARTNER), CODE)

        assert result.permissions == SheetPermissions(can_edit=True, can_promote=False)
        assert result.frozen_version is None

    @pytest.mark.parametrize("role", [Role.PARTNER, Role.DIRECTOR])
    def test_with_the_sheet_at_100_percent_the_authority_can_promote(self, use_case, sheets, role):
        sheets.get_content.return_value = MANUAL_100

        result = use_case.read(a_context(role), CODE)

        assert result.completion.percent == 100
        assert result.permissions == SheetPermissions(can_edit=True, can_promote=True)

    @pytest.mark.parametrize(
        "role", [Role.PROJECT_DIRECTOR, Role.TECHNICAL_LEAD, Role.ARCHITECT, Role.SITE_COLLABORATOR]
    )
    @pytest.mark.parametrize("content", [MANUAL_100, {"sponsor": "x"}])
    def test_without_authority_nothing_is_allowed_even_at_100_percent(
        self, use_case, sheets, role, content
    ):
        sheets.get_content.return_value = content

        result = use_case.read(a_context(role), CODE)

        assert result.permissions == SheetPermissions(can_edit=False, can_promote=False)
        assert result.frozen_version is None

    def test_the_live_sheet_is_not_read_from_the_frozen_versions(self, use_case, sheets):
        use_case.read(a_context(), CODE)

        sheets.get_frozen.assert_not_called()


class TestFrozenSheetFromPhase2:
    @pytest.mark.parametrize("phase", [2, 3, 7])
    @pytest.mark.parametrize("role", [Role.PARTNER, Role.DIRECTOR, Role.ARCHITECT])
    def test_returns_the_frozen_version_with_no_permissions(self, use_case, sheets, phase, role):
        sheets.get_project.return_value = a_project(phase=phase)

        result = use_case.read(a_context(role), CODE)

        frozen = build_sheet(
            project=a_project(), plan=a_plan(), manual={"sponsor": "Frozen sponsor"}
        )
        assert result == replace(
            frozen,
            phase=phase,
            frozen_version=1,
            permissions=SheetPermissions(can_edit=False, can_promote=False),
        )

    def test_does_not_rebuild_it_from_the_live_content_or_plan(self, use_case, sheets, plans):
        sheets.get_project.return_value = a_project(phase=2)
        sheets.get_content.return_value = {"sponsor": "Changed afterwards"}

        result = use_case.read(a_context(), CODE)

        by_name = {f.field: f for b in result.blocks for f in b.fields}
        assert by_name["sponsor"].value == "Frozen sponsor"
        sheets.get_frozen.assert_called_once_with("project-1", 1)
        sheets.get_content.assert_not_called()
        plans.get.assert_not_called()

    def test_a_legacy_project_without_a_frozen_sheet_falls_back_to_the_live_one(
        self, use_case, sheets
    ):
        sheets.get_project.return_value = a_project(phase=2)
        sheets.get_frozen.return_value = {"sponsor": "no sheet key"}

        result = use_case.read(a_context(), CODE)

        assert result.frozen_version is None
        assert result.permissions == SheetPermissions(False, False)
        assert result.phase == 2

    def test_no_frozen_version_at_all_also_falls_back(self, use_case, sheets):
        sheets.get_project.return_value = a_project(phase=3)
        sheets.get_frozen.return_value = None

        result = use_case.read(a_context(), CODE)

        assert result.frozen_version is None
        assert result.permissions == SheetPermissions(False, False)

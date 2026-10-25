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
"""

from datetime import datetime, timezone
from unittest.mock import create_autospec

import pytest

from backend.app.opportunity.application.get_project_sheet import GetProjectSheet
from backend.app.opportunity.domain.errors import ProjectNotFound, SheetNotFound
from backend.app.opportunity.domain.plan import ProjectType, Scale
from backend.app.opportunity.domain.ports import ProjectPlans, ProjectSheets
from backend.app.opportunity.domain.project_plan import ConfirmedPlan
from backend.app.opportunity.domain.project_sheet import ProjectSheet, SheetProject, build_sheet

CODE = "PRY-2026-001"
WEEKS = (2, 2, 4, 5, 8, 40, 4)


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


@pytest.fixture
def sheets():
    port = create_autospec(ProjectSheets, spec_set=True, instance=True)
    port.get_project.return_value = a_project()
    port.get_content.return_value = {"sponsor": "Sponsor (sample)", "main_risk": "  "}
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
            use_case.read(CODE)

        assert error.value.code == "project_not_found"
        assert CODE in str(error.value)
        sheets.get_content.assert_not_called()
        plans.get.assert_not_called()

    def test_an_opportunity_has_no_sheet(self, use_case, sheets, plans):
        sheets.get_project.return_value = a_project(phase=0)

        with pytest.raises(SheetNotFound) as error:
            use_case.read(CODE)

        assert error.value.code == "sheet_not_found"
        assert error.value.message
        sheets.get_content.assert_not_called()
        plans.get.assert_not_called()

    @pytest.mark.parametrize("phase", [1, 2, 4, 7])
    def test_from_phase_1_the_sheet_exists(self, use_case, sheets, phase):
        sheets.get_project.return_value = a_project(phase=phase)

        result = use_case.read(CODE)

        assert isinstance(result, ProjectSheet)
        assert result.phase == phase

    def test_composes_project_plan_content_and_traffic_light(self, use_case, sheets, plans):
        result = use_case.read(CODE)

        assert result == build_sheet(
            project=a_project(),
            plan=a_plan(),
            manual={"sponsor": "Sponsor (sample)", "main_risk": "  "},
        )
        by_name = {f.field: f for b in result.blocks for f in b.fields}
        assert by_name["sponsor"].value == "Sponsor (sample)"
        assert by_name["main_risk"].value is None
        assert by_name["traffic_light"].value == "green"
        assert by_name["confirmed_plan"].value["total"] == 65

    def test_reads_with_the_right_keys_and_without_locking(self, use_case, sheets, plans):
        use_case.read(CODE)

        sheets.get_project.assert_called_once_with(CODE)
        sheets.get_content.assert_called_once_with("project-1")
        plans.get.assert_called_once_with("project-1")

    def test_without_a_deliverable_row_everything_manual_is_empty(self, use_case, sheets):
        sheets.get_content.return_value = None

        result = use_case.read(CODE)

        assert result == build_sheet(project=a_project(), plan=a_plan(), manual={})
        assert result.completion.filled == 7

    def test_without_a_plan_the_sheet_is_still_built(self, use_case, plans):
        plans.get.return_value = None

        result = use_case.read(CODE)

        by_name = {f.field: f for b in result.blocks for f in b.fields}
        assert by_name["confirmed_plan"].value is None

    def test_it_only_reads(self, use_case, sheets, plans):
        use_case.read(CODE)

        assert {c[0] for c in sheets.method_calls} <= {"get_project", "get_content"}
        assert {c[0] for c in plans.method_calls} <= {"get"}

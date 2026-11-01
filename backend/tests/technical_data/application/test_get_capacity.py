"""Reading the buildable capacity: any member of the study, in any phase, from the saved data."""

from decimal import Decimal

from backend.app.study.domain.context import Role
from backend.app.technical_data.application.get_capacity import GetCapacity
from backend.app.technical_data.domain.capacity import LimitingCondition
from backend.app.technical_data.domain.errors import ProjectNotFound
from backend.tests.technical_data.application.support import a_context, a_project, a_row, a_sheet


def planning_sheet(**overrides):
    values = {
        "cadastralPlotArea": "96",
        "buildability": "1,5",
        "maxOccupancy": "70",
        "floors": "PB+2",
        "calcArea": "Catastral",
        **overrides,
    }
    return a_sheet(*(a_row(field_id, value, value=value) for field_id, value in values.items()))


def test_computes_the_capacity_from_the_saved_values(projects, data):
    data.load.return_value = planning_sheet()

    result = GetCapacity(projects, data).execute(a_context(Role.ARCHITECT), "PRY-T-001")

    assert result.error is None
    assert result.result.capacity.maximum == Decimal("144")
    assert result.result.capacity.limited_by is LimitingCondition.BUILDABILITY
    data.load.assert_called_once_with("project-1")


def test_uses_the_edited_value_not_the_original(projects, data):
    data.load.return_value = a_sheet(
        a_row("cadastralPlotArea", "100", value="96"),
        a_row("buildability", "1,5"),
        a_row("maxOccupancy", "70"),
        a_row("floors", "PB+2"),
    )

    result = GetCapacity(projects, data).execute(a_context(), "X")

    assert result.result.capacity.surface == Decimal("96")


def test_reports_what_is_missing_instead_of_inventing_it(projects, data):
    data.load.return_value = planning_sheet(floors="")

    result = GetCapacity(projects, data).execute(a_context(), "X")

    assert result.error is None
    assert result.result.capacity is None
    assert result.result.missing == ("floors",)


def test_reads_in_any_phase_and_without_locking(projects, data):
    projects.find.return_value = a_project(5)
    data.load.return_value = planning_sheet()

    result = GetCapacity(projects, data).execute(a_context(Role.SITE_COLLABORATOR), "X")

    assert result.error is None
    projects.find.assert_called_once_with("X", lock=False)


def test_an_unknown_project_is_not_found(projects, data):
    projects.find.return_value = None

    result = GetCapacity(projects, data).execute(a_context(), "X")

    assert isinstance(result.error, ProjectNotFound)
    assert result.result is None
    data.load.assert_not_called()

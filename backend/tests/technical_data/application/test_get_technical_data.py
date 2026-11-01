"""Reading the technical data: any member of the study, any phase."""

from datetime import datetime, timezone

from backend.app.study.domain.context import Role
from backend.app.technical_data.application.get_technical_data import GetTechnicalData
from backend.app.technical_data.domain.catalog import CATALOG
from backend.app.technical_data.domain.errors import ProjectNotFound
from backend.app.technical_data.domain.ports import QueryRecord
from backend.tests.technical_data.application.support import a_context, a_project


def test_returns_the_complete_sheet_and_the_last_query(projects, data):
    record = QueryRecord("9872023VH5797S0001WX", datetime(2026, 10, 18, tzinfo=timezone.utc))
    data.last_query.return_value = record

    result = GetTechnicalData(projects, data).execute(a_context(Role.ARCHITECT), "PRY-T-001")

    assert result.error is None
    assert [d.field_id for d in result.sheet.data] == [d.id for d in CATALOG]
    assert result.last_query == record
    data.load.assert_called_once_with("project-1")


def test_reads_in_any_phase_and_without_locking(projects, data):
    projects.find.return_value = a_project(5)

    result = GetTechnicalData(projects, data).execute(a_context(Role.SITE_COLLABORATOR), "X")

    assert result.error is None
    projects.find.assert_called_once_with("X", lock=False)


def test_an_unknown_project_is_not_found(projects, data):
    projects.find.return_value = None

    result = GetTechnicalData(projects, data).execute(a_context(), "X")

    assert isinstance(result.error, ProjectNotFound)
    data.load.assert_not_called()

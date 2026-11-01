"""Reading the alerts: any member of the study, any phase, always from the current data."""

from unittest.mock import create_autospec

import pytest

from backend.app.study.domain.context import Role
from backend.app.technical_data.application.get_alerts import GetAlerts
from backend.app.technical_data.domain.alerts import AlertConfig, ProjectFacts
from backend.app.technical_data.domain.errors import ProjectNotFound
from backend.app.technical_data.domain.ports import ProjectFactsReader
from backend.tests.technical_data.application.support import a_context, a_project, a_row, a_sheet


@pytest.fixture
def facts():
    stub = create_autospec(ProjectFactsReader, spec_set=True, instance=True)
    stub.facts_of.return_value = ProjectFacts(project_type="single_family_house", location="X")
    return stub


def test_evaluates_the_saved_values_and_the_sheet_facts(projects, data, facts):
    data.load.return_value = a_sheet(a_row("year", "1960"), a_row("use", "Industrial"))

    answer = GetAlerts(projects, data, facts).execute(a_context(Role.ARCHITECT), "PRY-T-001")

    assert answer.error is None
    assert [a.code for a in answer.alerts] == ["use_mismatch", "pre_1980_building"]
    data.load.assert_called_once_with("project-1")
    facts.facts_of.assert_called_once_with("project-1")


def test_uses_the_edited_value_so_a_fixed_datum_clears_its_alert(projects, data, facts):
    data.load.return_value = a_sheet(a_row("year", "1960", value="1995"))

    answer = GetAlerts(projects, data, facts).execute(a_context(), "X")

    assert answer.alerts == []


def test_the_configuration_is_used(projects, data, facts):
    data.load.return_value = a_sheet(a_row("slope", "6"))

    answer = GetAlerts(projects, data, facts, AlertConfig(slope_percent=5)).execute(
        a_context(), "X"
    )

    assert [a.code for a in answer.alerts] == ["steep_slope"]


def test_reads_in_any_phase_without_locking(projects, data, facts):
    projects.find.return_value = a_project(5)

    answer = GetAlerts(projects, data, facts).execute(a_context(Role.SITE_COLLABORATOR), "X")

    assert answer.error is None
    projects.find.assert_called_once_with("X", lock=False)


def test_it_only_reads_nothing_is_saved_or_recorded(projects, data, facts):
    data.load.return_value = a_sheet(a_row("year", "1960"))

    GetAlerts(projects, data, facts).execute(a_context(), "X")

    data.save.assert_not_called()
    data.record_query.assert_not_called()


def test_an_unknown_project_is_not_found(projects, data, facts):
    projects.find.return_value = None

    answer = GetAlerts(projects, data, facts).execute(a_context(), "X")

    assert isinstance(answer.error, ProjectNotFound)
    assert answer.alerts == []
    data.load.assert_not_called()
    facts.facts_of.assert_not_called()

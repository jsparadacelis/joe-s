"""Portfolio queries with a simulated reader."""

from datetime import date, datetime, timezone
from unittest.mock import create_autospec

import pytest

from backend.app.portfolio.application.queries import PortfolioQueries
from backend.app.portfolio.domain.errors import ProjectNotFound
from backend.app.portfolio.domain.ports import ProjectReader
from backend.app.portfolio.domain.project import ProjectRecord

NOW = datetime(2026, 10, 24, 15, 0, tzinfo=timezone.utc)


def a_record(code="PRY-2026-001", **overrides):
    data = {
        "code": code,
        "name": "House (sample)",
        "current_phase": 0,
        "paused": False,
        "traffic_light": None,
        "next_milestone": None,
        "responsible_id": "Owner (sample)",
        "updated_at": NOW,
        "pause_reason": None,
        "pause_expected_resumption": None,
    }
    data.update(overrides)
    return ProjectRecord(**data)


@pytest.fixture
def reader():
    return create_autospec(ProjectReader, spec_set=True, instance=True)


@pytest.fixture
def queries(reader):
    return PortfolioQueries(reader, clock=lambda: NOW)


class TestPortfolio:
    def test_as_of_is_today_in_utc(self, queries, reader):
        reader.list_projects.return_value = []

        assert queries.portfolio().as_of == date(2026, 10, 24)

    def test_entries_carry_status_days_and_owner(self, queries, reader):
        reader.list_projects.return_value = [
            a_record(updated_at=datetime(2026, 10, 21, 8, 0, tzinfo=timezone.utc))
        ]

        entry = queries.portfolio().entries[0]

        assert (entry.code, entry.phase, entry.status) == ("PRY-2026-001", 0, "no_plan")
        assert entry.owner_id == "Owner (sample)"
        assert entry.days_since_update == 3

    def test_entries_are_ordered_by_code(self, queries, reader):
        reader.list_projects.return_value = [a_record("PRY-2026-002"), a_record("PRY-2026-001")]

        assert [e.code for e in queries.portfolio().entries] == ["PRY-2026-001", "PRY-2026-002"]

    def test_next_milestone_is_text_without_date(self, queries, reader):
        reader.list_projects.return_value = [a_record(next_milestone="Kick-off (sample)")]

        assert queries.portfolio().entries[0].next_milestone == "Kick-off (sample)"


class TestPause:
    def test_a_project_without_an_open_pause_has_none(self, queries, reader):
        reader.list_projects.return_value = [a_record(current_phase=2)]

        assert queries.portfolio().entries[0].pause is None

    def test_an_open_pause_carries_reason_date_and_overdue_for_today_utc(self, queries, reader):
        reader.list_projects.return_value = [
            a_record(
                current_phase=2,
                paused=True,
                pause_reason="client_wait",
                pause_expected_resumption=date(2026, 10, 20),
            )
        ]

        entry = queries.portfolio().entries[0]

        assert entry.status == "paused"
        assert (entry.pause.reason, entry.pause.expected_resumption) == (
            "client_wait",
            date(2026, 10, 20),
        )
        assert (entry.pause.overdue, entry.pause.days_overdue) == (True, 4)

    def test_a_pause_due_today_is_not_overdue(self, queries, reader):
        reader.list_projects.return_value = [
            a_record(
                current_phase=2,
                paused=True,
                pause_reason="other",
                pause_expected_resumption=date(2026, 10, 24),
            )
        ]

        pause = queries.portfolio().entries[0].pause

        assert (pause.overdue, pause.days_overdue) == (False, 0)

    def test_the_flag_alone_is_paused_without_pause_details(self, queries, reader):
        reader.list_projects.return_value = [a_record(current_phase=2, paused=True)]

        entry = queries.portfolio().entries[0]

        assert (entry.status, entry.pause) == ("paused", None)


class TestProject:
    def test_returns_code_name_and_phase(self, queries, reader):
        reader.find.return_value = a_record(current_phase=3)

        project = queries.project("PRY-2026-001")

        assert (project.code, project.name, project.current_phase) == (
            "PRY-2026-001",
            "House (sample)",
            3,
        )
        reader.find.assert_called_once_with("PRY-2026-001")

    def test_carries_the_project_type_of_the_opportunity(self, queries, reader):
        reader.find.return_value = a_record(project_type="industrial")

        assert queries.project("PRY-2026-001").project_type == "industrial"

    def test_unknown_code_is_not_found(self, queries, reader):
        reader.find.return_value = None

        with pytest.raises(ProjectNotFound) as info:
            queries.project("PRY-2026-009")

        assert info.value.code == "project_not_found"
        assert str(info.value) == "No existe el proyecto PRY-2026-009."

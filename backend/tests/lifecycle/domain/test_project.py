import dataclasses

import pytest

from backend.app.lifecycle.domain.project import IncompleteProject, Project, TrafficLight


def a_project(**overrides):
    values = {
        "study_id": "demo-study",
        "code": "PRY-EJ-001",
        "name": "Single-family house (sample)",
        "current_phase": 0,
    }
    return Project(**{**values, **overrides})


def an_active_project(**overrides):
    values = {
        "active": True,
        "responsible_id": "demo-user",
        "next_milestone": "Briefing delivery",
        "traffic_light": TrafficLight.GREEN,
    }
    return a_project(**{**values, **overrides})


class TestProject:
    def test_starts_inactive_and_not_paused(self):
        project = a_project()

        assert (project.active, project.paused) == (False, False)

    @pytest.mark.parametrize("phase", [-1, 8])
    def test_phase_must_be_between_zero_and_seven(self, phase):
        with pytest.raises(ValueError):
            a_project(current_phase=phase)

    @pytest.mark.parametrize("field", ["study_id", "code", "name"])
    def test_rejects_blank_identity_fields(self, field):
        with pytest.raises(ValueError):
            a_project(**{field: "  "})

    def test_is_immutable(self):
        project = a_project()

        with pytest.raises(dataclasses.FrozenInstanceError):
            project.current_phase = 1


class TestActive:
    def test_active_project_with_everything_is_valid(self):
        project = an_active_project()

        assert project.active is True

    @pytest.mark.parametrize(
        ("field", "label"),
        [
            ("responsible_id", "responsable"),
            ("next_milestone", "próximo hito"),
            ("traffic_light", "semáforo"),
        ],
    )
    def test_active_requires_each_field_and_names_what_is_missing(self, field, label):
        with pytest.raises(IncompleteProject) as error:
            an_active_project(**{field: None})

        assert error.value.missing == [label]

    def test_lists_everything_that_is_missing(self):
        with pytest.raises(IncompleteProject) as error:
            a_project(active=True)

        assert error.value.missing == ["responsable", "próximo hito", "semáforo"]

    def test_blank_milestone_counts_as_missing(self):
        with pytest.raises(IncompleteProject):
            an_active_project(next_milestone="  ")

    def test_inactive_project_can_be_incomplete(self):
        project = a_project(responsible_id=None, next_milestone=None, traffic_light=None)

        assert project.missing_for_activation() == ["responsable", "próximo hito", "semáforo"]

import dataclasses

import pytest

from backend.app.audit.domain.event import AuditEvent, Outcome


def an_event(**overrides):
    values = {
        "study_id": "demo-study",
        "user_id": "demo-user",
        "entity": "project",
        "entity_id": "PRY-EJ-001",
        "action": "promote",
    }
    return AuditEvent(**{**values, **overrides})


class TestAuditEvent:
    def test_defaults_to_successful_without_values_or_version(self):
        event = an_event()

        assert (event.outcome, event.version, event.old_value, event.new_value) == (
            Outcome.OK,
            None,
            None,
            None,
        )

    def test_keeps_before_and_after_values(self):
        event = an_event(old_value={"phase": 2}, new_value={"phase": 3}, version=4)

        assert (event.old_value, event.new_value, event.version) == (
            {"phase": 2},
            {"phase": 3},
            4,
        )

    @pytest.mark.parametrize("field", ["study_id", "user_id", "entity", "entity_id", "action"])
    @pytest.mark.parametrize("blank", ["", "  "])
    def test_rejects_blank_required_fields(self, field, blank):
        with pytest.raises(ValueError):
            an_event(**{field: blank})

    @pytest.mark.parametrize("version", [0, -1])
    def test_rejects_non_positive_version(self, version):
        with pytest.raises(ValueError):
            an_event(version=version)

    def test_is_immutable(self):
        event = an_event()

        with pytest.raises(dataclasses.FrozenInstanceError):
            event.action = "otra"

from unittest.mock import create_autospec

from backend.app.lifecycle.domain.deliverable import ExitDeliverable
from backend.app.lifecycle.domain.ports import DeliverableValidator


def a_deliverable(**overrides):
    values = {
        "phase": 2,
        "content": {"titulo": "Brief (sample)"},
        "complete": True,
        "approved": True,
    }
    return ExitDeliverable(**{**values, **overrides})


class TestMissing:
    def test_complete_and_approved_has_nothing_missing(self):
        assert a_deliverable().missing() == []

    def test_reports_when_it_is_not_complete(self):
        assert a_deliverable(complete=False, approved=False).missing() == [
            "entregable de salida completo",
            "aprobación del entregable",
        ]

    def test_reports_when_it_is_complete_but_not_approved(self):
        assert a_deliverable(approved=False).missing() == ["aprobación del entregable"]

    def test_adds_what_the_phase_validator_finds(self):
        validator = create_autospec(DeliverableValidator, spec_set=True, instance=True)
        validator.validate.return_value = ["referencia catastral"]
        deliverable = a_deliverable()

        missing = deliverable.missing(validator)

        validator.validate.assert_called_once_with({"titulo": "Brief (sample)"})
        assert missing == ["referencia catastral"]

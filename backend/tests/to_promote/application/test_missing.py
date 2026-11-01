"""What is missing from the exit deliverable of each phase, reusing the existing rules."""

from backend.app.lifecycle.domain.ports import DeliverableValidator
from backend.app.to_promote.application.missing import missing_for
from backend.tests.to_promote.support import (
    COMPLETE_BRIEF,
    COMPLETE_MANUAL_SHEET,
    a_candidate,
    a_deliverable,
    a_sheet_inputs,
    a_technical_inputs,
)


class TestPhase0:
    def test_a_saved_scoring_leaves_nothing_missing(self):
        assert missing_for(a_candidate(0, scored=True)) == []

    def test_without_a_scoring_it_is_missing(self):
        assert missing_for(a_candidate(0, scored=False)) == ["Scoring de la oportunidad"]


class TestPhase1:
    def test_a_complete_sheet_leaves_nothing_missing(self):
        sheet = a_sheet_inputs(COMPLETE_MANUAL_SHEET)

        assert missing_for(a_candidate(1, sheet=sheet)) == []

    def test_the_missing_required_fields_are_named_in_display_order(self):
        stored = {**COMPLETE_MANUAL_SHEET}
        del stored["scope_included"]
        del stored["main_risk"]

        found = missing_for(a_candidate(1, sheet=a_sheet_inputs(stored)))

        assert found == ["Alcance incluido", "Riesgo principal"]

    def test_an_untouched_sheet_lists_everything_manual(self):
        found = missing_for(a_candidate(1, sheet=a_sheet_inputs(None)))

        assert "Referencia catastral" in found
        assert len(found) == len(COMPLETE_MANUAL_SHEET)

    def test_a_missing_confirmed_plan_is_listed(self):
        sheet = a_sheet_inputs(COMPLETE_MANUAL_SHEET, with_plan=False)

        assert missing_for(a_candidate(1, sheet=sheet)) == ["Escala", "Plan confirmado"]


class TestPhase2:
    def test_a_complete_brief_with_technical_data_leaves_nothing_missing(self):
        technical = a_technical_inputs()
        deliverable = a_deliverable(2, False, False, {"brief": COMPLETE_BRIEF})

        assert missing_for(a_candidate(2, deliverable=deliverable, technical=technical)) == []

    def test_an_empty_brief_lists_its_fields_the_data_and_the_approval(self):
        found = missing_for(a_candidate(2, technical=a_technical_inputs(with_value=False)))

        assert found == [
            "Necesidades",
            "Programa",
            "Condicionantes",
            "Presupuesto objetivo",
            "Plazo",
            "Datos técnicos obtenidos",
            "Aprobación del cliente registrada",
        ]

    def test_the_approval_alone_can_be_what_is_missing(self):
        brief = {**COMPLETE_BRIEF, "client_approval": "pending"}
        deliverable = a_deliverable(2, False, False, {"brief": brief})

        found = missing_for(a_candidate(2, deliverable=deliverable, technical=a_technical_inputs()))

        assert found == ["Aprobación del cliente registrada"]

    def test_the_flags_of_the_deliverable_do_not_matter_before_promoting(self):
        deliverable = a_deliverable(2, True, True, {"brief": {}})

        found = missing_for(a_candidate(2, deliverable=deliverable, technical=a_technical_inputs()))

        assert "Necesidades" in found


class TestPhases3To6:
    def test_a_complete_and_approved_deliverable_leaves_nothing_missing(self):
        for phase in (3, 4, 5, 6):
            assert missing_for(a_candidate(phase, deliverable=a_deliverable(phase))) == []

    def test_without_a_deliverable_row_it_is_missing(self):
        for phase in (3, 4, 5, 6):
            assert missing_for(a_candidate(phase)) == ["entregable de salida"]

    def test_an_incomplete_deliverable_lists_what_the_promotion_would_ask(self):
        found = missing_for(a_candidate(3, deliverable=a_deliverable(3, False, False)))

        assert found == ["entregable de salida completo", "aprobación del entregable"]

    def test_a_complete_but_unapproved_deliverable_misses_the_approval(self):
        found = missing_for(a_candidate(4, deliverable=a_deliverable(4, True, False)))

        assert found == ["aprobación del entregable"]

    def test_the_validator_registered_for_the_phase_is_applied(self):
        class Rejecting:
            def validate(self, content):
                return ["Licencia concedida"]

        validators: dict[int, DeliverableValidator] = {4: Rejecting()}

        found = missing_for(a_candidate(4, deliverable=a_deliverable(4)), validators)

        assert found == ["Licencia concedida"]

    def test_the_default_validators_are_the_ones_the_promotion_uses(self):
        from backend.app.lifecycle.application.validators import VALIDATORS_BY_PHASE
        from backend.app.to_promote.application import missing

        assert missing.VALIDATORS_BY_PHASE is VALIDATORS_BY_PHASE

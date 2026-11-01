"""Brief rules of RGB-32 (pure domain): validation, completeness and permissions.

Names fixed here: backend.app.briefing.domain.brief with BRIEF_PHASE (2), BRIEF_KEY, EDITABLE_FIELDS,
REQUIRED_FIELDS, ClientApproval, Brief, build_brief, validate_brief_update, completeness,
Completeness, brief_permissions, BriefPermissions; and backend.app.briefing.domain.errors.
"""

import math

import pytest

from backend.app.briefing.domain.brief import (
    BRIEF_PHASE,
    EDITABLE_FIELDS,
    REQUIRED_FIELDS,
    ClientApproval,
    brief_permissions,
    build_brief,
    completeness,
    validate_brief_update,
)
from backend.app.briefing.domain.errors import (
    InvalidBriefField,
    InvalidBriefRequest,
    UnknownBriefField,
)

FILLED = {
    "needs": "Needs (sample)",
    "program": "Program (sample)",
    "constraints": "Constraints (sample)",
    "target_budget": 250000,
    "deadline": "2027-06-30",
    "client_approval": "email",
}


class TestFieldsAndDefaults:
    def test_required_and_optional_fields(self):
        assert REQUIRED_FIELDS == ("needs", "program", "constraints", "target_budget", "deadline")
        assert EDITABLE_FIELDS == (
            *REQUIRED_FIELDS,
            "topographic_survey",
            "alignment",
            "client_approval",
        )
        assert BRIEF_PHASE == 2

    def test_an_empty_brief_has_every_field_empty_and_approval_pending(self):
        brief = build_brief(None)

        assert list(brief.fields) == list(EDITABLE_FIELDS)
        assert brief.fields["client_approval"] == "pending"
        assert [name for name, value in brief.fields.items() if value is None] == [
            *REQUIRED_FIELDS,
            "topographic_survey",
            "alignment",
        ]

    def test_stored_values_are_read_back_and_blank_text_counts_as_empty(self):
        brief = build_brief({**FILLED, "alignment": "   "})

        assert brief.fields["needs"] == "Needs (sample)"
        assert brief.fields["alignment"] is None
        assert brief.fields["client_approval"] == "email"

    def test_client_approval_values(self):
        assert [a.value for a in ClientApproval] == ["pending", "email", "meeting", "signed"]


class TestValidation:
    def test_valid_values_are_normalized(self):
        update = validate_brief_update(
            {"needs": "  Needs (sample)  ", "target_budget": 1200.5, "deadline": "2027-02-28"}
        )

        assert update == {
            "needs": "Needs (sample)",
            "target_budget": 1200.5,
            "deadline": "2027-02-28",
        }

    def test_blank_or_null_deletes_the_field(self):
        assert validate_brief_update({"needs": "  ", "alignment": None, "target_budget": None}) == {
            "needs": None,
            "alignment": None,
            "target_budget": None,
        }

    def test_a_whole_budget_is_stored_as_an_integer(self):
        assert validate_brief_update({"target_budget": 1000.0})["target_budget"] == 1000
        assert isinstance(validate_brief_update({"target_budget": 1000.0})["target_budget"], int)

    @pytest.mark.parametrize("fields", [None, [], "x", 3, {}])
    def test_the_request_must_be_a_non_empty_object(self, fields):
        with pytest.raises(InvalidBriefRequest) as raised:
            validate_brief_update(fields)

        assert raised.value.code == "invalid_request"

    @pytest.mark.parametrize("name", ["code", "phase", "completeness", "NEEDS", ""])
    def test_unknown_fields_are_rejected(self, name):
        with pytest.raises(UnknownBriefField) as raised:
            validate_brief_update({name: "x"})

        assert raised.value.code == "unknown_field"
        assert raised.value.field == name

    @pytest.mark.parametrize("value", [1, True, ["a"], {"a": 1}, 2.5])
    def test_text_fields_must_be_text(self, value):
        with pytest.raises(InvalidBriefField) as raised:
            validate_brief_update({"program": value})

        assert raised.value.code == "invalid_field"
        assert raised.value.field == "program"
        assert "Programa" in raised.value.message
        assert "debe ser un texto" in raised.value.message

    def test_text_length_limit(self):
        assert validate_brief_update({"constraints": "x" * 2000})["constraints"] == "x" * 2000
        with pytest.raises(InvalidBriefField) as raised:
            validate_brief_update({"constraints": "x" * 2001})
        assert "2000" in raised.value.message

    @pytest.mark.parametrize("text", ["a\x00b", "a\ud800b"])
    def test_unstorable_characters_are_rejected(self, text):
        with pytest.raises(InvalidBriefField) as raised:
            validate_brief_update({"topographic_survey": text})

        assert "caracteres no permitidos" in raised.value.message

    @pytest.mark.parametrize(
        "value", [0, -1, 0.001, 1.234, 1_000_000_001, True, False, "100", [], math.inf, math.nan]
    )
    def test_the_budget_must_be_a_bounded_positive_number_with_two_decimals_at_most(self, value):
        with pytest.raises(InvalidBriefField) as raised:
            validate_brief_update({"target_budget": value})

        assert raised.value.field == "target_budget"
        assert "Presupuesto objetivo" in raised.value.message

    @pytest.mark.parametrize("value", [0.01, 1, 1_000_000_000, 99999.99])
    def test_budget_bounds_are_inclusive(self, value):
        assert validate_brief_update({"target_budget": value}) == {"target_budget": value}

    @pytest.mark.parametrize(
        "value",
        ["30/06/2027", "2027-6-30", "2027-02-30", "2027-13-01", "1999-12-31", "2101-01-01", 2027],
    )
    def test_the_deadline_is_a_real_iso_date(self, value):
        with pytest.raises(InvalidBriefField) as raised:
            validate_brief_update({"deadline": value})

        assert raised.value.field == "deadline"
        assert "AAAA-MM-DD" in raised.value.message or "texto" in raised.value.message

    @pytest.mark.parametrize("value", ["2000-01-01", "2100-12-31", "2028-02-29"])
    def test_deadline_bounds(self, value):
        assert validate_brief_update({"deadline": value}) == {"deadline": value}

    @pytest.mark.parametrize("value", ["signed", "email", "meeting", "pending"])
    def test_a_known_approval_is_accepted(self, value):
        assert validate_brief_update({"client_approval": value}) == {"client_approval": value}

    @pytest.mark.parametrize("value", ["Signed", "verbal", 1, True, ""])
    def test_an_unknown_approval_is_rejected(self, value):
        if value == "":
            assert validate_brief_update({"client_approval": value}) == {"client_approval": None}
            return
        with pytest.raises(InvalidBriefField) as raised:
            validate_brief_update({"client_approval": value})

        assert raised.value.field == "client_approval"
        assert "Aprobación del cliente" in raised.value.message

    def test_the_first_unknown_field_wins_over_invalid_values(self):
        with pytest.raises(UnknownBriefField):
            validate_brief_update({"needs": 3, "bogus": "x"})


class TestCompleteness:
    def test_a_full_brief_with_data_and_approval_is_complete(self):
        result = completeness(
            build_brief(FILLED), technical_data_obtained=True, technical_data_queried=True
        )

        assert result.missing == []
        assert result.complete is True
        assert result.blockers() == []

    def test_missing_required_fields_are_listed_by_label_in_order(self):
        result = completeness(
            build_brief({"program": "x", "client_approval": "signed"}),
            technical_data_obtained=True,
            technical_data_queried=False,
        )

        assert result.missing == [
            "Necesidades",
            "Condicionantes",
            "Presupuesto objetivo",
            "Plazo",
        ]
        assert result.complete is False

    def test_pending_approval_blocks(self):
        result = completeness(
            build_brief({**FILLED, "client_approval": "pending"}),
            technical_data_obtained=True,
            technical_data_queried=True,
        )

        assert result.client_approval_recorded is False
        assert result.blockers() == ["Aprobación del cliente registrada"]

    def test_no_technical_data_blocks(self):
        result = completeness(
            build_brief(FILLED), technical_data_obtained=False, technical_data_queried=True
        )

        assert result.technical_data_obtained is False
        assert result.technical_data_queried is True
        assert result.blockers() == ["Datos técnicos obtenidos"]

    def test_blockers_are_fields_then_technical_data_then_approval(self):
        result = completeness(
            build_brief(None), technical_data_obtained=False, technical_data_queried=False
        )

        assert result.blockers() == [
            "Necesidades",
            "Programa",
            "Condicionantes",
            "Presupuesto objetivo",
            "Plazo",
            "Datos técnicos obtenidos",
            "Aprobación del cliente registrada",
        ]

    def test_optional_fields_never_block(self):
        result = completeness(
            build_brief(FILLED), technical_data_obtained=True, technical_data_queried=False
        )

        assert result.complete is True


class TestPermissions:
    def done(self):
        return completeness(
            build_brief(FILLED), technical_data_obtained=True, technical_data_queried=True
        )

    def test_authority_in_phase_2_can_edit_and_promote_when_complete(self):
        permissions = brief_permissions(phase=2, authorized=True, completeness=self.done())

        assert (permissions.can_edit, permissions.can_promote) == (True, True)

    def test_incomplete_cannot_promote(self):
        pending = completeness(
            build_brief(None), technical_data_obtained=False, technical_data_queried=False
        )

        permissions = brief_permissions(phase=2, authorized=True, completeness=pending)

        assert (permissions.can_edit, permissions.can_promote) == (True, False)

    def test_without_authority_nothing(self):
        permissions = brief_permissions(phase=2, authorized=False, completeness=self.done())

        assert (permissions.can_edit, permissions.can_promote) == (False, False)

    @pytest.mark.parametrize("phase", [0, 1, 3, 7])
    def test_outside_phase_2_nothing(self, phase):
        permissions = brief_permissions(phase=phase, authorized=True, completeness=self.done())

        assert (permissions.can_edit, permissions.can_promote) == (False, False)

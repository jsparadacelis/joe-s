"""Opportunity validation: every field, first error in contract order."""

from datetime import date
from decimal import Decimal

import pytest

from backend.app.opportunity.domain.errors import InvalidField, OpportunityError, RequiredField
from backend.app.opportunity.domain.opportunity import Opportunity
from backend.app.opportunity.domain.plan import ProjectType

ORDER = [
    "name",
    "client",
    "location",
    "project_type",
    "owner",
    "estimated_budget",
    "deadline",
    "source",
    "decision_date",
]


def valid(**overrides):
    data = {
        "name": "Warehouse (sample)",
        "client": "Client (sample)",
        "location": "Town (sample)",
        "project_type": "industrial",
        "owner": "Owner (sample)",
    }
    data.update(overrides)
    return data


def rejected(**overrides) -> OpportunityError:
    with pytest.raises(OpportunityError) as info:
        Opportunity.from_input(valid(**overrides))
    return info.value


class TestValid:
    def test_minimal_input_leaves_optional_fields_empty(self):
        opportunity = Opportunity.from_input(valid())

        assert opportunity.name == "Warehouse (sample)"
        assert opportunity.project_type is ProjectType.INDUSTRIAL
        assert opportunity.estimated_budget is None
        assert opportunity.deadline is None
        assert opportunity.source is None
        assert opportunity.decision_date is None

    def test_full_input_is_parsed(self):
        opportunity = Opportunity.from_input(
            valid(
                estimated_budget=125000.5,
                deadline="2026-12-31",
                source="Referral (sample)",
                decision_date="2026-11-15",
            )
        )

        assert opportunity.estimated_budget == Decimal("125000.5")
        assert opportunity.deadline == date(2026, 12, 31)
        assert opportunity.source == "Referral (sample)"
        assert opportunity.decision_date == date(2026, 11, 15)

    def test_text_is_stripped(self):
        assert Opportunity.from_input(valid(name="  Plot  ")).name == "Plot"

    def test_blank_optional_values_count_as_empty(self):
        opportunity = Opportunity.from_input(valid(source="  ", deadline="", decision_date=None))

        assert opportunity.source is None
        assert opportunity.deadline is None
        assert opportunity.decision_date is None

    @pytest.mark.parametrize("budget", [0, 0.0, 1_000_000_000, 10.25, Decimal("3.10")])
    def test_budget_limits_are_inclusive(self, budget):
        assert Opportunity.from_input(valid(estimated_budget=budget)).estimated_budget is not None

    def test_limits_are_inclusive_for_lengths(self):
        Opportunity.from_input(
            valid(name="n" * 120, client="c" * 120, location="l" * 200, owner="o" * 120)
        )
        Opportunity.from_input(valid(source="s" * 120))


class TestRequired:
    @pytest.mark.parametrize("field", ["name", "client", "location", "project_type", "owner"])
    @pytest.mark.parametrize("value", [None, "", "   "])
    def test_blank_or_null_is_required(self, field, value):
        error = rejected(**{field: value})

        assert isinstance(error, RequiredField)
        assert error.code == "required_field"
        assert error.field == field

    @pytest.mark.parametrize("field", ["name", "client", "location", "project_type", "owner"])
    def test_absent_key_is_required(self, field):
        data = valid()
        del data[field]

        with pytest.raises(RequiredField) as info:
            Opportunity.from_input(data)

        assert info.value.field == field

    @pytest.mark.parametrize(
        ("field", "label"),
        [
            ("name", "Nombre"),
            ("client", "Cliente"),
            ("location", "Localización"),
            ("project_type", "Tipología"),
            ("owner", "Responsable"),
        ],
    )
    def test_message_uses_the_spanish_label(self, field, label):
        assert rejected(**{field: None}).message == f"El campo «{label}» es obligatorio."


class TestInvalid:
    @pytest.mark.parametrize(
        ("field", "value"),
        [
            ("name", "n" * 121),
            ("name", 5),
            ("client", "c" * 121),
            ("location", "l" * 201),
            ("owner", "o" * 121),
            ("owner", ["x"]),
            ("project_type", "castle"),
            ("project_type", 3),
            ("source", "s" * 121),
            ("source", 7),
            ("estimated_budget", -1),
            ("estimated_budget", 1_000_000_000.01),
            ("estimated_budget", 10.123),
            ("estimated_budget", "100"),
            ("estimated_budget", True),
            ("estimated_budget", float("nan")),
            ("estimated_budget", float("inf")),
            ("deadline", "31/12/2026"),
            ("deadline", "2026-13-01"),
            ("deadline", "2026-02-30"),
            ("deadline", "20261231"),
            ("deadline", 20261231),
            ("decision_date", "tomorrow"),
        ],
    )
    def test_invalid_value_names_the_field(self, field, value):
        error = rejected(**{field: value})

        assert isinstance(error, InvalidField)
        assert error.code == "invalid_field"
        assert error.field == field

    @pytest.mark.parametrize("field", ["name", "client", "location", "owner", "source"])
    @pytest.mark.parametrize("value", ["a\x00b", "lone \ud800 surrogate"])
    def test_characters_postgres_cannot_store_are_invalid(self, field, value):
        # Found by the Tester: a NUL byte in the name made the real API answer 500.
        error = rejected(**{field: value})

        assert isinstance(error, InvalidField)
        assert error.field == field

    def test_message_has_label_and_reason(self):
        error = rejected(name="n" * 121)

        assert error.message.startswith("El campo «Nombre» no es válido: ")
        assert error.message.endswith(".")
        assert "120" in error.message

    @pytest.mark.parametrize(
        ("field", "value", "label"),
        [
            ("project_type", "castle", "Tipología"),
            ("estimated_budget", -1, "Presupuesto estimado"),
            ("deadline", "x", "Plazo"),
            ("source", "s" * 121, "Fuente"),
            ("decision_date", "x", "Fecha de decisión"),
        ],
    )
    def test_labels(self, field, value, label):
        message = rejected(**{field: value}).message

        assert message.startswith(f"El campo «{label}» no es válido: ")


class TestOrder:
    def test_a_blank_required_field_wins_over_later_invalid_ones(self):
        with pytest.raises(OpportunityError) as info:
            Opportunity.from_input(
                valid(name="", location="l" * 201, owner=None, estimated_budget=-5)
            )

        assert info.value.field == "name"
        assert info.value.code == "required_field"

    def test_later_fields_are_reported_when_earlier_ones_are_valid(self):
        error = rejected(deadline="x", decision_date="y", estimated_budget=-1)

        assert error.field == "estimated_budget"

    def test_all_fields_are_checked_in_contract_order(self):
        broken = {
            "name": None,
            "client": None,
            "location": None,
            "project_type": None,
            "owner": None,
            "estimated_budget": -1,
            "deadline": "x",
            "source": "s" * 121,
            "decision_date": "x",
        }
        reported = []
        for _ in ORDER:
            with pytest.raises(OpportunityError) as info:
                Opportunity.from_input(broken)
            reported.append(info.value.field)
            broken = {**broken, info.value.field: valid().get(info.value.field)}

        assert reported == ORDER

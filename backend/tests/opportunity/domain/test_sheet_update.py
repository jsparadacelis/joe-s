"""Sheet edition (RGB-17b): pure validation of the update and the saved plan over the baseline.

Names fixed here for the Developer (backend/app/opportunity/domain/project_sheet.py):
- EDITABLE_FIELDS: the 13 `manual` fields of the sheet (code, name, client, location, project_type,
  scale, confirmed_plan and traffic_light are not editable).
- validate_sheet_update(fields, plan) -> SheetUpdate(fields: dict[str, str | None],
  plan: ProposedPlan | None). `fields` and `plan` are raw request values (Any). Values are
  trimmed; None or blank means "delete" and is returned as None. Dates are strict YYYY-MM-DD.
  Text limits: 2000 chars (scope_included, scope_excluded, main_risk), 200 the rest. Unknown or
  non-editable keys are checked first, then values in the order received, then the plan
  (project_type, scale, weeks). At least one of fields/plan must be given.
- Errors (backend/app/opportunity/domain/errors.py), all with Spanish `message`:
  UnknownSheetField(field) code "unknown_field"; InvalidSheetField(field, reason) code
  "invalid_field" with `.field`; InvalidProjectType code "invalid_project_type" (also an
  InvalidWeeks/InvalidScale from plan.py); InvalidSheetRequest code "invalid_request";
  SheetNotEditable code "sheet_not_editable".
- build_sheet applies manual["plan"] ({project_type, scale, weeks, total}) over the baseline:
  the project_type, scale and confirmed_plan fields show the saved plan.
"""

from datetime import datetime, timezone

import pytest

from backend.app.opportunity.domain.errors import (
    InvalidProjectType,
    InvalidScale,
    InvalidSheetField,
    InvalidSheetRequest,
    InvalidWeeks,
    SheetNotEditable,
    UnknownSheetField,
)
from backend.app.opportunity.domain.plan import ProjectType, Scale
from backend.app.opportunity.domain.project_plan import ConfirmedPlan, ProposedPlan
from backend.app.opportunity.domain.project_sheet import (
    EDITABLE_FIELDS,
    SheetProject,
    SheetUpdate,
    build_sheet,
    validate_sheet_update,
)

CODE = "PRY-2026-001"
PLAN = {"project_type": "rehabilitation", "scale": "large", "weeks": [3, 4, 6, 8, 9, 40, 5]}
DATE_FIELDS = ["contract_signed_on", "next_milestone_on"]
LONG_FIELDS = ["scope_included", "scope_excluded", "main_risk"]
SHORT_FIELDS = sorted(set(EDITABLE_FIELDS) - set(LONG_FIELDS) - set(DATE_FIELDS))


def test_the_editable_fields_are_the_manual_ones():
    assert set(EDITABLE_FIELDS) == {
        "cadastral_reference",
        "scope_included",
        "scope_excluded",
        "contract_signed_on",
        "sponsor",
        "project_director",
        "technical_lead",
        "team",
        "external_collaborators",
        "contact",
        "next_milestone",
        "next_milestone_on",
        "main_risk",
        "risk_owner",
        "repository_path",
    }


class TestFields:
    def test_valid_values_are_trimmed(self):
        result = validate_sheet_update(
            {"sponsor": "  Sponsor (sample)  ", "contract_signed_on": "2026-11-03"}, None
        )

        assert isinstance(result, SheetUpdate)
        assert result.fields == {"sponsor": "Sponsor (sample)", "contract_signed_on": "2026-11-03"}
        assert result.plan is None

    @pytest.mark.parametrize("blank", [None, "", "   "])
    @pytest.mark.parametrize("field", ["team", "sponsor", "contract_signed_on"])
    def test_blank_deletes_the_value(self, field, blank):
        assert validate_sheet_update({field: blank}, None).fields == {field: None}

    def test_the_repository_path_is_free_text(self):
        value = "//server/Projects/2026/Warehouse (sample) - C:\\x"

        assert validate_sheet_update({"repository_path": value}, None).fields == {
            "repository_path": value
        }

    @pytest.mark.parametrize(
        "field", ["code", "name", "client", "location", "project_type", "scale", "traffic_light"]
    )
    def test_prefilled_fields_are_not_editable(self, field):
        with pytest.raises(UnknownSheetField) as error:
            validate_sheet_update({field: "x"}, None)

        assert error.value.code == "unknown_field"
        assert error.value.field == field
        assert error.value.message

    @pytest.mark.parametrize("field", ["confirmed_plan", "plan", "nonsense", ""])
    def test_unknown_fields_are_rejected(self, field):
        with pytest.raises(UnknownSheetField) as error:
            validate_sheet_update({field: "x"}, None)

        assert error.value.field == field

    def test_unknown_fields_are_checked_before_values(self):
        with pytest.raises(UnknownSheetField):
            validate_sheet_update({"sponsor": 5, "nonsense": "x"}, None)

    @pytest.mark.parametrize("field", LONG_FIELDS)
    def test_long_texts_allow_2000_characters(self, field):
        assert validate_sheet_update({field: "a" * 2000}, None).fields[field] == "a" * 2000
        with pytest.raises(InvalidSheetField) as error:
            validate_sheet_update({field: "a" * 2001}, None)
        assert error.value.code == "invalid_field"
        assert error.value.field == field
        assert error.value.message

    @pytest.mark.parametrize("field", SHORT_FIELDS)
    def test_other_texts_allow_200_characters(self, field):
        assert validate_sheet_update({field: "a" * 200}, None).fields[field] == "a" * 200
        with pytest.raises(InvalidSheetField) as error:
            validate_sheet_update({field: "a" * 201}, None)
        assert error.value.field == field

    def test_the_length_counts_after_trimming(self):
        assert validate_sheet_update({"sponsor": " " + "a" * 200 + " "}, None).fields == {
            "sponsor": "a" * 200
        }

    @pytest.mark.parametrize("value", [5, 1.5, True, ["a"], {"a": "b"}])
    def test_a_value_that_is_not_text_is_invalid(self, value):
        with pytest.raises(InvalidSheetField) as error:
            validate_sheet_update({"sponsor": value}, None)

        assert error.value.field == "sponsor"

    @pytest.mark.parametrize("field", DATE_FIELDS)
    @pytest.mark.parametrize(
        "value", ["03/11/2026", "2026-2-3", "20261103", "2026-02-30", "2026-13-01", "mañana", "x"]
    )
    def test_dates_must_be_valid_iso_dates(self, field, value):
        with pytest.raises(InvalidSheetField) as error:
            validate_sheet_update({field: value}, None)

        assert error.value.field == field

    def test_the_first_invalid_value_is_reported(self):
        with pytest.raises(InvalidSheetField) as error:
            validate_sheet_update({"sponsor": "ok", "team": 3, "contact": 4}, None)

        assert error.value.field == "team"

    def test_the_message_is_in_spanish_and_names_the_field(self):
        with pytest.raises(InvalidSheetField) as error:
            validate_sheet_update({"contract_signed_on": "x"}, None)

        assert "fecha de firma" in error.value.message.lower()


class TestPlan:
    def test_a_valid_plan(self):
        result = validate_sheet_update(None, PLAN)

        assert result.fields == {}
        assert result.plan == ProposedPlan(
            ProjectType.REHABILITATION, Scale.LARGE, (3, 4, 6, 8, 9, 40, 5)
        )
        assert result.plan.total == 75

    def test_fields_and_plan_together(self):
        result = validate_sheet_update({"team": ""}, PLAN)

        assert result.fields == {"team": None}
        assert result.plan is not None

    @pytest.mark.parametrize("project_type", ["house", "", None, 3, "RESIDENTIAL"])
    def test_invalid_project_type(self, project_type):
        with pytest.raises(InvalidProjectType) as error:
            validate_sheet_update(None, {**PLAN, "project_type": project_type})

        assert error.value.code == "invalid_project_type"
        assert error.value.message

    def test_missing_project_type(self):
        with pytest.raises(InvalidProjectType):
            validate_sheet_update(None, {"scale": "large", "weeks": PLAN["weeks"]})

    @pytest.mark.parametrize("scale", ["huge", "", None, 2])
    def test_invalid_scale(self, scale):
        with pytest.raises(InvalidScale):
            validate_sheet_update(None, {**PLAN, "scale": scale})

    @pytest.mark.parametrize(
        "weeks",
        [None, [], [1] * 6, [1] * 8, [0] * 7, [521] + [1] * 6, [1.5] * 7, ["3"] * 7, [True] * 7],
    )
    def test_invalid_weeks(self, weeks):
        with pytest.raises(InvalidWeeks):
            validate_sheet_update(None, {**PLAN, "weeks": weeks})

    def test_project_type_is_checked_before_scale_and_scale_before_weeks(self):
        with pytest.raises(InvalidProjectType):
            validate_sheet_update(None, {"project_type": "x", "scale": "x", "weeks": 1})
        with pytest.raises(InvalidScale):
            validate_sheet_update(None, {**PLAN, "scale": "x", "weeks": 1})

    def test_fields_are_validated_before_the_plan(self):
        with pytest.raises(InvalidSheetField):
            validate_sheet_update({"sponsor": 5}, {**PLAN, "scale": "x"})


class TestRequestShape:
    @pytest.mark.parametrize("fields, plan", [(None, None), ({}, None), ({}, {})])
    def test_at_least_one_of_fields_or_plan(self, fields, plan):
        with pytest.raises(InvalidSheetRequest) as error:
            validate_sheet_update(fields, plan)

        assert error.value.code == "invalid_request"
        assert error.value.message

    @pytest.mark.parametrize("fields", ["sponsor", ["sponsor"], 3])
    def test_fields_must_be_an_object(self, fields):
        with pytest.raises(InvalidSheetRequest):
            validate_sheet_update(fields, None)

    @pytest.mark.parametrize("plan", ["large", [1, 2], 3])
    def test_plan_must_be_an_object(self, plan):
        with pytest.raises(InvalidSheetRequest):
            validate_sheet_update({"team": "x"}, plan)


def test_sheet_not_editable_error():
    error = SheetNotEditable()

    assert error.code == "sheet_not_editable"
    assert "fase 1" in error.message


def a_project():
    return SheetProject(
        id="project-1",
        code=CODE,
        current_phase=1,
        name="Warehouse (sample)",
        client="Client (sample)",
        location="Town (sample)",
        project_type=ProjectType.INDUSTRIAL,
        traffic_light=None,
    )


def a_baseline():
    return ConfirmedPlan(
        project_code=CODE,
        project_type=ProjectType.INDUSTRIAL,
        scale=Scale.MEDIUM,
        weeks=(2, 2, 4, 5, 8, 40, 4),
        confirmed_by="sample-user",
        confirmed_at=datetime(2026, 10, 24, 10, 0, tzinfo=timezone.utc),
    )


def values(sheet):
    return {f.field: f.value for b in sheet.blocks for f in b.fields}


class TestSavedPlanOverTheBaseline:
    SAVED = {
        "project_type": "rehabilitation",
        "scale": "large",
        "weeks": [3, 4, 6, 8, 9, 40, 5],
        "total": 75,
    }

    def test_the_saved_plan_wins_over_the_baseline(self):
        sheet = build_sheet(project=a_project(), plan=a_baseline(), manual={"plan": self.SAVED})

        found = values(sheet)
        assert found["project_type"] == "rehabilitation"
        assert found["scale"] == "large"
        assert found["confirmed_plan"] == {
            "weeks_by_phase": {"1": 3, "2": 4, "3": 6, "4": 8, "5": 9, "6": 40, "7": 5},
            "total": 75,
        }

    def test_without_a_saved_plan_the_baseline_shows(self):
        sheet = build_sheet(project=a_project(), plan=a_baseline(), manual={"sponsor": "x"})

        found = values(sheet)
        assert (found["project_type"], found["scale"]) == ("industrial", "medium")
        assert found["confirmed_plan"]["total"] == 65

    def test_the_saved_plan_applies_even_without_a_baseline(self):
        sheet = build_sheet(project=a_project(), plan=None, manual={"plan": self.SAVED})

        assert values(sheet)["confirmed_plan"]["total"] == 75
        assert values(sheet)["scale"] == "large"

    def test_the_plan_key_is_not_a_field_and_counts_for_nothing_else(self):
        with_plan = build_sheet(project=a_project(), plan=a_baseline(), manual={"plan": self.SAVED})
        without = build_sheet(project=a_project(), plan=a_baseline(), manual={})

        assert with_plan.completion == without.completion
        assert [f.field for b in with_plan.blocks for f in b.fields] == [
            f.field for b in without.blocks for f in b.fields
        ]


class TestStorableText:
    """Hotfix after the Tester (RGB-17b): NUL and lone surrogates never reach the database."""

    @pytest.mark.parametrize("bad", ["a\x00b", "\x00", "ab\ud800", "\udfff"])
    @pytest.mark.parametrize("field", ["sponsor", "scope_included", "contract_signed_on"])
    def test_unstorable_characters_are_an_invalid_field(self, field, bad):
        with pytest.raises(InvalidSheetField) as error:
            validate_sheet_update({field: bad}, None)

        assert error.value.code == "invalid_field"
        assert error.value.field == field
        assert "contiene caracteres no permitidos" in error.value.message

    def test_normal_unicode_is_fine(self):
        assert validate_sheet_update({"sponsor": "Ñandú 建築 😀"}, None).fields == {
            "sponsor": "Ñandú 建築 😀"
        }


def test_field_names_in_messages_match_the_interface_labels():
    expected = {
        "cadastral_reference": "Referencia catastral",
        "scope_included": "Alcance incluido",
        "scope_excluded": "Alcance excluido",
        "contract_signed_on": "Fecha de firma del contrato",
        "sponsor": "Promotor",
        "project_director": "Dirección del proyecto",
        "technical_lead": "Responsable técnico",
        "team": "Equipo",
        "external_collaborators": "Colaboradores externos",
        "contact": "Contacto del cliente",
        "next_milestone": "Próximo hito",
        "next_milestone_on": "Fecha del próximo hito",
        "main_risk": "Riesgo principal",
        "risk_owner": "Responsable del riesgo",
        "repository_path": "Ruta del repositorio",
    }
    for field, label in expected.items():
        with pytest.raises(InvalidSheetField) as error:
            validate_sheet_update({field: 5}, None)
        assert f"«{label}»" in error.value.message

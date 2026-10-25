"""Project sheet (RGB-17a): pure rules of blocks, fields and completion.

Names fixed here for the Developer (backend/app/opportunity/domain/project_sheet.py):
- SheetProject(id, code, current_phase, name, client, location, project_type: ProjectType,
  traffic_light: str | None): the project data the sheet is prefilled from.
- build_sheet(*, project: SheetProject, plan: ConfirmedPlan | None, manual: Mapping[str, Any]
  | None) -> ProjectSheet. `manual` maps a manual field name to its stored value (flat).
- ProjectSheet(code, phase, completion: Completion(filled, required, percent),
  blocks: tuple[SheetBlock]); SheetBlock(block, filled, required, complete,
  fields: tuple[SheetField]); SheetField(field, required, value, source). All frozen
  dataclasses; `block`, `field` and `source` are plain strings ("scoring" | "auto" | "manual").
- Scoring-sourced values are strings; the confirmed_plan value is
  {"weeks_by_phase": {"1": 2, ...}, "total": 65} (JSON-ready, string keys).
- Counts (filled/required/complete) only consider required fields; optional ones are listed.
"""

from dataclasses import FrozenInstanceError
from datetime import datetime, timezone

import pytest

from backend.app.opportunity.domain.plan import ProjectType, Scale
from backend.app.opportunity.domain.project_plan import ConfirmedPlan
from backend.app.opportunity.domain.project_sheet import (
    Completion,
    ProjectSheet,
    SheetBlock,
    SheetField,
    SheetProject,
    build_sheet,
    completion_percent,
)

CODE = "PRY-2026-001"
WEEKS = (2, 2, 4, 5, 8, 40, 4)

MANUAL_FIELDS = {
    "cadastral_reference": "0000000AA0000A",
    "scope_included": "Basic and execution design",
    "scope_excluded": "Interior design",
    "contract_signed_on": "2026-11-02",
    "sponsor": "Sponsor (sample)",
    "project_director": "Director (sample)",
    "technical_lead": "Lead (sample)",
    "contact": "Contact (sample)",
    "next_milestone": "Basic design review",
    "next_milestone_on": "2026-12-01",
    "main_risk": "Late permit",
    "risk_owner": "Owner (sample)",
    "repository_path": "/projects/sample",
}


def a_project(traffic_light="green"):
    return SheetProject(
        id="project-1",
        code=CODE,
        current_phase=1,
        name="Warehouse (sample)",
        client="Client (sample)",
        location="Town (sample)",
        project_type=ProjectType.INDUSTRIAL,
        traffic_light=traffic_light,
    )


def a_plan():
    return ConfirmedPlan(
        project_code=CODE,
        project_type=ProjectType.INDUSTRIAL,
        scale=Scale.MEDIUM,
        weeks=WEEKS,
        confirmed_by="sample-user",
        confirmed_at=datetime(2026, 10, 24, 10, 0, tzinfo=timezone.utc),
    )


def sheet(manual=None, plan="default", project=None):
    return build_sheet(
        project=project or a_project(),
        plan=a_plan() if plan == "default" else plan,
        manual=manual,
    )


def block(result, name):
    return next(b for b in result.blocks if b.block == name)


def field(result, block_name, name):
    return next(f for f in block(result, block_name).fields if f.field == name)


class TestStructure:
    def test_eight_blocks_in_order(self):
        assert [b.block for b in sheet().blocks] == [
            "identification",
            "engagement",
            "governance",
            "client_contact",
            "timing",
            "risk",
            "information",
            "status",
        ]

    def test_fields_per_block_in_order(self):
        result = sheet()

        assert {b.block: [f.field for f in b.fields] for b in result.blocks} == {
            "identification": [
                "code",
                "name",
                "client",
                "location",
                "cadastral_reference",
                "project_type",
                "scale",
            ],
            "engagement": ["scope_included", "scope_excluded", "contract_signed_on"],
            "governance": [
                "sponsor",
                "project_director",
                "technical_lead",
                "team",
                "external_collaborators",
            ],
            "client_contact": ["contact"],
            "timing": ["confirmed_plan", "next_milestone", "next_milestone_on"],
            "risk": ["main_risk", "risk_owner"],
            "information": ["repository_path"],
            "status": ["traffic_light"],
        }

    def test_only_team_external_collaborators_and_traffic_light_are_optional(self):
        result = sheet()

        optional = {f.field for b in result.blocks for f in b.fields if not f.required}
        assert optional == {"team", "external_collaborators", "traffic_light"}

    def test_the_sources(self):
        result = sheet()

        sources = {f.field: f.source for b in result.blocks for f in b.fields}
        assert sources["code"] == "auto"
        for name in ("name", "client", "location", "project_type", "scale", "confirmed_plan"):
            assert sources[name] == "scoring", name
        assert sources["traffic_light"] == "auto"
        for name in (*MANUAL_FIELDS, "team", "external_collaborators"):
            assert sources[name] == "manual", name

    def test_the_result_is_made_of_frozen_dataclasses(self):
        result = sheet()

        assert isinstance(result, ProjectSheet)
        assert isinstance(result.completion, Completion)
        assert isinstance(result.blocks[0], SheetBlock)
        assert isinstance(result.blocks[0].fields[0], SheetField)
        with pytest.raises(FrozenInstanceError):
            result.code = "other"

    def test_code_and_phase_come_from_the_project(self):
        result = sheet()

        assert result.code == CODE
        assert result.phase == 1


class TestPrefilledValues:
    def test_identification_is_prefilled(self):
        result = sheet()

        assert field(result, "identification", "code").value == CODE
        assert field(result, "identification", "name").value == "Warehouse (sample)"
        assert field(result, "identification", "client").value == "Client (sample)"
        assert field(result, "identification", "location").value == "Town (sample)"
        assert field(result, "identification", "project_type").value == "industrial"
        assert field(result, "identification", "scale").value == "medium"

    def test_confirmed_plan_comes_from_the_plan(self):
        result = sheet()

        assert field(result, "timing", "confirmed_plan").value == {
            "weeks_by_phase": {"1": 2, "2": 2, "3": 4, "4": 5, "5": 8, "6": 40, "7": 4},
            "total": 65,
        }

    def test_without_a_plan_scale_and_confirmed_plan_are_empty_and_missing(self):
        result = sheet(plan=None)

        assert field(result, "identification", "scale").value is None
        assert field(result, "timing", "confirmed_plan").value is None
        assert block(result, "timing").filled == 0

    def test_traffic_light_comes_from_the_project(self):
        assert field(sheet(project=a_project("amber")), "status", "traffic_light").value == "amber"

    def test_without_traffic_light_the_status_block_is_still_complete(self):
        # A freshly promoted project always has an empty traffic light (time tracking computes
        # it later), so requiring it would make the sheet impossible to complete.
        result = sheet(project=a_project(None))

        assert field(result, "status", "traffic_light").value is None
        assert field(result, "status", "traffic_light").required is False
        assert block(result, "status").filled == 0
        assert block(result, "status").required == 0
        assert block(result, "status").complete is True

    def test_code_is_always_filled(self):
        result = sheet(plan=None, project=a_project(None))

        assert field(result, "identification", "code").value == CODE

    def test_manual_values_are_read_by_field_name(self):
        result = sheet(MANUAL_FIELDS)

        for b in result.blocks:
            for f in b.fields:
                if f.field in MANUAL_FIELDS:
                    assert f.value == MANUAL_FIELDS[f.field], f.field

    def test_manual_values_never_override_prefilled_ones(self):
        result = sheet({"client": "Other", "code": "X", "traffic_light": "red", "scale": "large"})

        assert field(result, "identification", "client").value == "Client (sample)"
        assert field(result, "identification", "code").value == CODE
        assert field(result, "status", "traffic_light").value == "green"
        assert field(result, "identification", "scale").value == "medium"

    def test_unknown_manual_keys_are_ignored(self):
        result = sheet({"made_up": "x"})

        names = [f.field for b in result.blocks for f in b.fields]
        assert "made_up" not in names


class TestCompletion:
    def test_nothing_manual_leaves_only_what_is_prefilled(self):
        result = sheet()

        assert {b.block: (b.filled, b.required, b.complete) for b in result.blocks} == {
            "identification": (6, 7, False),
            "engagement": (0, 3, False),
            "governance": (0, 3, False),
            "client_contact": (0, 1, False),
            "timing": (1, 3, False),
            "risk": (0, 2, False),
            "information": (0, 1, False),
            "status": (0, 0, True),
        }
        assert result.completion == Completion(filled=7, required=20, percent=35)

    def test_everything_filled_is_100_percent(self):
        result = sheet(MANUAL_FIELDS)

        assert all(b.complete and b.filled == b.required for b in result.blocks)
        assert result.completion == Completion(filled=20, required=20, percent=100)

    def test_a_block_is_complete_when_all_its_required_fields_are(self):
        result = sheet({"cadastral_reference": "0000000AA0000A"})

        assert block(result, "identification").complete is True
        assert block(result, "identification").filled == 7

    @pytest.mark.parametrize("empty", [None, "", "   ", "\t\n "])
    def test_empty_values_do_not_count(self, empty):
        result = sheet({**MANUAL_FIELDS, "main_risk": empty})

        assert field(result, "risk", "main_risk").value is None
        assert block(result, "risk").filled == 1
        assert block(result, "risk").complete is False
        assert result.completion.filled == 19

    def test_a_value_with_surrounding_spaces_counts(self):
        result = sheet({"main_risk": "  Late permit  "})

        assert block(result, "risk").filled == 1

    def test_empty_optionals_do_not_subtract(self):
        result = sheet({**MANUAL_FIELDS, "team": "  ", "external_collaborators": None})

        assert block(result, "governance").complete is True
        assert block(result, "governance").required == 3
        assert result.completion.percent == 100

    def test_filled_optionals_do_not_add_to_the_counts(self):
        result = sheet({**MANUAL_FIELDS, "team": "Team (sample)"})

        assert field(result, "governance", "team").value == "Team (sample)"
        assert block(result, "governance").filled == 3
        assert block(result, "governance").required == 3
        assert result.completion.filled == 20

    def test_filled_optionals_alone_do_not_complete_a_block(self):
        result = sheet({"team": "Team (sample)", "external_collaborators": "Firm (sample)"})

        assert block(result, "governance").filled == 0
        assert block(result, "governance").complete is False

    @pytest.mark.parametrize(
        ("manual_filled", "percent"),
        [
            (0, 35),  # 7/20
            (1, 40),  # 8/20
            (2, 45),  # 9/20
            (3, 50),  # 10/20
            (13, 100),
        ],
    )
    def test_percent_is_rounded(self, manual_filled, percent):
        manual = dict(list(MANUAL_FIELDS.items())[:manual_filled])

        result = sheet(manual)

        assert result.completion.filled == 7 + manual_filled
        assert result.completion.percent == percent

    def test_completion_is_the_sum_of_the_blocks(self):
        result = sheet({"sponsor": "Sponsor (sample)", "contact": "Contact (sample)"})

        assert result.completion.filled == sum(b.filled for b in result.blocks)
        assert result.completion.required == sum(b.required for b in result.blocks)

    def test_manual_none_mapping_is_the_same_as_empty(self):
        assert sheet(None) == sheet({})

    def test_optional_fields_are_never_marked_required(self):
        result = sheet()

        assert field(result, "governance", "team").required is False
        assert field(result, "governance", "sponsor").required is True


class TestCompletionPercent:
    @pytest.mark.parametrize(
        ("filled", "required", "percent"),
        [
            (1, 8, 13),  # 12.5 rounds half up
            (3, 8, 38),  # 37.5
            (5, 8, 63),  # 62.5
            (1, 3, 33),  # 33.33 rounds down
            (2, 3, 67),  # 66.67 rounds up
            (0, 20, 0),
            (20, 20, 100),
        ],
    )
    def test_rounds_half_up(self, filled, required, percent):
        assert completion_percent(filled, required) == percent

    def test_without_required_fields_nothing_is_pending(self):
        assert completion_percent(0, 0) == 100

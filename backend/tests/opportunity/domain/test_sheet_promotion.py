"""Pure rules of RGB-19 (completeness, permissions, frozen content of the project sheet).

Names fixed here for the Developer, all in backend.app.opportunity.domain.project_sheet:
- SheetPermissions(can_edit: bool, can_promote: bool), frozen dataclass.
- ProjectSheet gains `frozen_version: int | None = None` and
  `permissions: SheetPermissions = SheetPermissions(False, False)` (after `blocks`, in that
  order, so `asdict` keeps the old keys first). `build_sheet` leaves the defaults.
- missing_required_labels(sheet) -> list[str]: Spanish labels of the required fields without a
  value, in display order. Manual fields use SHEET_FIELD_LABELS; the prefilled ones are
  "Código", "Nombre", "Cliente", "Localización", "Tipología", "Escala", "Plan confirmado".
- sheet_permissions(*, phase, authorized, completion) -> SheetPermissions:
  can_edit = phase == 1 and authorized; can_promote = can_edit and completion.percent == 100.
- sheet_content(sheet) -> dict: JSON-able {"code", "phase", "completion", "blocks"} (what is
  frozen under the key "sheet"; no permissions, no frozen_version).
- sheet_from_content(content) -> ProjectSheet: the inverse (defaults for the new fields).
"""

from dataclasses import asdict, replace
from datetime import datetime, timezone

import pytest

from backend.app.opportunity.domain.errors import SHEET_FIELD_LABELS
from backend.app.opportunity.domain.plan import ProjectType, Scale
from backend.app.opportunity.domain.project_plan import ConfirmedPlan
from backend.app.opportunity.domain.project_sheet import (
    Completion,
    ProjectSheet,
    SheetPermissions,
    SheetProject,
    build_sheet,
    missing_required_labels,
    sheet_content,
    sheet_from_content,
    sheet_permissions,
)

CODE = "PRY-2026-001"
REQUIRED_MANUAL = (
    "cadastral_reference",
    "scope_included",
    "scope_excluded",
    "contract_signed_on",
    "sponsor",
    "project_director",
    "technical_lead",
    "contact",
    "next_milestone",
    "next_milestone_on",
    "main_risk",
    "risk_owner",
    "repository_path",
)


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


def a_plan():
    return ConfirmedPlan(
        project_code=CODE,
        project_type=ProjectType.INDUSTRIAL,
        scale=Scale.MEDIUM,
        weeks=(2, 2, 4, 5, 8, 40, 4),
        confirmed_by="sample-user",
        confirmed_at=datetime(2026, 10, 24, 10, 0, tzinfo=timezone.utc),
    )


def full_manual():
    return {name: f"{name} (sample)" for name in REQUIRED_MANUAL}


class TestMissingRequiredLabels:
    def test_a_complete_sheet_misses_nothing(self):
        sheet = build_sheet(project=a_project(), plan=a_plan(), manual=full_manual())

        assert sheet.completion.percent == 100
        assert missing_required_labels(sheet) == []

    def test_lists_the_empty_manual_fields_in_display_order_with_spanish_labels(self):
        sheet = build_sheet(project=a_project(), plan=a_plan(), manual=None)

        assert missing_required_labels(sheet) == [SHEET_FIELD_LABELS[n] for n in REQUIRED_MANUAL]
        assert len(missing_required_labels(sheet)) == 13

    def test_a_filled_field_and_a_blank_one(self):
        manual = {**full_manual(), "sponsor": "  ", "main_risk": ""}
        del manual["contact"]

        sheet = build_sheet(project=a_project(), plan=a_plan(), manual=manual)

        assert missing_required_labels(sheet) == [
            "Promotor",
            "Contacto del cliente",
            "Riesgo principal",
        ]

    def test_prefilled_fields_have_their_own_labels(self):
        sheet = build_sheet(project=a_project(), plan=None, manual=full_manual())

        assert missing_required_labels(sheet) == ["Escala", "Plan confirmado"]

    def test_optional_fields_are_never_listed(self):
        sheet = build_sheet(project=a_project(), plan=a_plan(), manual=full_manual())

        by_name = {f.field: f for b in sheet.blocks for f in b.fields}
        assert by_name["team"].value is None and by_name["traffic_light"].value is None
        assert missing_required_labels(sheet) == []

    def test_agrees_with_the_completion_count(self):
        sheet = build_sheet(project=a_project(), plan=a_plan(), manual={"sponsor": "x"})

        assert len(missing_required_labels(sheet)) == (
            sheet.completion.required - sheet.completion.filled
        )


class TestPermissions:
    def test_value_object(self):
        assert SheetPermissions(True, False) == SheetPermissions(can_edit=True, can_promote=False)
        assert asdict(SheetPermissions(True, False)) == {"can_edit": True, "can_promote": False}

    @pytest.mark.parametrize(
        ("phase", "authorized", "percent", "expected"),
        [
            (1, True, 100, (True, True)),
            (1, True, 99, (True, False)),
            (1, True, 0, (True, False)),
            (1, False, 100, (False, False)),
            (1, False, 40, (False, False)),
            (0, True, 100, (False, False)),
            (2, True, 100, (False, False)),
            (7, True, 100, (False, False)),
        ],
    )
    def test_matrix(self, phase, authorized, percent, expected):
        result = sheet_permissions(
            phase=phase, authorized=authorized, completion=Completion(percent, 100, percent)
        )

        assert result == SheetPermissions(*expected)

    def test_a_sheet_has_no_permissions_nor_version_by_default(self):
        sheet = build_sheet(project=a_project(), plan=a_plan(), manual=None)

        assert sheet.frozen_version is None
        assert sheet.permissions == SheetPermissions(False, False)
        assert list(asdict(sheet)) == [
            "code",
            "phase",
            "completion",
            "blocks",
            "frozen_version",
            "permissions",
        ]


class TestFrozenContent:
    def test_content_is_the_sheet_without_permissions_or_version(self):
        sheet = build_sheet(project=a_project(), plan=a_plan(), manual=full_manual())
        sheet = replace(sheet, frozen_version=1, permissions=SheetPermissions(True, True))

        content = sheet_content(sheet)

        assert set(content) == {"code", "phase", "completion", "blocks"}
        assert content["code"] == CODE
        assert content["completion"] == {"filled": 20, "required": 20, "percent": 100}
        assert content["blocks"][0]["block"] == "identification"
        assert content["blocks"][0]["fields"][0] == {
            "field": "code",
            "required": True,
            "value": CODE,
            "source": "auto",
        }

    def test_content_is_json_serializable(self):
        import json

        sheet = build_sheet(project=a_project(), plan=a_plan(), manual=full_manual())

        assert json.loads(json.dumps(sheet_content(sheet))) == sheet_content(sheet)

    def test_round_trip(self):
        sheet = build_sheet(project=a_project(), plan=a_plan(), manual=full_manual())

        restored = sheet_from_content(sheet_content(sheet))

        assert isinstance(restored, ProjectSheet)
        assert restored == sheet

    def test_round_trip_through_json(self):
        import json

        sheet = build_sheet(project=a_project(), plan=a_plan(), manual=None)

        restored = sheet_from_content(json.loads(json.dumps(sheet_content(sheet))))

        assert restored == sheet

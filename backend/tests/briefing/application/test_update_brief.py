"""UpdateBrief (RGB-32) with simulated ports.

Names fixed here: UpdateBrief(briefs, technical, roles, audit_log).execute(context, code,
fields) -> UpdateBriefResult(brief: ProjectBrief | None, error: Exception | None). Business
rejections are RETURNED and audited (entity "project_brief", action "update", outcome REJECTED,
old {"phase": n}, new {"error": code}); only an unknown project is RAISED. Order: project (locked),
phase 2 (BriefNotEditable), authority (NoAuthority), validation.
"""

from unittest.mock import create_autospec

import pytest

from backend.app.access.domain.ports import ProjectRoleReader
from backend.app.audit.domain.ports import AuditLog
from backend.app.briefing.application.update_brief import UpdateBrief, UpdateBriefResult
from backend.app.briefing.domain.errors import (
    BriefNotEditable,
    InvalidBriefField,
    InvalidBriefRequest,
    ProjectNotFound,
    UnknownBriefField,
)
from backend.app.briefing.domain.ports import Briefs
from backend.app.lifecycle.domain.errors import NoAuthority
from backend.app.study.domain.context import Role
from backend.app.technical_data.domain.ports import TechnicalDataRepository
from backend.tests.briefing.application.support import (
    BRIEF,
    DIRECTOR,
    a_context,
    a_project,
    a_query,
    events,
    rejected,
    some_data,
)

CODE = "PRY-2026-001"


@pytest.fixture
def briefs():
    port = create_autospec(Briefs, spec_set=True, instance=True)
    port.get_project.return_value = a_project()
    port.get_brief.return_value = {"needs": "Old needs (sample)"}
    return port


@pytest.fixture
def technical():
    port = create_autospec(TechnicalDataRepository, spec_set=True, instance=True)
    port.load.return_value = some_data()
    port.last_query.return_value = a_query()
    return port


@pytest.fixture
def roles():
    port = create_autospec(ProjectRoleReader, spec_set=True, instance=True)
    port.roles_of.return_value = DIRECTOR
    return port


@pytest.fixture
def audit_log():
    return create_autospec(AuditLog, spec_set=True, instance=True)


@pytest.fixture
def use_case(briefs, technical, roles, audit_log):
    return UpdateBrief(briefs, technical, roles, audit_log)


def test_unknown_project_is_raised(use_case, briefs):
    briefs.get_project.return_value = None

    with pytest.raises(ProjectNotFound):
        use_case.execute(a_context(), CODE, {"needs": "x"})


def test_the_project_is_read_locked(use_case, briefs):
    use_case.execute(a_context(), CODE, {"needs": "x"})

    briefs.get_project.assert_called_once_with(CODE, lock=True)


class TestSaving:
    def test_merges_the_changes_over_the_draft_and_saves(self, use_case, briefs):
        result = use_case.execute(a_context(), CODE, {"program": "Program (sample)"})

        assert isinstance(result, UpdateBriefResult)
        assert result.error is None
        briefs.save_brief.assert_called_once_with(
            "project-1", {"needs": "Old needs (sample)", "program": "Program (sample)"}
        )

    def test_a_blank_value_removes_the_field_from_the_draft(self, use_case, briefs):
        use_case.execute(a_context(), CODE, {"needs": "   "})

        briefs.save_brief.assert_called_once_with("project-1", {})

    def test_returns_the_brief_as_a_get_would(self, use_case, briefs):
        briefs.get_brief.return_value = dict(BRIEF)

        result = use_case.execute(a_context(), CODE, {"alignment": "Alignment (sample)"})

        assert result.brief.fields["alignment"] == "Alignment (sample)"
        assert result.brief.fields["needs"] == "Needs (sample)"
        assert result.brief.completeness.complete is True
        assert (result.brief.permissions.can_edit, result.brief.permissions.can_promote) == (
            True,
            True,
        )
        assert result.brief.technical_data["unverified"] == ["address"]

    def test_an_incomplete_brief_cannot_be_promoted_yet(self, use_case):
        result = use_case.execute(a_context(), CODE, {"program": "x"})

        assert result.brief.permissions.can_edit is True
        assert result.brief.permissions.can_promote is False

    def test_the_phase_is_never_touched(self, use_case, briefs):
        use_case.execute(a_context(), CODE, {"needs": "x"})

        assert [c[0] for c in briefs.method_calls] == ["get_project", "get_brief", "save_brief"]

    def test_the_change_is_audited_with_old_and_new_values(self, use_case, audit_log):
        use_case.execute(a_context(), CODE, {"needs": "New needs (sample)", "alignment": "A"})

        (event,) = events(audit_log)
        assert (event.entity, event.entity_id, event.action) == ("project_brief", CODE, "update")
        assert event.old_value == {"needs": "Old needs (sample)", "alignment": None}
        assert event.new_value == {"needs": "New needs (sample)", "alignment": "A"}
        assert event.user_id == "demo-user"


class TestRejections:
    def test_outside_phase_2_is_409_and_audited(self, use_case, briefs, audit_log):
        briefs.get_project.return_value = a_project(3)

        result = use_case.execute(a_context(), CODE, {"needs": "x"})

        assert isinstance(result.error, BriefNotEditable)
        assert result.brief is None
        briefs.save_brief.assert_not_called()
        (event,) = rejected(audit_log)
        assert (event.entity, event.action) == ("project_brief", "update")
        assert event.old_value == {"phase": 3}
        assert event.new_value == {"error": "brief_not_editable"}

    def test_without_authority_is_403_and_audited(self, use_case, briefs, roles, audit_log):
        roles.roles_of.return_value = frozenset()

        result = use_case.execute(a_context(Role.ARCHITECT), CODE, {"needs": "x"})

        assert isinstance(result.error, NoAuthority)
        assert result.error.allowed == ["Director de proyecto"]
        briefs.save_brief.assert_not_called()
        assert [e.new_value for e in rejected(audit_log)] == [{"error": "no_authority"}]

    def test_a_partner_has_no_authority_in_phase_2(self, use_case, roles):
        roles.roles_of.return_value = frozenset()

        result = use_case.execute(a_context(Role.PARTNER), CODE, {"needs": "x"})

        assert isinstance(result.error, NoAuthority)

    def test_the_phase_is_checked_before_the_authority(self, use_case, briefs, roles):
        briefs.get_project.return_value = a_project(1)
        roles.roles_of.return_value = frozenset()

        result = use_case.execute(a_context(Role.ARCHITECT), CODE, {"needs": "x"})

        assert isinstance(result.error, BriefNotEditable)

    @pytest.mark.parametrize(
        ("fields", "error", "code"),
        [
            ({"bogus": "x"}, UnknownBriefField, "unknown_field"),
            ({"deadline": "30/06/2027"}, InvalidBriefField, "invalid_field"),
            ({"target_budget": -5}, InvalidBriefField, "invalid_field"),
            ({}, InvalidBriefRequest, "invalid_request"),
            (None, InvalidBriefRequest, "invalid_request"),
        ],
    )
    def test_invalid_input_is_422_audited_and_saves_nothing(
        self, use_case, briefs, audit_log, fields, error, code
    ):
        result = use_case.execute(a_context(), CODE, fields)

        assert isinstance(result.error, error)
        briefs.save_brief.assert_not_called()
        assert [e.new_value for e in rejected(audit_log)] == [{"error": code}]

    def test_a_valid_field_next_to_an_invalid_one_saves_nothing(self, use_case, briefs):
        result = use_case.execute(a_context(), CODE, {"needs": "ok", "deadline": "nope"})

        assert result.error is not None
        briefs.save_brief.assert_not_called()

    def test_no_event_is_recorded_for_a_success_besides_the_update(self, use_case, audit_log):
        use_case.execute(a_context(), CODE, {"needs": "x"})

        assert len(events(audit_log)) == 1

"""Edit, restore, verify and verify-all: authority, phase, audit and persistence."""

import pytest

from backend.app.access.domain.project_roles import ProjectRole
from backend.app.lifecycle.domain.errors import NoAuthority
from backend.app.technical_data.application.edit_datum import EditDatum
from backend.app.technical_data.application.restore_datum import RestoreDatum
from backend.app.technical_data.application.verify_all import VerifyAll
from backend.app.technical_data.application.verify_datum import VerifyDatum
from backend.app.technical_data.domain.errors import (
    EmptyDatum,
    InvalidDatumValue,
    ProjectNotFound,
    TechnicalDataNotEditable,
    UnknownDatum,
)
from backend.tests.technical_data.application.support import (
    a_context,
    a_project,
    a_row,
    a_sheet,
    ok_events,
    rejected_events,
)

CODE = "PRY-T-001"


@pytest.fixture
def edit(projects, data, roles, audit_log):
    use_case = EditDatum(projects, data, roles, audit_log)
    return lambda field_id="builtArea", value="138": use_case.execute(
        a_context(), CODE, field_id, value
    )


@pytest.fixture
def restore(projects, data, roles, audit_log):
    use_case = RestoreDatum(projects, data, roles, audit_log)
    return lambda field_id="builtArea": use_case.execute(a_context(), CODE, field_id)


@pytest.fixture
def verify(projects, data, roles, audit_log):
    use_case = VerifyDatum(projects, data, roles, audit_log)
    return lambda field_id="builtArea": use_case.execute(a_context(), CODE, field_id)


@pytest.fixture
def verify_all(projects, data, roles, audit_log):
    use_case = VerifyAll(projects, data, roles, audit_log)
    return lambda: use_case.execute(a_context(), CODE)


class TestEditDatum:
    def test_saves_only_the_changed_datum_and_returns_the_sheet(self, edit, data):
        result = edit()

        assert result.error is None
        assert result.sheet.get("builtArea").value == "138"
        saved_id, saved = data.save.call_args.args
        assert saved_id == "project-1"
        assert [d.field_id for d in saved] == ["builtArea"]
        assert saved[0].value == "138" and saved[0].original == "142"

    def test_audits_who_what_before_and_after(self, edit, audit_log):
        edit()

        (event,) = ok_events(audit_log)
        assert (event.user_id, event.entity, event.entity_id, event.action) == (
            "user-1",
            "technical_datum",
            "PRY-T-001/builtArea",
            "edit",
        )
        assert event.old_value == {"value": "142", "verified": False}
        assert event.new_value == {"value": "138", "verified": False}

    def test_locks_the_project_while_it_edits(self, edit, projects):
        edit()

        projects.find.assert_called_once_with(CODE, lock=True)

    def test_an_unknown_project_is_not_found_and_nothing_is_written(
        self, edit, projects, data, audit_log
    ):
        projects.find.return_value = None

        result = edit()

        assert isinstance(result.error, ProjectNotFound)
        data.save.assert_not_called()
        audit_log.record.assert_not_called()

    def test_a_person_without_authority_is_refused_and_audited(self, edit, roles, data, audit_log):
        roles.roles_of.return_value = frozenset({ProjectRole.ARCHITECT})

        result = edit()

        assert isinstance(result.error, NoAuthority)
        assert "Director de proyecto" in result.error.message
        data.save.assert_not_called()
        (event,) = rejected_events(audit_log)
        assert event.action == "edit"
        assert event.new_value["error"] == "no_authority"
        assert ok_events(audit_log) == []

    def test_the_project_roles_are_those_of_the_person_in_that_project(self, edit, roles):
        edit()

        roles.roles_of.assert_called_once_with("project-1", "user-1")

    @pytest.mark.parametrize("phase", [0, 1, 3, 7])
    def test_outside_the_briefing_phase_it_is_a_conflict_and_audited(
        self, edit, projects, data, audit_log, phase
    ):
        projects.find.return_value = a_project(phase)

        result = edit()

        assert isinstance(result.error, TechnicalDataNotEditable)
        data.save.assert_not_called()
        assert rejected_events(audit_log)[0].new_value["error"] == "technical_data_not_editable"

    def test_authority_is_checked_before_the_phase(self, edit, projects, roles):
        projects.find.return_value = a_project(5)
        roles.roles_of.return_value = frozenset()

        assert isinstance(edit().error, NoAuthority)

    def test_an_invalid_value_is_rejected_audited_and_not_saved(self, edit, data, audit_log):
        result = edit("builtArea", "lots")

        assert isinstance(result.error, InvalidDatumValue)
        data.save.assert_not_called()
        (event,) = rejected_events(audit_log)
        assert event.new_value["error"] == "invalid_datum_value"
        assert event.new_value["value"] == "lots"

    def test_an_unknown_datum_is_rejected_and_audited(self, edit, data, audit_log):
        result = edit("owner", "x")

        assert isinstance(result.error, UnknownDatum)
        data.save.assert_not_called()
        assert rejected_events(audit_log)[0].new_value["error"] == "unknown_datum"

    def test_a_blank_datum_can_be_entered_by_hand(self, edit, data):
        result = edit("maxHeight", "10,5")

        assert result.sheet.get("maxHeight").value == "10,5"
        assert data.save.call_args.args[1][0].original is None

    def test_a_very_long_rejected_value_is_cut_in_the_audit(self, edit, audit_log):
        edit("address", "x" * 5000)

        assert len(rejected_events(audit_log)[0].new_value["value"]) <= 200


class TestRestoreDatum:
    def test_goes_back_to_the_original_and_audits(self, restore, data, audit_log):
        data.load.return_value = a_sheet(a_row("builtArea", "142", value="138", verified=True))

        result = restore()

        assert result.sheet.get("builtArea").value == "142"
        assert data.save.call_args.args[1][0].verified is False
        (event,) = ok_events(audit_log)
        assert event.action == "restore"
        assert event.old_value == {"value": "138", "verified": True}
        assert event.new_value == {"value": "142", "verified": False}

    def test_a_datum_without_changes_saves_nothing_but_is_still_audited(
        self, restore, data, audit_log
    ):
        restore()

        assert list(data.save.call_args.args[1]) == []
        assert len(ok_events(audit_log)) == 1

    def test_without_authority_it_is_refused_and_audited(self, restore, roles, data, audit_log):
        roles.roles_of.return_value = frozenset()

        assert isinstance(restore().error, NoAuthority)
        data.save.assert_not_called()
        assert rejected_events(audit_log)[0].action == "restore"

    def test_outside_the_briefing_phase_it_is_a_conflict(self, restore, projects):
        projects.find.return_value = a_project(3)

        assert isinstance(restore().error, TechnicalDataNotEditable)

    def test_an_unknown_datum_is_rejected(self, restore):
        assert isinstance(restore("owner").error, UnknownDatum)


class TestVerifyDatum:
    def test_verifies_one_datum_and_audits(self, verify, data, audit_log):
        result = verify("year")

        assert result.sheet.get("year").verified is True
        assert result.sheet.get("builtArea").verified is False
        assert [d.field_id for d in data.save.call_args.args[1]] == ["year"]
        (event,) = ok_events(audit_log)
        assert (event.action, event.entity_id) == ("verify", "PRY-T-001/year")
        assert event.old_value == {"verified": False}
        assert event.new_value == {"verified": True}

    def test_an_empty_datum_cannot_be_verified(self, verify, data, audit_log):
        result = verify("maxHeight")

        assert isinstance(result.error, EmptyDatum)
        data.save.assert_not_called()
        assert rejected_events(audit_log)[0].new_value["error"] == "empty_datum"

    def test_without_authority_it_is_refused_and_audited(self, verify, roles, audit_log):
        roles.roles_of.return_value = frozenset()

        assert isinstance(verify().error, NoAuthority)
        assert rejected_events(audit_log)[0].action == "verify"

    def test_outside_the_briefing_phase_it_is_a_conflict(self, verify, projects):
        projects.find.return_value = a_project(1)

        assert isinstance(verify().error, TechnicalDataNotEditable)


class TestVerifyAll:
    def test_verifies_every_datum_with_a_value_and_audits_which(self, verify_all, data, audit_log):
        result = verify_all()

        assert {d.field_id for d in result.sheet.data if d.verified} == {"builtArea", "year"}
        assert {d.field_id for d in data.save.call_args.args[1]} == {"builtArea", "year"}
        (event,) = ok_events(audit_log)
        assert (event.entity, event.entity_id, event.action) == (
            "technical_data",
            "PRY-T-001",
            "verify_all",
        )
        assert event.old_value == {"unverified": ["year", "builtArea"]}
        assert event.new_value == {"verified": ["year", "builtArea"]}

    def test_without_authority_it_is_refused_and_audited(self, verify_all, roles, data, audit_log):
        roles.roles_of.return_value = frozenset()

        assert isinstance(verify_all().error, NoAuthority)
        data.save.assert_not_called()
        assert rejected_events(audit_log)[0].action == "verify_all"

    def test_outside_the_briefing_phase_it_is_a_conflict(self, verify_all, projects):
        projects.find.return_value = a_project(4)

        assert isinstance(verify_all().error, TechnicalDataNotEditable)

    def test_an_unknown_project_is_not_found(self, verify_all, projects):
        projects.find.return_value = None

        assert isinstance(verify_all().error, ProjectNotFound)

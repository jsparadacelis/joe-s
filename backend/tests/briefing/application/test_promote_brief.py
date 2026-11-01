"""PromoteBrief (RGB-32) with simulated ports.

Names fixed here: PromoteBrief(briefs, technical, roles, promotion, audit_log).execute(context,
code) -> PromoteBriefResult(brief, transition, error). Business rejections are RETURNED and
audited (entity "project_brief", action "promote", REJECTED, old {"phase": n}, new {"error":
code}); an unknown project is RAISED. Order: project (locked), phase 2 (BriefNotEditable),
authority of phase 2 (NoAuthority), completeness (IncompleteBrief, a lifecycle
IncompleteDeliverable whose `missing` are the blockers).
Success: finalize(project_id, {"brief": stored, "technical_data": snapshot}) then
PromotionService.promote(context, code); audit entity "project_brief" action "freeze" old
{"phase": 2} new {"frozen_version": v} version v. If promote rejects, PromotionRejected is raised.
"""

from unittest.mock import MagicMock, create_autospec

import pytest

from backend.app.access.domain.ports import ProjectRoleReader
from backend.app.audit.domain.ports import AuditLog
from backend.app.briefing.application.promote_brief import PromoteBrief, PromoteBriefResult
from backend.app.briefing.application.technical_snapshot import snapshot
from backend.app.briefing.domain.errors import (
    BriefNotEditable,
    IncompleteBrief,
    ProjectNotFound,
    PromotionRejected,
)
from backend.app.briefing.domain.ports import Briefs
from backend.app.lifecycle.application.promotion_service import PromotionService, Transition
from backend.app.lifecycle.domain.errors import IncompleteDeliverable, NoAuthority, NoNextPhase
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
def calls():
    return MagicMock()


@pytest.fixture
def briefs(calls):
    port = create_autospec(Briefs, spec_set=True, instance=True)
    port.get_project.return_value = a_project()
    port.get_brief.return_value = dict(BRIEF)
    calls.attach_mock(port.finalize, "finalize")
    return port


@pytest.fixture
def technical():
    port = create_autospec(TechnicalDataRepository, spec_set=True, instance=True)
    port.load.return_value = some_data(verified=False)
    port.last_query.return_value = a_query()
    return port


@pytest.fixture
def roles():
    port = create_autospec(ProjectRoleReader, spec_set=True, instance=True)
    port.roles_of.return_value = DIRECTOR
    return port


@pytest.fixture
def promotion(calls):
    service = create_autospec(PromotionService, spec_set=True, instance=True)
    service.promote.return_value = Transition(True, "promote", 2, 3, 1, None)
    calls.attach_mock(service.promote, "promote")
    return service


@pytest.fixture
def audit_log():
    return create_autospec(AuditLog, spec_set=True, instance=True)


@pytest.fixture
def use_case(briefs, technical, roles, promotion, audit_log):
    return PromoteBrief(briefs, technical, roles, promotion, audit_log)


def test_unknown_project_is_raised(use_case, briefs):
    briefs.get_project.return_value = None

    with pytest.raises(ProjectNotFound):
        use_case.execute(a_context(), CODE)


class TestSuccess:
    def test_finalizes_brief_and_photo_together_then_promotes(self, use_case, briefs, calls):
        result = use_case.execute(a_context(), CODE)

        assert isinstance(result, PromoteBriefResult)
        assert result.error is None
        briefs.get_project.assert_called_once_with(CODE, lock=True)
        content = {"brief": BRIEF, "technical_data": snapshot(some_data(), a_query())}
        names = [c[0] for c in calls.mock_calls]
        assert names == ["finalize", "promote"]
        calls.finalize.assert_called_once_with("project-1", content)
        calls.promote.assert_called_once_with(a_context(), CODE)

    def test_unverified_data_do_not_block_and_are_marked_in_the_frozen_content(
        self, use_case, briefs
    ):
        use_case.execute(a_context(), CODE)

        content = briefs.finalize.call_args.args[1]
        assert content["technical_data"]["unverified"] == ["address"]
        assert content["technical_data"]["data"][0]["verified"] is False

    def test_the_freeze_is_audited_with_the_version(self, use_case, audit_log):
        use_case.execute(a_context(), CODE)

        (event,) = events(audit_log)
        assert (event.entity, event.entity_id, event.action) == ("project_brief", CODE, "freeze")
        assert event.old_value == {"phase": 2}
        assert event.new_value == {"frozen_version": 1}
        assert event.version == 1

    def test_returns_the_brief_as_a_get_would_afterwards(self, use_case):
        result = use_case.execute(a_context(), CODE)

        assert (result.brief.phase, result.brief.frozen_version) == (3, 1)
        assert result.brief.fields["needs"] == "Needs (sample)"
        assert result.brief.technical_data == snapshot(some_data(), a_query())
        assert (result.brief.permissions.can_edit, result.brief.permissions.can_promote) == (
            False,
            False,
        )
        assert result.transition.frozen_version == 1

    def test_the_stored_draft_is_frozen_without_the_defaults_it_does_not_have(
        self, use_case, briefs
    ):
        briefs.get_brief.return_value = {**BRIEF, "alignment": "Alignment (sample)"}

        use_case.execute(a_context(), CODE)

        assert briefs.finalize.call_args.args[1]["brief"]["alignment"] == "Alignment (sample)"

    def test_a_signed_approval_needs_no_attachment(self, use_case, briefs):
        briefs.get_brief.return_value = {**BRIEF, "client_approval": "signed"}

        assert use_case.execute(a_context(), CODE).error is None


class TestRejections:
    def assert_nothing_done(self, briefs, promotion):
        briefs.finalize.assert_not_called()
        promotion.promote.assert_not_called()

    def test_outside_phase_2_is_409(self, use_case, briefs, promotion, audit_log):
        briefs.get_project.return_value = a_project(3)

        result = use_case.execute(a_context(), CODE)

        assert isinstance(result.error, BriefNotEditable)
        self.assert_nothing_done(briefs, promotion)
        (event,) = rejected(audit_log)
        assert (event.entity, event.action) == ("project_brief", "promote")
        assert event.old_value == {"phase": 3}
        assert event.new_value == {"error": "brief_not_editable"}

    @pytest.mark.parametrize("role", [Role.PARTNER, Role.DIRECTOR, Role.ARCHITECT])
    def test_without_the_project_director_function_is_403(
        self, use_case, briefs, roles, promotion, audit_log, role
    ):
        roles.roles_of.return_value = frozenset()

        result = use_case.execute(a_context(role), CODE)

        assert isinstance(result.error, NoAuthority)
        assert result.error.allowed == ["Director de proyecto"]
        self.assert_nothing_done(briefs, promotion)
        assert [e.new_value for e in rejected(audit_log)] == [{"error": "no_authority"}]

    def test_the_phase_is_checked_before_the_authority(self, use_case, briefs, roles):
        briefs.get_project.return_value = a_project(1)
        roles.roles_of.return_value = frozenset()

        assert isinstance(use_case.execute(a_context(), CODE).error, BriefNotEditable)

    def test_missing_required_fields_are_422_with_their_labels(
        self, use_case, briefs, promotion, audit_log
    ):
        briefs.get_brief.return_value = {"program": "x", "client_approval": "email"}

        result = use_case.execute(a_context(), CODE)

        assert isinstance(result.error, IncompleteBrief)
        assert isinstance(result.error, IncompleteDeliverable)
        assert result.error.missing == [
            "Necesidades",
            "Condicionantes",
            "Presupuesto objetivo",
            "Plazo",
        ]
        self.assert_nothing_done(briefs, promotion)
        assert [e.new_value for e in rejected(audit_log)] == [{"error": "incomplete_deliverable"}]

    def test_pending_approval_is_422(self, use_case, briefs, promotion):
        briefs.get_brief.return_value = {**BRIEF, "client_approval": "pending"}

        result = use_case.execute(a_context(), CODE)

        assert result.error.missing == ["Aprobación del cliente registrada"]
        self.assert_nothing_done(briefs, promotion)

    def test_no_approval_stored_counts_as_pending(self, use_case, briefs):
        briefs.get_brief.return_value = {k: v for k, v in BRIEF.items() if k != "client_approval"}

        assert use_case.execute(a_context(), CODE).error.missing == [
            "Aprobación del cliente registrada"
        ]

    def test_no_technical_data_is_422(self, use_case, technical, briefs, promotion):
        technical.load.return_value = some_data().__class__.from_rows([])
        technical.last_query.return_value = None

        result = use_case.execute(a_context(), CODE)

        assert result.error.missing == ["Datos técnicos obtenidos"]
        self.assert_nothing_done(briefs, promotion)

    def test_everything_missing_lists_the_blockers_in_order(self, use_case, briefs, technical):
        briefs.get_brief.return_value = {}
        technical.load.return_value = some_data().__class__.from_rows([])

        assert use_case.execute(a_context(), CODE).error.missing == [
            "Necesidades",
            "Programa",
            "Condicionantes",
            "Presupuesto objetivo",
            "Plazo",
            "Datos técnicos obtenidos",
            "Aprobación del cliente registrada",
        ]


def test_a_rejection_of_the_promotion_service_is_raised_so_everything_rolls_back(
    use_case, promotion, audit_log
):
    promotion.promote.return_value = Transition(False, "promote", 2, 2, None, NoNextPhase())

    with pytest.raises(PromotionRejected) as raised:
        use_case.execute(a_context(), CODE)

    assert raised.value.code == "no_next_phase"
    assert events(audit_log) == []

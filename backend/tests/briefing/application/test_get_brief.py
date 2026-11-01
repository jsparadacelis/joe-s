"""GetBrief (RGB-32) with simulated ports.

Names fixed here: GetBrief(briefs, technical, roles).read(context, code) -> ProjectBrief.
Raises ProjectNotFound (briefing errors) and BriefNotFound (phase < 2). Phase 2: live brief and
live photo of the technical data; phase > 2: the frozen version 1, read-only.
"""

from unittest.mock import create_autospec

import pytest

from backend.app.access.domain.ports import ProjectRoleReader
from backend.app.briefing.application.get_brief import GetBrief
from backend.app.briefing.application.technical_snapshot import snapshot
from backend.app.briefing.domain.errors import BriefNotFound, ProjectNotFound
from backend.app.briefing.domain.ports import Briefs
from backend.app.study.domain.context import Role
from backend.app.technical_data.domain.ports import TechnicalDataRepository
from backend.tests.briefing.application.support import (
    BRIEF,
    DIRECTOR,
    a_context,
    a_project,
    a_query,
    some_data,
)


@pytest.fixture
def briefs():
    port = create_autospec(Briefs, spec_set=True, instance=True)
    port.get_project.return_value = a_project()
    port.get_brief.return_value = dict(BRIEF)
    port.get_frozen.return_value = None
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
def use_case(briefs, technical, roles):
    return GetBrief(briefs, technical, roles)


def test_unknown_project(use_case, briefs):
    briefs.get_project.return_value = None

    with pytest.raises(ProjectNotFound):
        use_case.read(a_context(), "PRY-2026-999")


@pytest.mark.parametrize("phase", [0, 1])
def test_before_phase_2_there_is_no_brief(use_case, briefs, phase):
    briefs.get_project.return_value = a_project(phase)

    with pytest.raises(BriefNotFound) as raised:
        use_case.read(a_context(), "PRY-2026-001")

    assert raised.value.code == "brief_not_found"


def test_phase_2_returns_the_live_brief_with_the_photo_and_permissions(use_case):
    brief = use_case.read(a_context(), "PRY-2026-001")

    assert (brief.code, brief.phase, brief.frozen_version) == ("PRY-2026-001", 2, None)
    assert brief.fields["needs"] == "Needs (sample)"
    assert brief.fields["alignment"] is None
    assert brief.technical_data == snapshot(some_data(), a_query())
    assert brief.completeness.complete is True
    assert (brief.permissions.can_edit, brief.permissions.can_promote) == (True, True)


def test_reading_saves_nothing(use_case, briefs):
    use_case.read(a_context(), "PRY-2026-001")

    assert [c for c in briefs.method_calls if c[0] in ("save_brief", "finalize")] == []


def test_an_incomplete_brief_is_editable_but_not_promotable(use_case, briefs):
    briefs.get_brief.return_value = {"needs": "x"}

    brief = use_case.read(a_context(), "PRY-2026-001")

    assert brief.completeness.missing == [
        "Programa",
        "Condicionantes",
        "Presupuesto objetivo",
        "Plazo",
    ]
    assert (brief.permissions.can_edit, brief.permissions.can_promote) == (True, False)


def test_unverified_data_do_not_block_and_are_flagged(use_case):
    brief = use_case.read(a_context(), "PRY-2026-001")

    assert brief.technical_data["unverified"] == ["address"]
    assert brief.permissions.can_promote is True


def test_no_technical_data_blocks_the_promotion(use_case, technical):
    technical.load.return_value = some_data().__class__.from_rows([])
    technical.last_query.return_value = None

    brief = use_case.read(a_context(), "PRY-2026-001")

    assert brief.completeness.technical_data_obtained is False
    assert brief.completeness.technical_data_queried is False
    assert brief.permissions.can_promote is False


def test_without_the_project_director_function_nothing_is_allowed(use_case, roles):
    roles.roles_of.return_value = frozenset()

    brief = use_case.read(a_context(Role.ARCHITECT), "PRY-2026-001")

    assert (brief.permissions.can_edit, brief.permissions.can_promote) == (False, False)


def test_roles_are_asked_for_this_project_and_person(use_case, roles):
    use_case.read(a_context(), "PRY-2026-001")

    roles.roles_of.assert_called_once_with("project-1", "demo-user")


def test_partner_has_no_authority_in_phase_2(use_case, roles):
    roles.roles_of.return_value = frozenset()

    brief = use_case.read(a_context(Role.PARTNER), "PRY-2026-001")

    assert brief.permissions.can_edit is False


class TestAfterPhase2:
    def frozen(self, briefs, brief=None):
        briefs.get_project.return_value = a_project(3)
        briefs.get_frozen.return_value = {
            "brief": brief or dict(BRIEF),
            "technical_data": snapshot(some_data(), a_query()),
        }

    def test_returns_the_frozen_version_not_a_rebuild(self, use_case, briefs, technical):
        self.frozen(briefs)
        briefs.get_brief.return_value = {"needs": "changed afterwards"}

        brief = use_case.read(a_context(), "PRY-2026-001")

        assert (brief.phase, brief.frozen_version) == (3, 1)
        assert brief.fields["needs"] == "Needs (sample)"
        assert brief.technical_data == snapshot(some_data(), a_query())
        briefs.get_frozen.assert_called_once_with("project-1", 2)
        technical.load.assert_not_called()

    def test_permissions_are_false_for_everybody(self, use_case, briefs):
        self.frozen(briefs)

        brief = use_case.read(a_context(), "PRY-2026-001")

        assert (brief.permissions.can_edit, brief.permissions.can_promote) == (False, False)

    def test_completeness_is_read_from_the_frozen_content(self, use_case, briefs):
        self.frozen(briefs)

        brief = use_case.read(a_context(), "PRY-2026-001")

        assert brief.completeness.complete is True
        assert brief.completeness.technical_data_queried is True

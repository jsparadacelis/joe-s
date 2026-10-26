"""The central permission function: who promotes each phase (PRD matrix) and what an AI cannot do."""

import pytest

from backend.app.access.domain.actions import Action
from backend.app.access.domain.actor import AiActor, PersonActor
from backend.app.access.domain.policy import can
from backend.app.access.domain.project_roles import ProjectRole
from backend.app.access.domain.resource import ProjectResource, StudyResource
from backend.app.study.domain.context import Role

PHASE_ACTIONS = [Action.PROMOTE, Action.APPROVE_DELIVERABLE, Action.EDIT_DELIVERABLE]

# PRD, "Entregable de salida por fase": who promotes each phase.
PROMOTER_BY_PHASE = {
    0: ("study", {Role.PARTNER, Role.DIRECTOR}),
    1: ("study", {Role.PARTNER, Role.DIRECTOR}),
    2: ("project", ProjectRole.PROJECT_DIRECTOR),
    3: ("project", ProjectRole.PROJECT_DIRECTOR),
    4: ("project", ProjectRole.LICENSED_SIGNATORY),
    5: ("project", ProjectRole.LICENSED_SIGNATORY),
    6: ("project", ProjectRole.SITE_MANAGEMENT),
    7: ("project", ProjectRole.SPONSOR),
}


def a_person(role=Role.ARCHITECT, project_roles=()):
    return PersonActor(
        study_id="demo-study",
        user_id="demo-user",
        study_role=role,
        project_roles=frozenset(project_roles),
    )


def at_phase(phase):
    return ProjectResource(project_id="demo-project", phase=phase)


class TestPromotionMatrix:
    @pytest.mark.parametrize("action", PHASE_ACTIONS)
    @pytest.mark.parametrize("phase", [0, 1])
    @pytest.mark.parametrize("role", [Role.PARTNER, Role.DIRECTOR])
    def test_partner_and_director_hold_the_first_two_phases(self, action, phase, role):
        assert can(a_person(role), action, at_phase(phase)).allowed is True

    @pytest.mark.parametrize("phase", [0, 1])
    @pytest.mark.parametrize(
        "role",
        [
            Role.PROJECT_DIRECTOR,
            Role.TECHNICAL_LEAD,
            Role.ARCHITECT,
            Role.SITE_COLLABORATOR,
            Role.ADMINISTRATION,
        ],
    )
    def test_other_study_roles_do_not_hold_the_first_two_phases(self, phase, role):
        assert can(a_person(role), Action.PROMOTE, at_phase(phase)).allowed is False

    @pytest.mark.parametrize("phase", range(2, 8))
    def test_the_project_function_of_that_phase_promotes(self, phase):
        _, function = PROMOTER_BY_PHASE[phase]

        decision = can(a_person(project_roles=[function]), Action.PROMOTE, at_phase(phase))

        assert decision.allowed is True

    @pytest.mark.parametrize("phase", range(2, 8))
    @pytest.mark.parametrize("role", [Role.PARTNER, Role.DIRECTOR])
    def test_partner_and_director_do_not_inherit_the_project_functions(self, phase, role):
        assert can(a_person(role), Action.PROMOTE, at_phase(phase)).allowed is False

    @pytest.mark.parametrize("phase", range(2, 8))
    def test_no_other_project_function_promotes_the_phase(self, phase):
        _, function = PROMOTER_BY_PHASE[phase]
        others = [r for r in ProjectRole if r is not function]

        for other in others:
            assert (
                can(a_person(project_roles=[other]), Action.PROMOTE, at_phase(phase)).allowed
                is False
            )

    @pytest.mark.parametrize("phase", range(2, 8))
    def test_a_person_without_a_role_in_the_project_does_not_promote(self, phase):
        assert (
            can(a_person(Role.PROJECT_DIRECTOR), Action.PROMOTE, at_phase(phase)).allowed is False
        )

    def test_several_project_roles_add_up(self):
        person = a_person(project_roles=[ProjectRole.ARCHITECT, ProjectRole.SPONSOR])

        assert can(person, Action.PROMOTE, at_phase(7)).allowed is True
        assert can(person, Action.PROMOTE, at_phase(6)).allowed is False

    def test_the_matrix_covers_all_eight_phases(self):
        assert sorted(PROMOTER_BY_PHASE) == list(range(8))

    @pytest.mark.parametrize(
        ("phase", "labels"),
        [
            (0, ("Socio", "Director")),
            (2, ("Director de proyecto",)),
            (4, ("Firmante habilitado",)),
            (6, ("Dirección facultativa",)),
            (7, ("Sponsor",)),
        ],
    )
    def test_a_refusal_says_who_can(self, phase, labels):
        decision = can(a_person(), Action.PROMOTE, at_phase(phase))

        assert decision.allowed is False
        assert decision.who == labels

    def test_an_unknown_phase_is_refused_not_guessed(self):
        with pytest.raises(ValueError):
            can(a_person(Role.PARTNER), Action.PROMOTE, at_phase(8))


class TestOtherActions:
    @pytest.mark.parametrize("action", [Action.PAUSE, Action.RESUME, Action.MANAGE_PROJECT_MEMBERS])
    @pytest.mark.parametrize("role", [Role.PARTNER, Role.DIRECTOR])
    def test_management_runs_any_project(self, action, role):
        assert can(a_person(role), action, at_phase(3)).allowed is True

    @pytest.mark.parametrize("action", [Action.PAUSE, Action.RESUME, Action.MANAGE_PROJECT_MEMBERS])
    def test_the_project_director_runs_only_their_project(self, action):
        mine = a_person(Role.PROJECT_DIRECTOR, [ProjectRole.PROJECT_DIRECTOR])
        other = a_person(Role.PROJECT_DIRECTOR)

        assert can(mine, action, at_phase(3)).allowed is True
        assert can(other, action, at_phase(3)).allowed is False

    @pytest.mark.parametrize("action", [Action.PAUSE, Action.RESUME])
    @pytest.mark.parametrize(
        "function",
        [r for r in ProjectRole if r is not ProjectRole.PROJECT_DIRECTOR],
    )
    def test_other_project_functions_do_not_pause(self, action, function):
        assert can(a_person(project_roles=[function]), action, at_phase(3)).allowed is False

    @pytest.mark.parametrize("action", [Action.EDIT_SETTINGS, Action.SCORE])
    def test_settings_and_scoring_are_for_partner_and_director(self, action):
        assert can(a_person(Role.PARTNER), action, StudyResource()).allowed is True
        assert can(a_person(Role.DIRECTOR), action, StudyResource()).allowed is True
        assert can(a_person(Role.ARCHITECT), action, StudyResource()).allowed is False
        assert can(a_person(Role.PROJECT_DIRECTOR), action, StudyResource()).allowed is False

    def test_creating_an_opportunity_also_allows_the_project_director(self):
        action = Action.CREATE_OPPORTUNITY

        assert can(a_person(Role.PARTNER), action, StudyResource()).allowed is True
        assert can(a_person(Role.PROJECT_DIRECTOR), action, StudyResource()).allowed is True
        assert can(a_person(Role.ARCHITECT), action, StudyResource()).allowed is False

    @pytest.mark.parametrize("role", list(Role))
    def test_every_member_reads(self, role):
        assert can(a_person(role), Action.READ, StudyResource()).allowed is True


class TestAiActor:
    @pytest.mark.parametrize("action", [a for a in Action if a is not Action.READ])
    def test_an_ai_actor_has_no_permission_to_change_anything(self, action):
        resource = at_phase(2)

        decision = can(AiActor(name="weekly-report"), action, resource)

        assert decision.allowed is False

    @pytest.mark.parametrize("phase", range(8))
    def test_an_ai_actor_never_promotes_in_any_phase(self, phase):
        assert can(AiActor(name="weekly-report"), Action.PROMOTE, at_phase(phase)).allowed is False

    def test_an_ai_actor_may_read_to_propose(self):
        assert can(AiActor(name="weekly-report"), Action.READ, StudyResource()).allowed is True

    def test_every_state_changing_action_is_refused_to_the_ai(self):
        """If a new action is added, the AI must be refused unless it is explicitly a read."""
        readers = {a for a in Action if can(AiActor(name="x"), a, at_phase(2)).allowed}

        assert readers == {Action.READ}

"""The demo data is fictitious by construction: checked without a database."""

from collections import Counter

import pytest

from backend.app.external_data.domain.cadastral_reference import validate_cadastral_reference
from backend.app.opportunity.domain.scoring import validate_ratings
from backend.app.shared.config import Settings
from backend.app.shared.demo_data import (
    DEMO_STUDY_ID,
    DEMO_STUDY_NAME,
    FICTITIOUS_PREFIX,
    MEMBERS,
    PROJECTS,
    SEED_USER,
    TECHNICAL_DATA,
    fictitious_cadastral_reference,
    is_fictitious_reference,
)
from backend.app.study.domain.context import Qualification, Role
from backend.app.technical_data.domain.catalog import definition_of
from backend.app.technical_data.domain.values import normalize_value


class TestStudy:
    def test_has_its_own_fixed_id_apart_from_the_development_study(self):
        assert DEMO_STUDY_ID == "00000000-0000-0000-0000-00000000de00"
        assert DEMO_STUDY_ID != Settings(_env_file=None).dev_study_id

    def test_is_named_as_fictitious(self):
        assert DEMO_STUDY_NAME == "Estudio de demostración (ficticio)"

    def test_the_seed_actor_is_not_a_member_nor_a_person(self):
        assert SEED_USER == "seed"
        assert SEED_USER not in {m.user_id for m in MEMBERS}


class TestMembers:
    def test_there_are_nine(self):
        assert len(MEMBERS) == 9

    def test_every_email_is_example_com(self):
        assert [m.email for m in MEMBERS if not m.email.endswith("@example.com")] == []

    def test_emails_and_user_ids_are_unique_and_normalized(self):
        assert len({m.email for m in MEMBERS}) == 9
        assert len({m.user_id for m in MEMBERS}) == 9
        assert all(m.email == m.email.strip().lower() for m in MEMBERS)

    def test_covers_every_studio_role(self):
        assert {m.role for m in MEMBERS} == set(Role)

    def test_covers_every_qualification(self):
        held = {q for m in MEMBERS for q in m.qualifications}

        assert held == set(Qualification)

    def test_the_partner_is_the_sponsor(self):
        sponsors = [m.role for m in MEMBERS if Qualification.SPONSOR in m.qualifications]

        assert sponsors == [Role.PARTNER]


class TestProjects:
    def test_there_are_eight(self):
        assert len(PROJECTS) == 8

    def test_cover_phases_zero_to_six_at_least_once_and_nothing_beyond(self):
        phases = Counter(p.target_phase for p in PROJECTS)

        assert set(phases) == {0, 1, 2, 3, 4, 5, 6}

    def test_one_active_pause_and_one_overdue_pause(self):
        pauses = Counter(p.pause for p in PROJECTS if p.pause)

        assert pauses == {"active": 1, "overdue": 1}

    def test_names_are_unique_so_a_project_can_be_found_again(self):
        assert len({p.name for p in PROJECTS}) == 8

    def test_ratings_are_valid_for_the_scoring(self):
        for project in PROJECTS:
            validate_ratings(project.ratings)

    def test_paused_projects_have_a_clock_to_stop(self):
        assert all(p.target_phase >= 1 for p in PROJECTS if p.pause)

    def test_phase_zero_projects_carry_no_tracking_data(self):
        assert all(p.traffic_light is None for p in PROJECTS if p.target_phase == 0)

    def test_the_rest_have_a_traffic_light_and_a_milestone(self):
        assert all(p.traffic_light and p.next_milestone for p in PROJECTS if p.target_phase >= 1)

    def test_every_project_from_phase_two_has_a_cadastral_reference(self):
        assert all(p.cadastral_index is not None for p in PROJECTS if p.target_phase >= 1)


class TestCadastralReferences:
    def test_are_valid_references_that_cannot_exist(self):
        for index in range(1, 9):
            reference = fictitious_cadastral_reference(index)

            assert validate_cadastral_reference(reference) == reference
            assert len(reference) == 20
            assert reference.startswith(FICTITIOUS_PREFIX)
            # A real reference starts with seven digits: this prefix can never be one.
            assert not reference[:7].isdigit()

    def test_are_marked_and_distinguishable(self):
        references = {fictitious_cadastral_reference(i) for i in range(1, 9)}

        assert len(references) == 8
        assert all(is_fictitious_reference(r) for r in references)

    def test_a_real_looking_reference_is_not_marked(self):
        assert not is_fictitious_reference("9872023VH5797S0001WX")

    def test_index_out_of_range_is_rejected(self):
        for index in (0, -1, 10_000):
            with pytest.raises(ValueError):
                fictitious_cadastral_reference(index)


class TestTechnicalData:
    def test_every_value_is_valid_for_its_catalog_definition(self):
        for field_id, value in TECHNICAL_DATA.items():
            assert normalize_value(definition_of(field_id), value) == value

    def test_the_overrides_of_every_project_are_valid_too(self):
        for project in PROJECTS:
            for field_id, value in {**project.technical_overrides, **project.technical_edits}.items():
                assert normalize_value(definition_of(field_id), value) == value

    def test_has_no_ownership_data(self):
        assert not {"owner", "holder", "titular", "ownerName"} & set(TECHNICAL_DATA)

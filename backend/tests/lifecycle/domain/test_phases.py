import pytest

from backend.app.lifecycle.domain.phases import PHASES, next_phase, phase_definition


class TestPhases:
    def test_there_are_eight_phases_numbered_zero_to_seven(self):
        assert [f.id for f in PHASES] == [0, 1, 2, 3, 4, 5, 6, 7]

    def test_names_follow_the_prd(self):
        assert [f.name for f in PHASES] == [
            "Oportunidad",
            "Inicio",
            "Briefing y concepto",
            "Anteproyecto",
            "Proyecto básico",
            "Proyecto de ejecución",
            "Obra",
            "Cierre",
        ]

    def test_every_phase_has_an_exit_deliverable_and_an_authority(self):
        assert all(f.exit_deliverable.strip() and f.authority.strip() for f in PHASES)

    def test_authority_per_phase_follows_the_prd(self):
        assert [f.authority for f in PHASES] == [
            "partner_director",
            "partner_director",
            "project_director",
            "project_director",
            "licensed_signatory",
            "licensed_signatory",
            "site_management",
            "sponsor",
        ]


class TestPhaseDefinition:
    def test_finds_a_phase_by_id(self):
        assert phase_definition(3).name == "Anteproyecto"

    @pytest.mark.parametrize("phase", [-1, 8, 99])
    def test_rejects_unknown_phases(self, phase):
        with pytest.raises(ValueError):
            phase_definition(phase)


class TestNextPhase:
    def test_returns_the_following_phase(self):
        assert next_phase(2) == 3

    def test_closing_phase_has_no_following_one(self):
        assert next_phase(7) is None

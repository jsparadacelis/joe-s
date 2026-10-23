import dataclasses

import pytest

from backend.app.ciclo_de_vida.domain.proyecto import Proyecto, ProyectoIncompleto, Semaforo


def a_project(**overrides):
    values = {
        "estudio_id": "estudio-demo",
        "codigo": "PRY-EJ-001",
        "nombre": "Vivienda unifamiliar (ejemplo)",
        "fase_actual": 0,
    }
    return Proyecto(**{**values, **overrides})


def an_active_project(**overrides):
    values = {
        "activo": True,
        "responsable_id": "usuario-demo",
        "proximo_hito": "Entrega del briefing",
        "semaforo": Semaforo.VERDE,
    }
    return a_project(**{**values, **overrides})


class TestProyecto:
    def test_starts_inactive_and_not_paused(self):
        project = a_project()

        assert (project.activo, project.en_pausa) == (False, False)

    @pytest.mark.parametrize("phase", [-1, 8])
    def test_phase_must_be_between_zero_and_seven(self, phase):
        with pytest.raises(ValueError):
            a_project(fase_actual=phase)

    @pytest.mark.parametrize("field", ["estudio_id", "codigo", "nombre"])
    def test_rejects_blank_identity_fields(self, field):
        with pytest.raises(ValueError):
            a_project(**{field: "  "})

    def test_is_immutable(self):
        project = a_project()

        with pytest.raises(dataclasses.FrozenInstanceError):
            project.fase_actual = 1


class TestActivo:
    def test_active_project_with_everything_is_valid(self):
        project = an_active_project()

        assert project.activo is True

    @pytest.mark.parametrize(
        ("field", "label"),
        [
            ("responsable_id", "responsable"),
            ("proximo_hito", "próximo hito"),
            ("semaforo", "semáforo"),
        ],
    )
    def test_active_requires_each_field_and_names_what_is_missing(self, field, label):
        with pytest.raises(ProyectoIncompleto) as error:
            an_active_project(**{field: None})

        assert error.value.faltantes == [label]

    def test_lists_everything_that_is_missing(self):
        with pytest.raises(ProyectoIncompleto) as error:
            a_project(activo=True)

        assert error.value.faltantes == ["responsable", "próximo hito", "semáforo"]

    def test_blank_milestone_counts_as_missing(self):
        with pytest.raises(ProyectoIncompleto):
            an_active_project(proximo_hito="  ")

    def test_inactive_project_can_be_incomplete(self):
        project = a_project(responsable_id=None, proximo_hito=None, semaforo=None)

        assert project.faltantes_para_activar() == ["responsable", "próximo hito", "semáforo"]

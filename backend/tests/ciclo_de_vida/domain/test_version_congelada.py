import dataclasses

import pytest

from backend.app.ciclo_de_vida.domain.version_congelada import VersionCongelada


def a_frozen_version(contenido=None, **overrides):
    values = {
        "estudio_id": "estudio-demo",
        "proyecto_id": "proyecto-demo",
        "fase": 2,
        "version": 1,
        "contenido": contenido if contenido is not None else {"titulo": "Brief (ejemplo)"},
        "congelada_por": "usuario-demo",
    }
    return VersionCongelada.crear(**{**values, **overrides})


class TestVersionCongelada:
    def test_keeps_the_content_it_was_frozen_with(self):
        version = a_frozen_version({"titulo": "Brief (ejemplo)", "campos": [1, 2]})

        assert version.contenido == {"titulo": "Brief (ejemplo)", "campos": [1, 2]}

    def test_changing_the_original_afterwards_does_not_alter_it(self):
        original = {"campos": [1, 2]}
        version = a_frozen_version(original)

        original["campos"].append(3)

        assert version.contenido == {"campos": [1, 2]}

    def test_changing_the_returned_content_does_not_alter_it(self):
        version = a_frozen_version({"campos": [1, 2]})

        version.contenido["campos"].append(3)

        assert version.contenido == {"campos": [1, 2]}

    def test_is_immutable(self):
        version = a_frozen_version()

        with pytest.raises(dataclasses.FrozenInstanceError):
            version.version = 2

    @pytest.mark.parametrize("version", [0, -1])
    def test_version_starts_at_one(self, version):
        with pytest.raises(ValueError):
            a_frozen_version(version=version)

    @pytest.mark.parametrize("fase", [-1, 8])
    def test_phase_must_exist(self, fase):
        with pytest.raises(ValueError):
            a_frozen_version(fase=fase)

    def test_content_must_be_serializable(self):
        with pytest.raises(ValueError):
            a_frozen_version({"x": object()})

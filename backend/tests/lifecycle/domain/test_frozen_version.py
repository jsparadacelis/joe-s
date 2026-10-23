import dataclasses

import pytest

from backend.app.lifecycle.domain.frozen_version import FrozenVersion


def a_frozen_version(content=None, **overrides):
    values = {
        "study_id": "demo-study",
        "project_id": "demo-project",
        "phase": 2,
        "version": 1,
        "content": content if content is not None else {"titulo": "Brief (sample)"},
        "frozen_by": "demo-user",
    }
    return FrozenVersion.create(**{**values, **overrides})


class TestFrozenVersion:
    def test_keeps_the_content_it_was_frozen_with(self):
        version = a_frozen_version({"titulo": "Brief (sample)", "campos": [1, 2]})

        assert version.content == {"titulo": "Brief (sample)", "campos": [1, 2]}

    def test_changing_the_original_afterwards_does_not_alter_it(self):
        original = {"campos": [1, 2]}
        version = a_frozen_version(original)

        original["campos"].append(3)

        assert version.content == {"campos": [1, 2]}

    def test_changing_the_returned_content_does_not_alter_it(self):
        version = a_frozen_version({"campos": [1, 2]})

        version.content["campos"].append(3)

        assert version.content == {"campos": [1, 2]}

    def test_is_immutable(self):
        version = a_frozen_version()

        with pytest.raises(dataclasses.FrozenInstanceError):
            version.version = 2

    @pytest.mark.parametrize("version", [0, -1])
    def test_version_starts_at_one(self, version):
        with pytest.raises(ValueError):
            a_frozen_version(version=version)

    @pytest.mark.parametrize("phase", [-1, 8])
    def test_phase_must_exist(self, phase):
        with pytest.raises(ValueError):
            a_frozen_version(phase=phase)

    def test_content_must_be_serializable(self):
        with pytest.raises(ValueError):
            a_frozen_version({"x": object()})

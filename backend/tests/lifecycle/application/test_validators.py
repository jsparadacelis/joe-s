"""The validators registered by phase (RGB-32: phase 2 asks for the brief requirements)."""

from backend.app.briefing.domain.validator import BriefDeliverableValidator
from backend.app.lifecycle.application.validators import VALIDATORS_BY_PHASE


def test_phase_2_is_validated_by_the_brief_requirements():
    assert isinstance(VALIDATORS_BY_PHASE[2], BriefDeliverableValidator)

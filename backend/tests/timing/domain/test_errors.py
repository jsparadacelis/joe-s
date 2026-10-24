"""Pause business errors: codes and Spanish messages fixed by the RGB-21 contract."""

from backend.app.timing.domain.errors import (
    AlreadyPaused,
    CannotPauseOpportunity,
    NotAllowed,
    NotPaused,
    ProjectNotFound,
)


def test_messages_and_codes_follow_the_contract():
    assert (NotAllowed().code, NotAllowed().message) == (
        "not_allowed",
        "Solo el director de proyecto o la dirección pueden pausar o reanudar.",
    )
    assert (AlreadyPaused().code, AlreadyPaused().message) == (
        "already_paused",
        "El proyecto ya está en pausa.",
    )
    assert (NotPaused().code, NotPaused().message) == (
        "not_paused",
        "El proyecto no está en pausa.",
    )
    assert (CannotPauseOpportunity().code, CannotPauseOpportunity().message) == (
        "cannot_pause_opportunity",
        "Una oportunidad aún no tiene reloj: se puede pausar desde la fase 1.",
    )
    assert (ProjectNotFound("PRY-1").code, str(ProjectNotFound("PRY-1"))) == (
        "project_not_found",
        "No existe el proyecto PRY-1.",
    )

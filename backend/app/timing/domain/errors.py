"""Pause errors. Messages are user-facing Spanish text fixed by the RGB-21 contract."""

from __future__ import annotations

FIELD_LABELS = {
    "reason": "Motivo",
    "expected_resumption": "Fecha prevista de reanudación",
}


class PauseError(Exception):
    """A business rejection of a pause action. `field` is set for input problems."""

    code = "pause_error"
    field: str | None = None

    def __init__(self, message: str) -> None:
        self.message = message
        super().__init__(message)


class NotAllowed(PauseError):
    code = "not_allowed"

    def __init__(self) -> None:
        super().__init__("Solo el director de proyecto o la dirección pueden pausar o reanudar.")


class AlreadyPaused(PauseError):
    code = "already_paused"

    def __init__(self) -> None:
        super().__init__("El proyecto ya está en pausa.")


class NotPaused(PauseError):
    code = "not_paused"

    def __init__(self) -> None:
        super().__init__("El proyecto no está en pausa.")


class CannotPauseOpportunity(PauseError):
    code = "cannot_pause_opportunity"

    def __init__(self) -> None:
        super().__init__("Una oportunidad aún no tiene reloj: se puede pausar desde la fase 1.")


class RequiredField(PauseError):
    code = "required_field"

    def __init__(self, field: str) -> None:
        self.field = field
        super().__init__(f"El campo «{FIELD_LABELS[field]}» es obligatorio.")


class InvalidField(PauseError):
    code = "invalid_field"

    def __init__(self, field: str, reason: str) -> None:
        self.field = field
        super().__init__(f"El campo «{FIELD_LABELS[field]}» no es válido: {reason}.")


class ProjectNotFound(Exception):
    code = "project_not_found"

    def __init__(self, project_code: str) -> None:
        self.project_code = project_code
        super().__init__(f"No existe el proyecto {project_code}.")

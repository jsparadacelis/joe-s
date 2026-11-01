"""Briefing errors. Messages are user-facing Spanish text."""

from __future__ import annotations

from backend.app.lifecycle.domain.errors import IncompleteDeliverable

BRIEF_FIELD_LABELS = {
    "needs": "Necesidades",
    "program": "Programa",
    "constraints": "Condicionantes",
    "target_budget": "Presupuesto objetivo",
    "deadline": "Plazo",
    "topographic_survey": "Levantamiento topográfico",
    "alignment": "Alineación",
    "client_approval": "Aprobación del cliente",
}


class ProjectNotFound(Exception):
    code = "project_not_found"

    def __init__(self, project_code: str) -> None:
        self.project_code = project_code
        super().__init__(f"No existe el proyecto {project_code}.")


class BriefNotFound(Exception):
    code = "brief_not_found"

    def __init__(self) -> None:
        self.message = "El proyecto aún no tiene brief: se redacta en la fase 2 (Briefing)."
        super().__init__(self.message)


class BriefNotEditable(Exception):
    code = "brief_not_editable"

    def __init__(self) -> None:
        self.message = (
            "El brief solo se puede editar o promover mientras el proyecto está en la fase 2."
        )
        super().__init__(self.message)


class IncompleteBrief(IncompleteDeliverable):
    """What still blocks the promotion. The message only counts the blockers: the labels
    travel in `missing`, so a client that lists them does not repeat them."""

    def __init__(self, missing: list[str]) -> None:
        super().__init__(missing)
        n = len(missing)
        self.message = "El brief no está listo para promover: " + (
            "falta 1 requisito." if n == 1 else f"faltan {n} requisitos."
        )
        self.args = (self.message,)


class PromotionRejected(Exception):
    """The promotion service rejected after the brief was finalized. Raised (not returned) so
    the unit of work rolls the whole transaction back."""

    def __init__(self, error: Exception) -> None:
        self.error = error
        self.code = error.code  # type: ignore[attr-defined]
        self.message = error.message  # type: ignore[attr-defined]
        super().__init__(self.message)


class InvalidBriefRequest(Exception):
    code = "invalid_request"

    def __init__(self) -> None:
        self.message = "La petición debe incluir «fields» (un objeto) con los cambios del brief."
        super().__init__(self.message)


class BriefFieldError(Exception):
    """A brief field problem. `message` is user-facing Spanish text."""

    code = "brief_field_error"

    def __init__(self, field: str, message: str) -> None:
        self.field = field
        self.message = message
        super().__init__(message)


class UnknownBriefField(BriefFieldError):
    code = "unknown_field"

    def __init__(self, field: str) -> None:
        super().__init__(field, f"El campo «{field}» no existe o no se puede editar aquí.")


class InvalidBriefField(BriefFieldError):
    code = "invalid_field"

    def __init__(self, field: str, reason: str) -> None:
        super().__init__(
            field, f"El campo «{BRIEF_FIELD_LABELS.get(field, field)}» no es válido: {reason}."
        )

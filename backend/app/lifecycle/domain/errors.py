"""Business rejections of the lifecycle. Messages are user-facing Spanish text."""

from __future__ import annotations

from typing import Any


class BusinessError(Exception):
    code = "error_de_negocio"

    def __init__(self, message: str) -> None:
        self.message = message
        super().__init__(message)

    def details(self) -> dict[str, Any]:
        return {}


class NoAuthority(BusinessError):
    code = "no_authority"

    def __init__(self, phase: int, allowed: list[str]) -> None:
        self.phase = phase
        self.allowed = allowed
        super().__init__(
            f"No tienes autoridad para esta acción en la fase {phase}. "
            f"Pueden hacerlo: {', '.join(allowed)}."
        )

    def details(self) -> dict[str, Any]:
        return {"allowed": self.allowed}


class IncompleteDeliverable(BusinessError):
    code = "incomplete_deliverable"

    def __init__(self, missing: list[str]) -> None:
        self.missing = missing
        super().__init__(f"El entregable de salida no está listo. Falta: {', '.join(missing)}.")

    def details(self) -> dict[str, Any]:
        return {"missing": self.missing}


class NoNextPhase(BusinessError):
    code = "no_next_phase"

    def __init__(self) -> None:
        super().__init__("El proyecto ya está en la última fase (Cierre): no hay fase siguiente.")


class ActionNotAllowed(BusinessError):
    code = "action_not_allowed"

    def __init__(self, action: str) -> None:
        super().__init__(
            "No perseguir solo es posible en la fase 0 (Oportunidad)."
            if action == "do_not_pursue"
            else f"La acción {action} no está permitida en esta fase."
        )


class ReasonRequired(BusinessError):
    code = "reason_required"

    def __init__(self, action: str) -> None:
        super().__init__(f"La acción «{action.replace('_', ' ')}» exige un motivo.")


class ProjectNotFound(Exception):
    code = "project_not_found"

    def __init__(self, project_code: str) -> None:
        self.project_code = project_code
        super().__init__(f"No existe el proyecto {project_code}.")

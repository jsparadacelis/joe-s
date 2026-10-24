"""Opportunity errors. Messages are user-facing Spanish text."""

from __future__ import annotations


class PlanSettingsError(Exception):
    code = "plan_settings_error"

    def __init__(self, message: str) -> None:
        self.message = message
        super().__init__(message)


class InvalidWeeks(PlanSettingsError):
    code = "invalid_weeks"

    def __init__(self) -> None:
        super().__init__(
            "Cada plantilla necesita exactamente 7 valores de semanas, enteros y entre 1 y 520."
        )


class InvalidFactor(PlanSettingsError):
    code = "invalid_factor"

    def __init__(self) -> None:
        super().__init__("El factor de escala debe ser un número entre 0,1 y 10.")


FIELD_LABELS = {
    "name": "Nombre",
    "client": "Cliente",
    "location": "Localización",
    "project_type": "Tipología",
    "owner": "Responsable",
    "estimated_budget": "Presupuesto estimado",
    "deadline": "Plazo",
    "source": "Fuente",
    "decision_date": "Fecha de decisión",
}


class OpportunityError(Exception):
    """An opportunity input problem. `message` is user-facing Spanish text."""

    code = "opportunity_error"

    def __init__(self, field: str, message: str) -> None:
        self.field = field
        self.message = message
        super().__init__(message)


class RequiredField(OpportunityError):
    code = "required_field"

    def __init__(self, field: str) -> None:
        super().__init__(field, f"El campo «{FIELD_LABELS[field]}» es obligatorio.")


class InvalidField(OpportunityError):
    code = "invalid_field"

    def __init__(self, field: str, reason: str) -> None:
        super().__init__(field, f"El campo «{FIELD_LABELS[field]}» no es válido: {reason}.")

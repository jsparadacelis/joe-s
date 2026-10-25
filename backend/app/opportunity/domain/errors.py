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


CRITERION_LABELS = {
    "client_fit": "Encaje del cliente",
    "location": "Localización",
    "typology": "Tipología",
    "budget": "Presupuesto",
    "timeline": "Plazo",
    "source": "Fuente",
    "probability": "Probabilidad",
}


class ScoringError(Exception):
    """A scoring rejection. `field` is set only when one criterion is to blame."""

    code = "scoring_error"
    field: str | None = None

    def __init__(self, message: str) -> None:
        self.message = message
        super().__init__(message)


class InvalidWeights(ScoringError):
    code = "invalid_weights"

    def __init__(self) -> None:
        super().__init__(
            "Los 7 pesos son obligatorios y deben ser números mayores que 0 y de hasta 10, "
            "con un máximo de 2 decimales."
        )


class InvalidThreshold(ScoringError):
    code = "invalid_threshold"

    def __init__(self) -> None:
        super().__init__("El umbral debe ser un número entero entre 1 y 100.")


class InvalidRatings(ScoringError):
    code = "invalid_ratings"

    def __init__(self, field: str | None) -> None:
        self.field = field
        if field is None:
            message = "Las puntuaciones deben enviarse como un objeto con los 7 criterios."
        elif field in CRITERION_LABELS:
            message = (
                f"La puntuación de «{CRITERION_LABELS[field]}» debe ser un entero entre 1 y 5."
            )
        else:
            message = f"El criterio «{field}» no existe."
        super().__init__(message)


class NotAnOpportunity(ScoringError):
    code = "not_an_opportunity"

    def __init__(self) -> None:
        super().__init__("Solo se puede puntuar una oportunidad (fase 0).")


class ScoringNotFound(ScoringError):
    code = "scoring_not_found"

    def __init__(self) -> None:
        super().__init__("La oportunidad aún no tiene scoring.")


class ProjectNotFound(Exception):
    code = "project_not_found"

    def __init__(self, project_code: str) -> None:
        self.project_code = project_code
        super().__init__(f"No existe el proyecto {project_code}.")


class InvalidScale(PlanSettingsError):
    code = "invalid_scale"

    def __init__(self) -> None:
        super().__init__("La escala debe ser pequeña, mediana o grande.")


class PlanAlreadyConfirmed(Exception):
    code = "plan_already_confirmed"

    def __init__(self) -> None:
        self.message = "El proyecto ya tiene un plan confirmado."
        super().__init__(self.message)


class PlanNotFound(Exception):
    code = "plan_not_found"

    def __init__(self) -> None:
        self.message = "El proyecto aún no tiene un plan confirmado."
        super().__init__(self.message)


class ProjectNotInOpportunityPhase(Exception):
    code = "project_not_in_opportunity_phase"

    def __init__(self) -> None:
        self.message = "Solo se puede promover o descartar una oportunidad (fase 0)."
        super().__init__(self.message)

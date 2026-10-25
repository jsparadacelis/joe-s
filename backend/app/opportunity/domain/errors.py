"""Opportunity errors. Messages are user-facing Spanish text."""

from __future__ import annotations

from backend.app.lifecycle.domain.errors import IncompleteDeliverable


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


class SheetNotFound(Exception):
    code = "sheet_not_found"

    def __init__(self) -> None:
        self.message = "El proyecto aún no tiene ficha: es una oportunidad (fase 0)."
        super().__init__(self.message)


class SheetNotEditable(Exception):
    code = "sheet_not_editable"

    def __init__(self) -> None:
        self.message = "La ficha solo se puede editar mientras el proyecto está en la fase 1."
        super().__init__(self.message)


class IncompleteSheet(IncompleteDeliverable):
    """The sheet still has required fields to fill. The message only counts them: the labels
    travel in `missing`, so a client that lists them does not repeat them."""

    def __init__(self, missing: list[str]) -> None:
        super().__init__(missing)
        n = len(missing)
        self.message = "La ficha no está completa: " + (
            "falta 1 campo obligatorio." if n == 1 else f"faltan {n} campos obligatorios."
        )
        self.args = (self.message,)


class PromotionRejected(Exception):
    """The promotion service rejected after the sheet content was finalized. Raised (not
    returned) so the unit of work rolls the whole transaction back."""

    def __init__(self, error: Exception) -> None:
        self.error = error
        self.code = error.code  # type: ignore[attr-defined]
        self.message = error.message  # type: ignore[attr-defined]
        super().__init__(self.message)


class InvalidSheetRequest(Exception):
    code = "invalid_request"

    def __init__(self) -> None:
        self.message = (
            "La petición debe incluir «fields» (un objeto) o «plan» (un objeto) con los cambios."
        )
        super().__init__(self.message)


class InvalidProjectType(PlanSettingsError):
    code = "invalid_project_type"

    def __init__(self) -> None:
        super().__init__("La tipología no es válida.")


SHEET_FIELD_LABELS = {
    "cadastral_reference": "Referencia catastral",
    "scope_included": "Alcance incluido",
    "scope_excluded": "Alcance excluido",
    "contract_signed_on": "Fecha de firma del contrato",
    "sponsor": "Promotor",
    "project_director": "Dirección del proyecto",
    "technical_lead": "Responsable técnico",
    "team": "Equipo",
    "external_collaborators": "Colaboradores externos",
    "contact": "Contacto del cliente",
    "next_milestone": "Próximo hito",
    "next_milestone_on": "Fecha del próximo hito",
    "main_risk": "Riesgo principal",
    "risk_owner": "Responsable del riesgo",
    "repository_path": "Ruta del repositorio",
}


class SheetFieldError(Exception):
    """A sheet field problem. `message` is user-facing Spanish text."""

    code = "sheet_field_error"

    def __init__(self, field: str, message: str) -> None:
        self.field = field
        self.message = message
        super().__init__(message)


class UnknownSheetField(SheetFieldError):
    code = "unknown_field"

    def __init__(self, field: str) -> None:
        super().__init__(field, f"El campo «{field}» no existe o no se puede editar aquí.")


class InvalidSheetField(SheetFieldError):
    code = "invalid_field"

    def __init__(self, field: str, reason: str) -> None:
        label = SHEET_FIELD_LABELS.get(field, field)
        super().__init__(field, f"El campo «{label}» no es válido: {reason}.")

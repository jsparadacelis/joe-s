"""Plan settings errors. Messages are user-facing Spanish text."""

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

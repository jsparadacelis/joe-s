"""Business rejections of the technical data context. Messages are user-facing Spanish text."""

from __future__ import annotations


class TechnicalDataError(Exception):
    code = "technical_data_error"

    def __init__(self, message: str) -> None:
        self.message = message
        super().__init__(message)


class UnknownDatum(TechnicalDataError):
    code = "unknown_datum"

    def __init__(self) -> None:
        super().__init__("No existe ese dato técnico.")


class InvalidDatumValue(TechnicalDataError):
    code = "invalid_datum_value"


class EmptyDatum(TechnicalDataError):
    code = "empty_datum"

    def __init__(self) -> None:
        super().__init__("Un dato vacío no se puede verificar.")


class ProjectNotFound(TechnicalDataError):
    code = "project_not_found"

    def __init__(self) -> None:
        super().__init__("No existe ese proyecto.")


class TechnicalDataNotEditable(TechnicalDataError):
    code = "technical_data_not_editable"

    def __init__(self) -> None:
        super().__init__(
            "Los datos técnicos solo se pueden cambiar mientras el proyecto está en la fase 2 "
            "(Briefing)."
        )

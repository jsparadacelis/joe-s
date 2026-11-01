"""Why a cadastre query gives no data. Messages are user-facing Spanish text."""

from __future__ import annotations


class CadastreError(Exception):
    code = "cadastre_error"
    message = "Error del Catastro."

    def __str__(self) -> str:
        return self.message


class CadastreNotFound(CadastreError):
    """The service answered, and that reference does not exist (or is malformed for it)."""

    code = "cadastral_reference_not_found"
    message = "No se encontró esa referencia en el Catastro."


class CadastreUnavailable(CadastreError):
    """The service could not be consulted or its answer could not be trusted: manual entry."""

    code = "cadastre_unavailable"
    message = "No se pudo consultar el Catastro. Introduce los datos a mano."

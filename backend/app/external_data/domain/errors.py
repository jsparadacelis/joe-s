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


class PlotNotFound(CadastreNotFound):
    """The plot service answered, and it has no plot for that reference."""

    code = "plot_not_found"
    message = "No se encontró la parcela en el Catastro."


class ExternalServiceUnavailable(CadastreError):
    """Open-Meteo or PVGIS could not be consulted or their answer could not be trusted."""

    code = "external_service_unavailable"
    message = "No se pudo consultar el servicio externo. Introduce el dato a mano."


class ReliefUnavailable(CadastreError):
    """The elevation model could not be consulted or its answer could not be trusted: the
    plot can still be worked on, only the 3D view is missing."""

    code = "relief_unavailable"
    message = "No se pudo obtener el relieve. Puedes seguir sin el visor 3D."

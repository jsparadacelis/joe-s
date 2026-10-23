"""Quién puede promover en cada fase. Las claves vienen del PRD (`fases_config.autoridad`)."""

from __future__ import annotations

from backend.app.estudio.domain.contexto import ContextoDeSolicitud, Habilitacion, Rol

_ROLES = {
    "socio_director": {Rol.SOCIO, Rol.DIRECTOR},
    "director_de_proyecto": {Rol.DIRECTOR_DE_PROYECTO},
}

_HABILITACIONES = {
    "firmante_habilitado": Habilitacion.FIRMANTE_HABILITADO,
    "direccion_facultativa": Habilitacion.DIRECCION_FACULTATIVA,
    "sponsor": Habilitacion.SPONSOR,
}

_ETIQUETAS = {
    "socio_director": ["Socio", "Director"],
    "director_de_proyecto": ["Director de proyecto"],
    "firmante_habilitado": ["Firmante habilitado"],
    "direccion_facultativa": ["Dirección facultativa"],
    "sponsor": ["Sponsor"],
}


def tiene_autoridad(autoridad: str, contexto: ContextoDeSolicitud) -> bool:
    if autoridad in _ROLES:
        return contexto.rol in _ROLES[autoridad]
    habilitacion = _HABILITACIONES.get(autoridad)
    return habilitacion is not None and habilitacion in contexto.habilitaciones


def quien_puede(autoridad: str) -> list[str]:
    return list(_ETIQUETAS.get(autoridad, []))

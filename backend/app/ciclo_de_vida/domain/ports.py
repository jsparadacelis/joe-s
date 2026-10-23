"""Puertos del ciclo de vida."""

from __future__ import annotations

from typing import TYPE_CHECKING, Any, Protocol

if TYPE_CHECKING:
    from backend.app.ciclo_de_vida.domain.entregable import EntregableDeSalida
    from backend.app.ciclo_de_vida.domain.promocion import Promocion
    from backend.app.ciclo_de_vida.domain.proyecto import Proyecto
    from backend.app.ciclo_de_vida.domain.version_congelada import VersionCongelada


class ValidadorDeEntregable(Protocol):
    """Cada fase aporta el suyo: devuelve lo que falta en el contenido (vacío si está listo)."""

    def validar(self, contenido: dict[str, Any]) -> list[str]: ...


class CicloDeVidaRepositorio(Protocol):
    def obtener_proyecto(self, codigo: str) -> Proyecto | None:
        """Lo devuelve bloqueado para la transacción en curso."""
        ...

    def obtener_entregable(self, proyecto_id: str, fase: int) -> EntregableDeSalida | None: ...

    def proxima_version(self, proyecto_id: str, fase: int) -> int: ...

    def congelar(self, version: VersionCongelada) -> None: ...

    def registrar_promocion(self, promocion: Promocion) -> None: ...

    def cambiar_fase(self, proyecto_id: str, fase: int) -> None: ...

    def abrir_entregable(self, proyecto_id: str, fase: int) -> None: ...

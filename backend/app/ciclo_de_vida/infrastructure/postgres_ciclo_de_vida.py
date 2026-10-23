"""Adaptador Postgres del ciclo de vida: usa la conexión de la transacción de negocio."""

from __future__ import annotations

import psycopg
from psycopg.types.json import Jsonb

from backend.app.ciclo_de_vida.domain.entregable import EntregableDeSalida
from backend.app.ciclo_de_vida.domain.promocion import Promocion
from backend.app.ciclo_de_vida.domain.proyecto import Proyecto, Semaforo
from backend.app.ciclo_de_vida.domain.version_congelada import VersionCongelada


class PostgresCicloDeVida:
    def __init__(self, conn: psycopg.Connection) -> None:
        self._conn = conn

    def obtener_proyecto(self, codigo: str) -> Proyecto | None:
        row = self._conn.execute(
            "SELECT id::text, estudio_id::text, codigo, nombre, fase_actual, activo, en_pausa, "
            "responsable_id, proximo_hito, semaforo FROM proyectos WHERE codigo = %s FOR UPDATE",
            (codigo,),
        ).fetchone()
        if row is None:
            return None
        id_, estudio_id, codigo, nombre, fase, activo, en_pausa, responsable, hito, semaforo = row
        return Proyecto(
            id=id_,
            estudio_id=estudio_id,
            codigo=codigo,
            nombre=nombre,
            fase_actual=fase,
            activo=activo,
            en_pausa=en_pausa,
            responsable_id=responsable,
            proximo_hito=hito,
            semaforo=Semaforo(semaforo) if semaforo else None,
        )

    def obtener_entregable(self, proyecto_id: str, fase: int) -> EntregableDeSalida | None:
        row = self._conn.execute(
            "SELECT contenido, completo, aprobado FROM entregables_salida "
            "WHERE proyecto_id = %s::uuid AND fase = %s",
            (proyecto_id, fase),
        ).fetchone()
        return None if row is None else EntregableDeSalida(fase, row[0], row[1], row[2])

    def proxima_version(self, proyecto_id: str, fase: int) -> int:
        return self._conn.execute(
            "SELECT coalesce(max(version), 0) + 1 FROM versiones_congeladas "
            "WHERE proyecto_id = %s::uuid AND fase = %s",
            (proyecto_id, fase),
        ).fetchone()[0]

    def congelar(self, version: VersionCongelada) -> None:
        self._conn.execute(
            "INSERT INTO versiones_congeladas (estudio_id, proyecto_id, fase, version, contenido, "
            "congelada_por) VALUES (%s::uuid, %s::uuid, %s, %s, %s, %s)",
            (
                version.estudio_id,
                version.proyecto_id,
                version.fase,
                version.version,
                Jsonb(version.contenido),
                version.congelada_por,
            ),
        )

    def registrar_promocion(self, promocion: Promocion) -> None:
        self._conn.execute(
            "INSERT INTO promociones (estudio_id, proyecto_id, accion, de_fase, a_fase, "
            "usuario_id, resultado, motivo) VALUES (%s::uuid, %s::uuid, %s, %s, %s, %s, %s, %s)",
            (
                promocion.estudio_id,
                promocion.proyecto_id,
                promocion.accion.value,
                promocion.de_fase,
                promocion.a_fase,
                promocion.usuario_id,
                promocion.resultado.value,
                promocion.motivo,
            ),
        )

    def cambiar_fase(self, proyecto_id: str, fase: int) -> None:
        self._conn.execute(
            "UPDATE proyectos SET fase_actual = %s, actualizado_en = now() WHERE id = %s::uuid",
            (fase, proyecto_id),
        )

    def abrir_entregable(self, proyecto_id: str, fase: int) -> None:
        self._conn.execute(
            "INSERT INTO entregables_salida (estudio_id, proyecto_id, fase) "
            "SELECT estudio_id, id, %s FROM proyectos WHERE id = %s::uuid "
            "ON CONFLICT (proyecto_id, fase) DO NOTHING",
            (fase, proyecto_id),
        )

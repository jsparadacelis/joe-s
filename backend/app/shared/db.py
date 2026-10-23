"""Transacciones con el contexto de estudio fijado, para que actúe la RLS."""

from __future__ import annotations

from collections.abc import Iterator
from contextlib import contextmanager

import psycopg

from backend.app.estudio.domain.contexto import ContextoDeSolicitud


@contextmanager
def transaccion_de_estudio(
    database_url: str, contexto: ContextoDeSolicitud
) -> Iterator[psycopg.Connection]:
    """Abre una transacción como `rgb_app` con `app.estudio_id` válido solo en ella.

    Confirma al salir sin error y deshace si hay excepción.
    """
    with psycopg.connect(database_url) as conn:
        conn.execute("SET LOCAL ROLE rgb_app")
        conn.execute("SELECT set_config('app.estudio_id', %s, true)", (contexto.estudio_id,))
        yield conn

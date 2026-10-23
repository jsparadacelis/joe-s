"""Validadores de entregable por fase. Cada tarea de fase registra el suyo aquí."""

from __future__ import annotations

from backend.app.ciclo_de_vida.domain.ports import ValidadorDeEntregable

VALIDADORES_POR_FASE: dict[int, ValidadorDeEntregable] = {}

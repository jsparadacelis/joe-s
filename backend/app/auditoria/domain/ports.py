"""Puertos del contexto de auditoría."""

from __future__ import annotations

from typing import Protocol

from backend.app.auditoria.domain.evento import EventoDeAuditoria


class RegistroDeAuditoria(Protocol):
    def registrar(self, evento: EventoDeAuditoria) -> None: ...

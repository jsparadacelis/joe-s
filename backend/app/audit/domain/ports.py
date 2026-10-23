"""Ports of the audit context."""

from __future__ import annotations

from typing import Protocol

from backend.app.audit.domain.event import AuditEvent


class AuditLog(Protocol):
    def record(self, event: AuditEvent) -> None: ...

"""Deliverable validators by phase. Each phase task registers its own here."""

from __future__ import annotations

from backend.app.lifecycle.domain.ports import DeliverableValidator

VALIDATORS_BY_PHASE: dict[int, DeliverableValidator] = {}

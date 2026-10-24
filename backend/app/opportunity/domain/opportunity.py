"""Opportunity: what is captured when a project is born. Pure validation of the raw input."""

from __future__ import annotations

import math
import re
from collections.abc import Mapping
from dataclasses import dataclass
from datetime import date
from decimal import Decimal
from typing import Any

from backend.app.opportunity.domain.errors import InvalidField, RequiredField
from backend.app.opportunity.domain.plan import ProjectType

MAX_BUDGET = Decimal("1000000000")
_ISO_DATE = re.compile(r"\d{4}-\d{2}-\d{2}")


def _storable(text: str) -> bool:
    """Postgres text cannot hold NUL, and lone surrogates are not valid UTF-8."""
    if "\x00" in text:
        return False
    try:
        text.encode("utf-8")
    except UnicodeEncodeError:
        return False
    return True


def _text(data: Mapping[str, Any], field: str, max_length: int, *, required: bool) -> str | None:
    value = data.get(field)
    if value is None:
        if required:
            raise RequiredField(field)
        return None
    if not isinstance(value, str):
        raise InvalidField(field, "debe ser un texto")
    value = value.strip()
    if not value:
        if required:
            raise RequiredField(field)
        return None
    if not _storable(value):
        raise InvalidField(field, "contiene caracteres no permitidos")
    if len(value) > max_length:
        raise InvalidField(field, f"no puede superar los {max_length} caracteres")
    return value


def _project_type(data: Mapping[str, Any]) -> ProjectType:
    value = _text(data, "project_type", 1000, required=True)
    try:
        return ProjectType(value)
    except ValueError:
        raise InvalidField("project_type", "no es una tipología admitida") from None


def _budget(data: Mapping[str, Any]) -> Decimal | None:
    value = data.get("estimated_budget")
    if value is None:
        return None
    field = "estimated_budget"
    if isinstance(value, bool) or not isinstance(value, int | float | Decimal):
        raise InvalidField(field, "debe ser un número")
    if isinstance(value, float) and not math.isfinite(value):
        raise InvalidField(field, "debe ser un número")
    amount = Decimal(str(value))
    if not amount.is_finite():
        raise InvalidField(field, "debe ser un número")
    if amount < 0:
        raise InvalidField(field, "no puede ser negativo")
    if amount > MAX_BUDGET:
        raise InvalidField(field, "no puede superar 1.000.000.000 €")
    if amount != amount.quantize(Decimal("0.01")):
        raise InvalidField(field, "admite como máximo 2 decimales")
    return amount.quantize(Decimal("0.01"))


def _date(data: Mapping[str, Any], field: str) -> date | None:
    value = data.get(field)
    if value is None:
        return None
    if not isinstance(value, str):
        raise InvalidField(field, "debe ser una fecha con formato aaaa-mm-dd")
    value = value.strip()
    if not value:
        return None
    if not _ISO_DATE.fullmatch(value):
        raise InvalidField(field, "debe ser una fecha con formato aaaa-mm-dd")
    try:
        return date.fromisoformat(value)
    except ValueError:
        raise InvalidField(field, "no es una fecha existente") from None


@dataclass(frozen=True)
class Opportunity:
    name: str
    client: str
    location: str
    project_type: ProjectType
    owner: str
    estimated_budget: Decimal | None = None
    deadline: date | None = None
    source: str | None = None
    decision_date: date | None = None

    @classmethod
    def from_input(cls, data: Mapping[str, Any]) -> Opportunity:
        """Validate every field; the first problem, in the contract's order, is raised."""
        return cls(
            name=_text(data, "name", 120, required=True),
            client=_text(data, "client", 120, required=True),
            location=_text(data, "location", 200, required=True),
            project_type=_project_type(data),
            owner=_text(data, "owner", 120, required=True),
            estimated_budget=_budget(data),
            deadline=_date(data, "deadline"),
            source=_text(data, "source", 120, required=False),
            decision_date=_date(data, "decision_date"),
        )

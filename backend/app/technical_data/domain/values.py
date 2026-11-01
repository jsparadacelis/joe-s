"""What each type of datum accepts. A valid value is stored trimmed; a number always with a
decimal comma, as the screen shows it."""

from __future__ import annotations

import re
from decimal import Decimal

from backend.app.shared.text import is_storable
from backend.app.technical_data.domain.catalog import DatumDefinition, DatumType
from backend.app.technical_data.domain.errors import InvalidDatumValue

MAX_TEXT_LENGTH = 200
_NUMBER = re.compile(r"[0-9]+(?:[.,][0-9]+)?|-[0-9]+(?:[.,][0-9]+)?")
_DEFAULT_RANGE = (Decimal(0), Decimal(10_000_000))
_RANGES = {
    "altitude": (Decimal(-500), Decimal(9000)),
    "year": (Decimal(1000), Decimal(2100)),
}
_PERCENT_RANGE = (Decimal(0), Decimal(100))
_INTEGERS = frozenset({"year"})


def normalize_value(definition: DatumDefinition, raw: object) -> str:
    """Raises `InvalidDatumValue` (with a Spanish message) when `raw` does not fit."""
    if not isinstance(raw, str) or not is_storable(raw):
        raise InvalidDatumValue("El valor no es válido.")
    value = raw.strip()
    if definition.type is DatumType.TEXT:
        return _text(value)
    if definition.type is DatumType.NUMBER:
        return _number(definition, value)
    return _option(definition, value)


def _text(value: str) -> str:
    if not value:
        raise InvalidDatumValue("El valor no puede estar vacío.")
    if len(value) > MAX_TEXT_LENGTH:
        raise InvalidDatumValue(f"El valor no puede superar los {MAX_TEXT_LENGTH} caracteres.")
    return value


def _number(definition: DatumDefinition, value: str) -> str:
    low, high = _range_of(definition)
    if _NUMBER.fullmatch(value) is None:
        raise InvalidDatumValue("Introduce un número, con coma o punto decimal.")
    stored = value.replace(".", ",")
    number = Decimal(stored.replace(",", "."))
    if definition.id in _INTEGERS and "," in stored:
        raise InvalidDatumValue("Introduce un número entero.")
    if not low <= number <= high:
        raise InvalidDatumValue(f"El valor debe estar entre {low} y {high}.")
    return stored


def _range_of(definition: DatumDefinition) -> tuple[Decimal, Decimal]:
    if definition.id in _RANGES:
        return _RANGES[definition.id]
    return _PERCENT_RANGE if definition.unit == "%" else _DEFAULT_RANGE


def _option(definition: DatumDefinition, value: str) -> str:
    options = definition.options or ()
    if value not in options:
        raise InvalidDatumValue(f"Elige una de estas opciones: {', '.join(options)}.")
    return value

"""Validation of the cadastral reference: the key to the technical data and the relief.

A reference is 20 alphanumeric characters: 14 identify the plot and 6 the property. The same
rules, messages included, live in `frontend/lib/cadastral-reference.ts`; both read
`backend/tests/external_data/domain/cadastral_cases.json`. Messages are user-facing Spanish text.
"""

from __future__ import annotations

LENGTH = 20
PLOT_LENGTH = 14

# Removed wherever they appear. Fixed on purpose (not "any Unicode whitespace") so the server
# and the browser agree: anything else that is not a letter or digit is a symbol.
_IGNORED = frozenset(" \t\r\n ")


class InvalidCadastralReference(ValueError):
    def __init__(self, code: str, message: str) -> None:
        self.code = code
        self.message = message
        super().__init__(message)


def _without_spaces(raw: str) -> str:
    return "".join(char for char in raw if char not in _IGNORED)


def normalize_cadastral_reference(raw: str) -> str:
    """Upper case and without spaces. Does not validate."""
    return _without_spaces(raw).upper()


def validate_cadastral_reference(raw: str) -> str:
    """Return the normalized reference or raise `InvalidCadastralReference`."""
    compact = _without_spaces(raw) if isinstance(raw, str) else ""
    if not compact:
        raise InvalidCadastralReference(
            "cadastral_reference_required", "Introduce la referencia catastral."
        )
    # Checked before upper casing: "ß".upper() would turn a symbol into the letters "SS".
    if not all(char.isascii() and char.isalnum() for char in compact):
        raise InvalidCadastralReference(
            "invalid_cadastral_reference",
            "La referencia catastral solo puede llevar letras y números, sin símbolos ni guiones.",
        )
    reference = compact.upper()
    if len(reference) == PLOT_LENGTH:
        raise InvalidCadastralReference(
            "plot_reference_only",
            f"Has escrito {PLOT_LENGTH} caracteres: es la referencia de la parcela. "
            f"La referencia catastral completa tiene {LENGTH} ({PLOT_LENGTH} de la parcela y "
            f"{LENGTH - PLOT_LENGTH} del inmueble); añade los {LENGTH - PLOT_LENGTH} que faltan.",
        )
    if len(reference) != LENGTH:
        raise InvalidCadastralReference(
            "invalid_cadastral_reference",
            f"La referencia catastral tiene {LENGTH} caracteres ({PLOT_LENGTH} de la parcela y "
            f"{LENGTH - PLOT_LENGTH} del inmueble) y has escrito {len(reference)}.",
        )
    return reference

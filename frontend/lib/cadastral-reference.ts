/**
 * Cadastral reference validation: 20 alphanumeric characters (14 of the plot and 6 of the
 * property). Same rules and messages as the server (`backend/app/external_data/domain/
 * cadastral_reference.py`); both read `backend/tests/external_data/domain/cadastral_cases.json`.
 */

export const CADASTRAL_REFERENCE_LENGTH = 20;
export const PLOT_REFERENCE_LENGTH = 14;

export type CadastralReferenceCode =
  | "cadastral_reference_required"
  | "invalid_cadastral_reference"
  | "plot_reference_only";

export type CadastralReferenceResult =
  | { valid: true; value: string }
  | { valid: false; code: CadastralReferenceCode; message: string };

// Removed wherever they appear. Fixed on purpose (not `\s`) so the browser and the server agree.
const IGNORED = /[ \t\r\n ]/g;
const ASCII_ALPHANUMERIC = /^[A-Za-z0-9]+$/;

/** Upper case and without spaces. Does not validate. */
export function normalizeCadastralReference(raw: string): string {
  return raw.replace(IGNORED, "").toUpperCase();
}

export function validateCadastralReference(raw: string): CadastralReferenceResult {
  const compact = typeof raw === "string" ? raw.replace(IGNORED, "") : "";
  if (compact === "") {
    return { valid: false, code: "cadastral_reference_required", message: "Introduce la referencia catastral." };
  }
  // Checked before upper casing: "ß".toUpperCase() would turn a symbol into the letters "SS".
  if (!ASCII_ALPHANUMERIC.test(compact)) {
    return {
      valid: false,
      code: "invalid_cadastral_reference",
      message: "La referencia catastral solo puede llevar letras y números, sin símbolos ni guiones.",
    };
  }
  const value = compact.toUpperCase();
  const propertyPart = CADASTRAL_REFERENCE_LENGTH - PLOT_REFERENCE_LENGTH;
  if (value.length === PLOT_REFERENCE_LENGTH) {
    return {
      valid: false,
      code: "plot_reference_only",
      message:
        `Has escrito ${PLOT_REFERENCE_LENGTH} caracteres: es la referencia de la parcela. ` +
        `La referencia catastral completa tiene ${CADASTRAL_REFERENCE_LENGTH} (${PLOT_REFERENCE_LENGTH} de la parcela y ` +
        `${propertyPart} del inmueble); añade los ${propertyPart} que faltan.`,
    };
  }
  if (value.length !== CADASTRAL_REFERENCE_LENGTH) {
    return {
      valid: false,
      code: "invalid_cadastral_reference",
      message:
        `La referencia catastral tiene ${CADASTRAL_REFERENCE_LENGTH} caracteres (${PLOT_REFERENCE_LENGTH} de la parcela y ` +
        `${propertyPart} del inmueble) y has escrito ${value.length}.`,
    };
  }
  return { valid: true, value };
}

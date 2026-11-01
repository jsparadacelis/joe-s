/**
 * RGB-32b contract of the client-side validation in `@/lib/brief` (mirrors the server; the server rules):
 *   validateBriefField(id: BriefFieldId, draft: string): string | null
 *     null = valid; otherwise the Spanish message to show next to the field. An empty (or blank) draft is valid for every field except client_approval:
 *     it clears the field. The draft is trimmed first.
 *   Messages (exact):
 *     target_budget  «El presupuesto objetivo debe ser un número mayor que 0, con punto decimal y hasta 2 decimales.»
 *     target_budget > 1.000 millones  «El presupuesto objetivo no puede superar 1.000.000.000 €.»
 *     deadline       «El plazo debe ser una fecha real con el formato AAAA-MM-DD, entre los años 2000 y 2100.»
 *     text fields    «El campo «<etiqueta>» no puede superar 2000 caracteres.» / «El campo «<etiqueta>» contiene caracteres no válidos.» (NUL)
 *     client_approval  «La aprobación del cliente no es válida.» when not one of the four values
 *   parseBudget(draft: string): number | null   the number to send (null when blank or invalid).
 */
import { parseBudget, validateBriefField } from "@/lib/brief";

const BUDGET_MESSAGE = "El presupuesto objetivo debe ser un número mayor que 0, con punto decimal y hasta 2 decimales.";
const BUDGET_MAX_MESSAGE = "El presupuesto objetivo no puede superar 1.000.000.000 €.";
const DEADLINE_MESSAGE = "El plazo debe ser una fecha real con el formato AAAA-MM-DD, entre los años 2000 y 2100.";

describe("target_budget", () => {
  it.each(["250000", "250000.5", "250000.50", "0.01", "1", "1000000000", "1000000000.00", " 250000 ", "00100"])("%j is valid", (draft) => {
    expect(validateBriefField("target_budget", draft)).toBeNull();
  });

  it.each(["0", "0.00", "-1", "-0.5", "abc", "250.000 €", "250000 €", "1,5", "1e5", "0x10", "12.345", "0.001", "1..2", "NaN", "Infinity", "+5", "."])(
    "%j is rejected with the number message",
    (draft) => {
      expect(validateBriefField("target_budget", draft)).toBe(BUDGET_MESSAGE);
    },
  );

  it.each(["1000000000.01", "1000000001", "99999999999"])("%j exceeds the cap", (draft) => {
    expect(validateBriefField("target_budget", draft)).toBe(BUDGET_MAX_MESSAGE);
  });

  it.each(["", "   "])("blank %j is valid (clears the field)", (draft) => {
    expect(validateBriefField("target_budget", draft)).toBeNull();
  });

  it("parseBudget gives the number to send", () => {
    expect(parseBudget("250000")).toBe(250000);
    expect(parseBudget(" 250000.50 ")).toBe(250000.5);
    expect(parseBudget("1000000000")).toBe(1000000000);
  });

  it.each(["", "  ", "abc", "0", "-3", "1,5"])("parseBudget(%j) is null", (draft) => {
    expect(parseBudget(draft)).toBeNull();
  });
});

describe("deadline", () => {
  it.each(["2000-01-01", "2100-12-31", "2027-06-30", "2024-02-29", "2000-02-29", " 2027-06-30 "])("%j is valid", (draft) => {
    expect(validateBriefField("deadline", draft)).toBeNull();
  });

  it.each([
    "1999-12-31",
    "2101-01-01",
    "2026-02-30",
    "2025-02-29",
    "2100-02-29",
    "2026-13-01",
    "2026-00-10",
    "2026-04-31",
    "2026-1-5",
    "30/06/2027",
    "2027-06-30T10:00",
    "mañana",
    "20270630",
    "2027-06-3",
  ])("%j is rejected", (draft) => {
    expect(validateBriefField("deadline", draft)).toBe(DEADLINE_MESSAGE);
  });

  it("blank is valid (clears the field)", () => {
    expect(validateBriefField("deadline", "")).toBeNull();
  });
});

describe("text fields", () => {
  const TEXT_FIELDS = [
    ["needs", "Necesidades"],
    ["program", "Programa"],
    ["constraints", "Condicionantes"],
    ["topographic_survey", "Levantamiento topográfico"],
    ["alignment", "Alineación"],
  ] as const;

  it.each(TEXT_FIELDS)("%s accepts exactly 2000 characters and rejects 2001", (id, label) => {
    expect(validateBriefField(id, "a".repeat(2000))).toBeNull();
    expect(validateBriefField(id, "a".repeat(2001))).toBe(`El campo «${label}» no puede superar 2000 caracteres.`);
  });

  it.each(TEXT_FIELDS)("%s measures the trimmed text", (id) => {
    expect(validateBriefField(id, `  ${"a".repeat(2000)}  \n`)).toBeNull();
  });

  it.each(TEXT_FIELDS)("%s rejects a NUL character", (id, label) => {
    expect(validateBriefField(id, "ab\u0000cd")).toBe(`El campo «${label}» contiene caracteres no válidos.`);
  });

  it("accepts accents, newlines and emoji-free punctuation", () => {
    expect(validateBriefField("needs", "Ático con vistas\nSegunda línea: ¿sí?")).toBeNull();
  });

  it("blank is valid (clears the field)", () => {
    expect(validateBriefField("program", "   \n ")).toBeNull();
  });
});

describe("client_approval", () => {
  it.each(["pending", "email", "meeting", "signed"])("%s is valid", (value) => {
    expect(validateBriefField("client_approval", value)).toBeNull();
  });

  it.each(["", "other", "Signed", "firmado"])("%j is rejected", (value) => {
    expect(validateBriefField("client_approval", value)).toBe("La aprobación del cliente no es válida.");
  });
});

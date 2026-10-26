import { readFileSync } from "fs";
import path from "path";

import { normalizeCadastralReference, validateCadastralReference } from "@/lib/cadastral-reference";

interface SharedCase {
  name: string;
  input: string;
  valid: boolean;
  value: string | null;
  message: string | null;
}
// Same file the backend reads (test_cadastral_reference.py): the server is the reference.
const sharedCases: SharedCase[] = JSON.parse(
  readFileSync(path.join(__dirname, "../../../backend/tests/external_data/domain/cadastral_cases.json"), "utf8"),
);

describe("validateCadastralReference parity with the server", () => {
  it.each(sharedCases.map((c) => [c.name, c] as const))("%s", (_name, c) => {
    const result = validateCadastralReference(c.input);
    expect(result.valid).toBe(c.valid);
    if (c.valid) {
      expect(result).toEqual({ valid: true, value: c.value });
    } else {
      expect(result).toMatchObject({ valid: false, message: c.message });
    }
  });
});

describe("normalizeCadastralReference parity with the server", () => {
  it.each(sharedCases.filter((c) => c.value !== null).map((c) => [c.name, c] as const))("%s", (_name, c) => {
    expect(normalizeCadastralReference(c.input)).toBe(c.value);
  });
});

describe("error codes", () => {
  it("tells the plot reference apart", () => {
    expect(validateCadastralReference("0000000AA0000A")).toMatchObject({ valid: false, code: "plot_reference_only" });
  });
  it("uses a required code for an empty input", () => {
    expect(validateCadastralReference("")).toMatchObject({ valid: false, code: "cadastral_reference_required" });
  });
  it("uses the invalid code for symbols and wrong lengths", () => {
    expect(validateCadastralReference("12#")).toMatchObject({ valid: false, code: "invalid_cadastral_reference" });
    expect(validateCadastralReference("123")).toMatchObject({ valid: false, code: "invalid_cadastral_reference" });
  });
});

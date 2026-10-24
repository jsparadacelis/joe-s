import { ApiError } from "@/lib/api";
import {
  EMPTY_DRAFT,
  FIELD_LABELS,
  MAX_BUDGET,
  OPPORTUNITY_FIELDS,
  createOpportunity,
  toOpportunityPayload,
  validateOpportunity,
  type OpportunityDraft,
} from "@/lib/opportunities";
import { PROJECT_TYPES, PROJECT_TYPE_LABELS } from "@/lib/plan-settings";

const valid: OpportunityDraft = {
  name: "Test house",
  client: "Test client",
  location: "Test street 1, Test city",
  project_type: "single_family_house",
  owner: "Ana Test",
  estimated_budget: "125000",
  deadline: "2026-12-31",
  source: "Referral",
  decision_date: "2026-11-15",
};
const draft = (extra: Partial<OpportunityDraft> = {}): OpportunityDraft => ({ ...valid, ...extra });
const REQUIRED = ["name", "client", "location", "project_type", "owner"] as const;

describe("fields and labels", () => {
  it("follows the order of the API contract", () => {
    expect([...OPPORTUNITY_FIELDS]).toEqual([
      "name", "client", "location", "project_type", "owner", "estimated_budget", "deadline", "source", "decision_date",
    ]);
  });

  it("has the Spanish labels of the contract", () => {
    expect(FIELD_LABELS).toEqual({
      name: "Nombre",
      client: "Cliente",
      location: "Localización",
      project_type: "Tipología",
      owner: "Responsable",
      estimated_budget: "Presupuesto estimado",
      deadline: "Plazo",
      source: "Fuente",
      decision_date: "Fecha de decisión",
    });
  });

  it("the empty draft has every field as an empty string", () => {
    expect(Object.keys(EMPTY_DRAFT)).toEqual([...OPPORTUNITY_FIELDS]);
    expect(Object.values(EMPTY_DRAFT).every((v) => v === "")).toBe(true);
  });

  it("typologies use the labels of plan-settings", () => {
    expect(PROJECT_TYPES).toHaveLength(6);
    expect(PROJECT_TYPE_LABELS.industrial).toBe("Industrial");
  });
});

describe("validateOpportunity · required fields", () => {
  it("a valid draft has no errors", () => {
    expect(validateOpportunity(valid)).toEqual({});
  });

  it("optional fields can be empty", () => {
    expect(validateOpportunity(draft({ estimated_budget: "", deadline: "", source: "", decision_date: "" }))).toEqual({});
  });

  it.each(REQUIRED)("%s empty -> «El campo «{label}» es obligatorio.»", (field) => {
    expect(validateOpportunity(draft({ [field]: "" }))[field]).toBe(`El campo «${FIELD_LABELS[field]}» es obligatorio.`);
  });

  it.each(REQUIRED)("%s with only spaces counts as empty", (field) => {
    expect(validateOpportunity(draft({ [field]: "   " }))[field]).toBe(`El campo «${FIELD_LABELS[field]}» es obligatorio.`);
  });

  it("the empty draft reports the five required fields, all at once", () => {
    expect(Object.keys(validateOpportunity(EMPTY_DRAFT))).toEqual([...REQUIRED]);
  });
});

describe("validateOpportunity · limits", () => {
  it.each([
    ["name", 120],
    ["client", 120],
    ["location", 200],
    ["owner", 120],
    ["source", 120],
  ] as const)("%s accepts %i characters and rejects one more", (field, max) => {
    expect(validateOpportunity(draft({ [field]: "a".repeat(max) }))[field]).toBeUndefined();
    expect(validateOpportunity(draft({ [field]: "a".repeat(max + 1) }))[field]).toBe(
      `El campo «${FIELD_LABELS[field]}» no es válido: debe tener como máximo ${max} caracteres.`,
    );
  });

  it("the length is measured after trimming", () => {
    expect(validateOpportunity(draft({ name: ` ${"a".repeat(120)} ` })).name).toBeUndefined();
  });

  it("project_type must be one of the six known typologies", () => {
    for (const type of PROJECT_TYPES) expect(validateOpportunity(draft({ project_type: type })).project_type).toBeUndefined();
    expect(validateOpportunity(draft({ project_type: "castle" })).project_type).toBe(
      "El campo «Tipología» no es válido: elige una de las tipologías disponibles.",
    );
  });

  it.each([
    ["0", undefined],
    ["1500.5", undefined],
    ["1500,5", undefined],
    ["1000000000", undefined],
    ["12.34", undefined],
    ["-1", "no puede ser negativo"],
    ["1000000000.01", "no puede superar 1.000.000.000 €"],
    ["1000000001", "no puede superar 1.000.000.000 €"],
    ["1.234", "admite como máximo 2 decimales"],
    ["abc", "debe ser un número"],
    ["12 000", "debe ser un número"],
    ["1e5", "debe ser un número"],
    ["NaN", "debe ser un número"],
    ["Infinity", "debe ser un número"],
  ])("estimated_budget %p", (text, reason) => {
    const message = validateOpportunity(draft({ estimated_budget: text })).estimated_budget;
    expect(message).toBe(reason === undefined ? undefined : `El campo «Presupuesto estimado» no es válido: ${reason}.`);
  });

  it("MAX_BUDGET is 1 000 000 000", () => {
    expect(MAX_BUDGET).toBe(1_000_000_000);
  });

  it.each(["deadline", "decision_date"] as const)("%s accepts real ISO dates and rejects the rest", (field) => {
    expect(validateOpportunity(draft({ [field]: "2028-02-29" }))[field]).toBeUndefined();
    const invalid = `El campo «${FIELD_LABELS[field]}» no es válido: debe ser una fecha con formato aaaa-mm-dd.`;
    for (const text of ["2027-02-29", "2026-13-01", "31/12/2026", "2026-1-1", "hoy", "2026-12-31T10:00"]) {
      expect(validateOpportunity(draft({ [field]: text }))[field]).toBe(invalid);
    }
  });
});

describe("toOpportunityPayload", () => {
  it("builds the API body: trimmed strings, number budget, ISO dates", () => {
    expect(toOpportunityPayload(draft({ name: "  Test house  ", estimated_budget: "125000" }))).toEqual({
      name: "Test house",
      client: "Test client",
      location: "Test street 1, Test city",
      project_type: "single_family_house",
      owner: "Ana Test",
      estimated_budget: 125000,
      deadline: "2026-12-31",
      source: "Referral",
      decision_date: "2026-11-15",
    });
  });

  it("empty optionals become null", () => {
    const payload = toOpportunityPayload(draft({ estimated_budget: " ", deadline: "", source: "  ", decision_date: "" }));
    expect(payload).toMatchObject({ estimated_budget: null, deadline: null, source: null, decision_date: null });
  });

  it("a decimal comma is read as a decimal point", () => {
    expect(toOpportunityPayload(draft({ estimated_budget: "1500,5" })).estimated_budget).toBe(1500.5);
  });
});

describe("createOpportunity", () => {
  const apiResponse = {
    code: "PRY-2026-001",
    name: "Test house",
    phase: 0,
    status: "no_plan",
    client: "Test client",
    location: "Test street 1, Test city",
    project_type: "single_family_house",
    owner: "Ana Test",
    estimated_budget: 125000.0,
    deadline: "2026-12-31",
    source: null,
    decision_date: null,
  };

  it("POSTs the payload to /api/opportunities", async () => {
    const request = jest.fn().mockResolvedValue(apiResponse);
    const payload = toOpportunityPayload(valid);
    await createOpportunity(payload, request);
    expect(request).toHaveBeenCalledWith("/api/opportunities", { method: "POST", body: payload });
  });

  it("maps the 201 response to camelCase", async () => {
    const created = await createOpportunity(toOpportunityPayload(valid), jest.fn().mockResolvedValue(apiResponse));
    expect(created).toEqual({
      code: "PRY-2026-001",
      name: "Test house",
      phase: 0,
      status: "no-plan",
      client: "Test client",
      location: "Test street 1, Test city",
      projectType: "single_family_house",
      owner: "Ana Test",
      estimatedBudget: 125000,
      deadline: "2026-12-31",
      source: null,
      decisionDate: null,
    });
  });

  it("propagates ApiError with its field", async () => {
    const failure = new ApiError(422, "required_field", "El campo «Nombre» es obligatorio.", "name");
    await expect(createOpportunity(toOpportunityPayload(valid), jest.fn().mockRejectedValue(failure))).rejects.toBe(failure);
    expect(failure.field).toBe("name");
  });
});

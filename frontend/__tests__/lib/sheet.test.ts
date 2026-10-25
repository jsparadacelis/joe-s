/**
 * RGB-17a contract of `@/lib/sheet` (to be created by the front developer):
 *   fetchProjectSheet(code, request?) -> ProjectSheet     GET /api/projects/{code}/sheet
 *   BLOCK_LABELS: Record<SheetBlockId, string>, FIELD_LABELS: Record<SheetFieldId, string>
 *   blockLabel(id), fieldLabel(id)   Spanish labels (unknown ids come back as given)
 *   types: ProjectSheet { code, phase, completion {filled, required, percent}, blocks: SheetBlockData[] }
 *          SheetBlockData { block, filled, required, complete, fields: SheetField[] }
 *   sheetValueText(field: SheetField) -> string | null     Spanish text of the value (labels of lib/plan-settings and lib/timing)
 *   planBreakdown(plan: PlanValue) -> {phase, name, weeks}[]  seven rows in phase order (names from lib/phases)
 *          PlanValue { weeks_by_phase: Record<"1".."7", number>, total: number }  (kept in wire shape)
 *          SheetField { field, required, value: string | PlanValue | null, source: "scoring" | "auto" | "manual" }
 * The keys of the wire shape have no snake_case multiword keys except block/field ids' values, so the
 * model keeps the same names; the 404s are `project_not_found` and `sheet_not_found` (ApiError, untouched).
 */
import { ApiError, createApiClient, type ResponseLike } from "@/lib/api";
import {
  BLOCK_LABELS,
  FIELD_LABELS,
  blockLabel,
  fetchProjectSheet,
  fieldLabel,
  planBreakdown,
  sheetValueText,
  type SheetField,
} from "@/lib/sheet";
import { API_PLAN_VALUE, API_SHEET } from "../helpers/sheet-fixtures";

function json(status: number, body?: unknown): ResponseLike {
  return { ok: status >= 200 && status < 300, status, text: async () => (body === undefined ? "" : JSON.stringify(body)) };
}
function clientWith(response: ResponseLike) {
  const fetch = jest.fn().mockResolvedValue(response);
  return { request: createApiClient({ baseUrl: "http://api", fetch }).request, fetch };
}
const notFound = (code: string, message: string) => json(404, { detail: { code, message } });

describe("fetchProjectSheet", () => {
  it("GETs /api/projects/{code}/sheet and returns the typed model", async () => {
    const { request, fetch } = clientWith(json(200, API_SHEET));
    const sheet = await fetchProjectSheet("PRY-2026-001", request);
    const [url, init] = fetch.mock.calls[0];
    expect(new URL(url).pathname).toBe("/api/projects/PRY-2026-001/sheet");
    expect(init.method).toBe("GET");
    expect(sheet.code).toBe("PRY-2026-001");
    expect(sheet.phase).toBe(1);
    expect(sheet.completion).toEqual({ filled: 7, required: 20, percent: 35 });
    expect(sheet.blocks).toHaveLength(8);
    expect(sheet.blocks.map((b) => b.block)).toEqual([
      "identification", "engagement", "governance", "client_contact", "timing", "risk", "information", "status",
    ]);
  });

  it("keeps filled, required, complete and every field with its required flag, value and source", async () => {
    const { request } = clientWith(json(200, API_SHEET));
    const { blocks } = await fetchProjectSheet("PRY-2026-001", request);
    expect(blocks[0]).toMatchObject({ block: "identification", filled: 6, required: 7, complete: false });
    expect(blocks[7]).toMatchObject({ block: "status", filled: 0, required: 0, complete: true });
    expect(blocks.reduce((n, b) => n + b.required, 0)).toBe(20);
    expect(blocks.reduce((n, b) => n + b.filled, 0)).toBe(7);
    expect(blocks[0].fields).toContainEqual({ field: "client", required: true, value: "Cliente de prueba", source: "scoring" });
    expect(blocks[0].fields).toContainEqual({ field: "cadastral_reference", required: true, value: null, source: "manual" });
    expect(blocks[2].fields).toContainEqual({ field: "team", required: false, value: null, source: "manual" });
  });

  it("keeps the confirmed plan as an object {weeks_by_phase (keys \"1\"..\"7\"), total} and null as null", async () => {
    const { request } = clientWith(json(200, API_SHEET));
    const sheet = await fetchProjectSheet("PRY-2026-001", request);
    const timing = sheet.blocks.find((b) => b.block === "timing")!;
    expect(timing.fields.find((f) => f.field === "confirmed_plan")!.value).toEqual(API_PLAN_VALUE);

    const withoutPlan = {
      ...API_SHEET,
      blocks: API_SHEET.blocks.map((b) =>
        b.block === "timing" ? { ...b, fields: b.fields.map((f) => (f.field === "confirmed_plan" ? { ...f, value: null } : f)) } : b,
      ),
    };
    const second = await fetchProjectSheet("PRY-2026-001", clientWith(json(200, withoutPlan)).request);
    expect(second.blocks.find((b) => b.block === "timing")!.fields.find((f) => f.field === "confirmed_plan")!.value).toBeNull();
  });

  it("encodes the code in the path", async () => {
    const { request, fetch } = clientWith(json(200, API_SHEET));
    await fetchProjectSheet("A/B C", request);
    expect(new URL(fetch.mock.calls[0][0]).pathname).toBe("/api/projects/A%2FB%20C/sheet");
  });

  it("404 project_not_found is an ApiError with that code", async () => {
    const { request } = clientWith(notFound("project_not_found", "No existe el proyecto X."));
    await expect(fetchProjectSheet("X", request)).rejects.toMatchObject({
      status: 404, code: "project_not_found", message: "No existe el proyecto X.",
    });
  });

  it("404 sheet_not_found is an ApiError with that code (not turned into null)", async () => {
    const { request } = clientWith(notFound("sheet_not_found", "El proyecto aún no tiene ficha."));
    const error = await fetchProjectSheet("PRY-2026-001", request).catch((e) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ status: 404, code: "sheet_not_found" });
  });

  it("a network failure is an ApiError with status 0", async () => {
    const fetch = jest.fn().mockRejectedValue(new TypeError("Failed to fetch"));
    const request = createApiClient({ baseUrl: "http://api", fetch }).request;
    await expect(fetchProjectSheet("PRY-2026-001", request)).rejects.toMatchObject({ status: 0, code: "network_error" });
  });

  it.each([
    ["an empty body", undefined],
    ["a body without blocks", { code: "PRY-2026-001", phase: 1, completion: { filled: 0, required: 0, percent: 0 } }],
    ["blocks that are not an array", { ...API_SHEET, blocks: {} }],
    ["a missing completion", { ...API_SHEET, completion: undefined }],
    ["a block without fields", { ...API_SHEET, blocks: [{ block: "risk", filled: 0, required: 2, complete: false }] }],
  ])("an invalid shape (%s) is an ApiError, never a TypeError", async (_name, body) => {
    const { request } = clientWith(json(200, body));
    const error = await fetchProjectSheet("PRY-2026-001", request).catch((e) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect(error.status).toBe(200);
    expect(typeof error.message).toBe("string");
    expect(error.message).not.toBe("");
  });
});

describe("Spanish labels", () => {
  it("names the eight blocks", () => {
    expect(BLOCK_LABELS).toEqual({
      identification: "Identificación",
      engagement: "Encargo",
      governance: "Gobierno",
      client_contact: "Cliente",
      timing: "Tiempo",
      risk: "Riesgo",
      information: "Información",
      status: "Estado",
    });
  });

  it("names every field of the contract", () => {
    expect(FIELD_LABELS).toEqual({
      code: "Código",
      name: "Nombre",
      client: "Cliente",
      location: "Ubicación",
      cadastral_reference: "Referencia catastral",
      project_type: "Tipología",
      scale: "Escala",
      scope_included: "Alcance incluido",
      scope_excluded: "Alcance excluido",
      contract_signed_on: "Fecha de firma del contrato",
      sponsor: "Promotor",
      project_director: "Dirección del proyecto",
      technical_lead: "Responsable técnico",
      team: "Equipo",
      external_collaborators: "Colaboradores externos",
      contact: "Contacto del cliente",
      confirmed_plan: "Plan confirmado",
      next_milestone: "Próximo hito",
      next_milestone_on: "Fecha del próximo hito",
      main_risk: "Riesgo principal",
      risk_owner: "Responsable del riesgo",
      repository_path: "Ruta del repositorio",
      traffic_light: "Semáforo",
    });
  });

  it("covers every block and field that appears in the contract fixture", () => {
    for (const block of API_SHEET.blocks) {
      expect(blockLabel(block.block as never)).toBe((BLOCK_LABELS as Record<string, string>)[block.block]);
      for (const f of block.fields) expect(fieldLabel(f.field as never)).toBe((FIELD_LABELS as Record<string, string>)[f.field]);
    }
  });

  it("blockLabel and fieldLabel return the id itself for an unknown one", () => {
    expect(blockLabel("unknown_block" as never)).toBe("unknown_block");
    expect(fieldLabel("unknown_field" as never)).toBe("unknown_field");
  });
});

const field = (name: string, value: SheetField["value"]): SheetField => ({ field: name, required: true, value, source: "manual" }) as SheetField;

describe("sheetValueText (value of a field, ready to show, in Spanish)", () => {
  it("returns null for a null value", () => {
    expect(sheetValueText(field("name", null))).toBeNull();
    expect(sheetValueText(field("confirmed_plan", null))).toBeNull();
  });

  it("returns plain strings as they are", () => {
    expect(sheetValueText(field("name", "Casa de prueba"))).toBe("Casa de prueba");
  });

  it.each([
    ["single_family_house", "Vivienda unifamiliar"],
    ["rehabilitation", "Rehabilitación"],
    ["multi_family", "Plurifamiliar"],
    ["facility", "Dotacional"],
    ["industrial", "Industrial"],
    ["renovation_interiors", "Reforma de interiores"],
  ])("project_type %s -> %s", (raw, text) => {
    expect(sheetValueText(field("project_type", raw))).toBe(text);
  });

  it.each([["small", "Pequeña"], ["medium", "Media"], ["large", "Grande"]])("scale %s -> %s", (raw, text) => {
    expect(sheetValueText(field("scale", raw))).toBe(text);
  });

  it.each([["green", "En plazo"], ["amber", "Atención"], ["red", "Plan superado"]])("traffic_light %s -> %s", (raw, text) => {
    expect(sheetValueText(field("traffic_light", raw))).toBe(text);
  });

  it("an unknown enumerated value comes back as it is (never throws)", () => {
    expect(sheetValueText(field("scale", "huge"))).toBe("huge");
  });

  it("the confirmed plan is «<total> semanas» (singular for 1)", () => {
    expect(sheetValueText(field("confirmed_plan", API_PLAN_VALUE))).toBe("65 semanas");
    expect(sheetValueText(field("confirmed_plan", { weeks_by_phase: { "1": 1, "2": 0, "3": 0, "4": 0, "5": 0, "6": 0, "7": 0 }, total: 1 }))).toBe("1 semana");
  });
});

describe("planBreakdown", () => {
  it("lists the seven phases in order with the Spanish phase name and weeks", () => {
    expect(planBreakdown(API_PLAN_VALUE)).toEqual([
      { phase: 1, name: "Inicio", weeks: 5 },
      { phase: 2, name: "Briefing y concepto", weeks: 8 },
      { phase: 3, name: "Anteproyecto", weeks: 10 },
      { phase: 4, name: "Proyecto básico", weeks: 12 },
      { phase: 5, name: "Proyecto de ejecución", weeks: 15 },
      { phase: 6, name: "Obra", weeks: 10 },
      { phase: 7, name: "Cierre", weeks: 5 },
    ]);
  });

  it("orders by phase number whatever the key order", () => {
    const shuffled = { weeks_by_phase: { "7": 1, "3": 1, "1": 1, "5": 1, "2": 1, "6": 1, "4": 1 }, total: 7 };
    expect(planBreakdown(shuffled).map((r) => r.phase)).toEqual([1, 2, 3, 4, 5, 6, 7]);
  });
});

/**
 * RGB-17b contract of `@/lib/sheet` (additions):
 *   saveProjectSheet(code, body: SheetUpdate, request?) -> Promise<ProjectSheet>   PUT /api/projects/{code}/sheet
 *   SheetUpdate { fields?: Partial<Record<SheetFieldId, string>>; plan?: { project_type, scale, weeks: number[] } }
 *   fieldInputKind(id: SheetFieldId): "text" | "textarea" | "date" | null    null = not editable as a plain field
 *   Errors come from the API as ApiError (Spanish message); a body that is not a sheet is ApiError(200, ...).
 */
import { ApiError, createApiClient, type ResponseLike } from "@/lib/api";
import { fieldInputKind, saveProjectSheet, type SheetFieldId } from "@/lib/sheet";
import { API_SHEET } from "../helpers/sheet-fixtures";

function json(status: number, body?: unknown): ResponseLike {
  return { ok: status >= 200 && status < 300, status, text: async () => (body === undefined ? "" : JSON.stringify(body)) };
}
function clientWith(response: ResponseLike) {
  const fetch = jest.fn().mockResolvedValue(response);
  return { request: createApiClient({ baseUrl: "http://api", fetch }).request, fetch };
}
const failure = (status: number, code: string, message: string, field?: string) =>
  json(status, { detail: { code, message, ...(field ? { field } : {}) } });

describe("saveProjectSheet", () => {
  it("PUTs /api/projects/{code}/sheet with the JSON body and returns the sheet", async () => {
    const { request, fetch } = clientWith(json(200, API_SHEET));
    const body = {
      fields: { sponsor: "Promotora de prueba", contract_signed_on: "2026-11-03", team: "" },
      plan: { project_type: "rehabilitation", scale: "large", weeks: [3, 4, 6, 8, 9, 40, 5] },
    } as const;
    const sheet = await saveProjectSheet("PRY-2026-001", body as never, request);
    const [url, init] = fetch.mock.calls[0];
    expect(new URL(url).pathname).toBe("/api/projects/PRY-2026-001/sheet");
    expect(init.method).toBe("PUT");
    expect(JSON.parse(init.body)).toEqual(body);
    expect(init.headers).toMatchObject({ "Content-Type": "application/json" });
    expect(sheet.code).toBe("PRY-2026-001");
    expect(sheet.blocks).toHaveLength(8);
    expect(sheet.completion).toEqual({ filled: 7, required: 20, percent: 35 });
  });

  it("accepts only fields, or only plan", async () => {
    const { request, fetch } = clientWith(json(200, API_SHEET));
    await saveProjectSheet("PRY-2026-001", { fields: { main_risk: "Riesgo de prueba" } }, request);
    expect(JSON.parse(fetch.mock.calls[0][1].body)).toEqual({ fields: { main_risk: "Riesgo de prueba" } });
  });

  it("encodes the code in the path", async () => {
    const { request, fetch } = clientWith(json(200, API_SHEET));
    await saveProjectSheet("A/B C", { fields: { team: "x" } }, request);
    expect(new URL(fetch.mock.calls[0][0]).pathname).toBe("/api/projects/A%2FB%20C/sheet");
  });

  it.each([
    [403, "no_authority", "Solo un socio o un director puede editar la ficha."],
    [404, "project_not_found", "No existe el proyecto X."],
    [409, "sheet_not_editable", "La ficha solo se edita mientras el proyecto está en Inicio."],
    [422, "invalid_weeks", "Cada plan necesita exactamente 7 valores de semanas, enteros y entre 1 y 520."],
    [422, "unknown_field", "El campo «zzz» no se puede editar."],
  ])("%s %s is an ApiError carrying the Spanish message", async (status, code, message) => {
    const { request } = clientWith(failure(status, code, message));
    const error = await saveProjectSheet("PRY-2026-001", { fields: { team: "x" } }, request).catch((e) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ status, code, message });
  });

  it("422 invalid_field keeps the offending field", async () => {
    const { request } = clientWith(failure(422, "invalid_field", "La fecha no es válida.", "contract_signed_on"));
    await expect(saveProjectSheet("PRY-2026-001", { fields: { contract_signed_on: "ayer" } }, request)).rejects.toMatchObject({
      status: 422, code: "invalid_field", field: "contract_signed_on", message: "La fecha no es válida.",
    });
  });

  it("a network failure is an ApiError with status 0", async () => {
    const fetch = jest.fn().mockRejectedValue(new TypeError("Failed to fetch"));
    const request = createApiClient({ baseUrl: "http://api", fetch }).request;
    await expect(saveProjectSheet("PRY-2026-001", { fields: { team: "x" } }, request)).rejects.toMatchObject({ status: 0, code: "network_error" });
  });

  it.each([
    ["an empty body", undefined],
    ["a body without blocks", { code: "PRY-2026-001", phase: 1, completion: { filled: 0, required: 0, percent: 0 } }],
    ["a missing completion", { ...API_SHEET, completion: undefined }],
  ])("an invalid response shape (%s) is an ApiError, never a TypeError", async (_name, body) => {
    const { request } = clientWith(json(200, body));
    const error = await saveProjectSheet("PRY-2026-001", { fields: { team: "x" } }, request).catch((e) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect(error.message).not.toBe("");
  });
});

describe("fieldInputKind", () => {
  it.each(["scope_included", "scope_excluded", "main_risk"])("%s is a long text (textarea)", (id) => {
    expect(fieldInputKind(id as SheetFieldId)).toBe("textarea");
  });
  it.each(["contract_signed_on", "next_milestone_on"])("%s is a date", (id) => {
    expect(fieldInputKind(id as SheetFieldId)).toBe("date");
  });
  it.each([
    "cadastral_reference", "sponsor", "project_director", "technical_lead", "team", "external_collaborators",
    "contact", "next_milestone", "risk_owner", "repository_path",
  ])("%s is a short text", (id) => {
    expect(fieldInputKind(id as SheetFieldId)).toBe("text");
  });
  it.each(["code", "name", "client", "location", "project_type", "scale", "confirmed_plan", "traffic_light"])(
    "%s is not editable as a plain field (null)",
    (id) => {
      expect(fieldInputKind(id as SheetFieldId)).toBeNull();
    },
  );
});

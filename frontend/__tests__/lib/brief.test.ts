/**
 * RGB-32b contract of `@/lib/brief` (client of RGB-32a, `/api/projects/{code}/brief`):
 *   getBrief(code, request?)            -> Promise<Brief>              GET  .../brief
 *   saveBrief(code, update, request?)   -> Promise<Brief>              PUT  .../brief   body { fields: {...} }
 *   promoteBrief(code, request?)        -> Promise<PromoteBriefResult> POST .../brief/promote  (no body)
 *   `code` goes through encodeURIComponent; ApiError (403/404/409/422) propagates untouched; a body that is not a
 *   brief (no object, or `fields`, `completeness`, `permissions` or `technical_data` missing/not objects, or
 *   `permissions.can_edit` not a boolean) is ApiError(200, "invalid_brief_response", "La respuesta del brief no es válida. Inténtalo de nuevo.").
 *   BRIEF_FIELD_IDS: the 8 ids in server order. BRIEF_FIELD_LABELS / briefFieldLabel(id): Spanish labels.
 *   CLIENT_APPROVALS: ["pending","email","meeting","signed"]; CLIENT_APPROVAL_LABELS / clientApprovalLabel(value).
 *   REQUIRED_BRIEF_FIELDS: the five required ids. sourceLabel(source): Spanish name of a datum source.
 */
import { ApiError, createApiClient, type ResponseLike } from "@/lib/api";
import {
  BRIEF_FIELD_IDS,
  BRIEF_FIELD_LABELS,
  CLIENT_APPROVALS,
  CLIENT_APPROVAL_LABELS,
  REQUIRED_BRIEF_FIELDS,
  briefFieldLabel,
  clientApprovalLabel,
  getBrief,
  promoteBrief,
  saveBrief,
  sourceLabel,
} from "@/lib/brief";
import { API_BRIEF_COMPLETE, API_BRIEF_FROZEN, API_PROMOTE_RESULT } from "../helpers/brief-fixtures";

function json(status: number, body?: unknown): ResponseLike {
  return { ok: status >= 200 && status < 300, status, text: async () => (body === undefined ? "" : JSON.stringify(body)) };
}
function clientWith(response: ResponseLike) {
  const fetch = jest.fn().mockResolvedValue(response);
  return { request: createApiClient({ baseUrl: "http://api", fetch }).request, fetch };
}
const failure = (status: number, code: string, message: string, extra: Record<string, unknown> = {}) =>
  json(status, { detail: { code, message, ...extra } });
const INVALID = "La respuesta del brief no es válida. Inténtalo de nuevo.";

describe("getBrief", () => {
  it("GETs /api/projects/{code}/brief and returns the brief as the API sent it", async () => {
    const { request, fetch } = clientWith(json(200, API_BRIEF_COMPLETE));
    const result = await getBrief("PRY-2026-001", request);
    const [url, init] = fetch.mock.calls[0];
    expect(new URL(url).pathname).toBe("/api/projects/PRY-2026-001/brief");
    expect(init.method).toBe("GET");
    expect(init.body).toBeUndefined();
    expect(result).toEqual(API_BRIEF_COMPLETE);
  });

  it("returns the frozen version too", async () => {
    const { request } = clientWith(json(200, API_BRIEF_FROZEN));
    const result = await getBrief("PRY-2026-001", request);
    expect(result.frozen_version).toBe(1);
    expect(result.permissions).toEqual({ can_edit: false, can_promote: false });
  });

  it("encodes the code in the path", async () => {
    const { request, fetch } = clientWith(json(200, API_BRIEF_COMPLETE));
    await getBrief("A/B C", request);
    expect(new URL(fetch.mock.calls[0][0]).pathname).toBe("/api/projects/A%2FB%20C/brief");
  });

  it.each([
    [404, "project_not_found", "No existe el proyecto PRY-2026-999."],
    [404, "brief_not_found", "El proyecto aún no tiene brief: se redacta en la fase 2 (Briefing)."],
  ])("%s %s is an ApiError carrying the Spanish message", async (status, code, message) => {
    const { request } = clientWith(failure(status, code, message));
    const error = await getBrief("PRY-2026-001", request).catch((e) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ status, code, message });
  });

  it("a network failure is an ApiError with status 0", async () => {
    const request = createApiClient({ baseUrl: "http://api", fetch: jest.fn().mockRejectedValue(new Error("down")) }).request;
    const error = await getBrief("PRY-2026-001", request).catch((e) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect(error.status).toBe(0);
  });

  const { fields, completeness, permissions, technical_data, ...rest } = API_BRIEF_COMPLETE;
  void [fields, completeness, permissions, technical_data];
  it.each([
    ["not an object", "texto"],
    ["an array", []],
    ["null", null],
    ["no fields", { ...rest, completeness, permissions, technical_data }],
    ["fields not an object", { ...API_BRIEF_COMPLETE, fields: "x" }],
    ["no completeness", { ...rest, fields, permissions, technical_data }],
    ["no permissions", { ...rest, fields, completeness, technical_data }],
    ["can_edit not boolean", { ...API_BRIEF_COMPLETE, permissions: { can_edit: "yes", can_promote: false } }],
    ["no technical data", { ...rest, fields, completeness, permissions }],
    ["technical data without list", { ...API_BRIEF_COMPLETE, technical_data: { ...technical_data, data: "x" } }],
    ["missing not a list", { ...API_BRIEF_COMPLETE, completeness: { ...completeness, missing: "x" } }],
    ["frozen_version a string", { ...API_BRIEF_COMPLETE, frozen_version: "1" }],
  ])("a response with %s is invalid_brief_response", async (_name, body) => {
    const { request } = clientWith(json(200, body));
    const error = await getBrief("PRY-2026-001", request).catch((e) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ status: 200, code: "invalid_brief_response", message: INVALID });
  });

  it("an empty 200 body is invalid_brief_response", async () => {
    const { request } = clientWith(json(200));
    const error = await getBrief("PRY-2026-001", request).catch((e) => e);
    expect(error).toMatchObject({ code: "invalid_brief_response" });
  });
});

describe("saveBrief", () => {
  it("PUTs {fields} as JSON to /api/projects/{code}/brief and returns the brief", async () => {
    const { request, fetch } = clientWith(json(200, API_BRIEF_COMPLETE));
    const update = { fields: { needs: "Reforma integral", target_budget: 250000.5, alignment: null, client_approval: "signed" as const } };
    const result = await saveBrief("PRY-2026-001", update, request);
    const [url, init] = fetch.mock.calls[0];
    expect(new URL(url).pathname).toBe("/api/projects/PRY-2026-001/brief");
    expect(init.method).toBe("PUT");
    expect(JSON.parse(init.body)).toEqual(update);
    expect(init.headers).toMatchObject({ "Content-Type": "application/json" });
    expect(result).toEqual(API_BRIEF_COMPLETE);
  });

  it("encodes the code in the path", async () => {
    const { request, fetch } = clientWith(json(200, API_BRIEF_COMPLETE));
    await saveBrief("A/B C", { fields: { needs: "x" } }, request);
    expect(new URL(fetch.mock.calls[0][0]).pathname).toBe("/api/projects/A%2FB%20C/brief");
  });

  it.each([
    [403, "no_authority", "Solo el director de proyecto puede editar el brief.", { allowed: ["Director de proyecto"] }],
    [404, "project_not_found", "No existe el proyecto X.", {}],
    [409, "brief_not_editable", "El brief solo se puede editar o promover mientras el proyecto está en la fase 2.", {}],
    [422, "invalid_request", "La petición no es válida.", {}],
    [422, "unknown_field", "El campo «x» no existe o no se puede editar aquí.", { field: "x" }],
  ])("%s %s is an ApiError carrying the Spanish message", async (status, code, message, extra) => {
    const { request } = clientWith(failure(status, code, message, extra));
    const error = await saveBrief("PRY-2026-001", { fields: { needs: "x" } }, request).catch((e) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ status, code, message });
  });

  it("422 invalid_field carries the offending field", async () => {
    const message = "El campo «Plazo» no es válido: debe ser una fecha con el formato AAAA-MM-DD.";
    const { request } = clientWith(failure(422, "invalid_field", message, { field: "deadline" }));
    const error = await saveBrief("PRY-2026-001", { fields: { deadline: "30/06/2027" } }, request).catch((e) => e);
    expect(error).toMatchObject({ status: 422, code: "invalid_field", field: "deadline", message });
  });

  it("a response that is not a brief is invalid_brief_response", async () => {
    const { request } = clientWith(json(200, { ok: true }));
    const error = await saveBrief("PRY-2026-001", { fields: { needs: "x" } }, request).catch((e) => e);
    expect(error).toMatchObject({ status: 200, code: "invalid_brief_response", message: INVALID });
  });
});

describe("promoteBrief", () => {
  it("POSTs /api/projects/{code}/brief/promote with no body and returns the transition and the frozen brief", async () => {
    const { request, fetch } = clientWith(json(200, API_PROMOTE_RESULT));
    const result = await promoteBrief("PRY-2026-001", request);
    const [url, init] = fetch.mock.calls[0];
    expect(new URL(url).pathname).toBe("/api/projects/PRY-2026-001/brief/promote");
    expect(init.method).toBe("POST");
    expect(init.body).toBeUndefined();
    expect(result).toMatchObject({ code: "PRY-2026-001", action: "promote", previous_phase: 2, current_phase: 3, frozen_version: 1 });
    expect(result.brief).toEqual(API_BRIEF_FROZEN);
  });

  it("encodes the code in the path", async () => {
    const { request, fetch } = clientWith(json(200, API_PROMOTE_RESULT));
    await promoteBrief("A/B C", request);
    expect(new URL(fetch.mock.calls[0][0]).pathname).toBe("/api/projects/A%2FB%20C/brief/promote");
  });

  it.each([
    [403, "no_authority", "Solo el director de proyecto puede promover.", {}],
    [404, "project_not_found", "No existe el proyecto X.", {}],
    [409, "brief_not_editable", "El brief solo se puede editar o promover mientras el proyecto está en la fase 2.", {}],
  ])("%s %s is an ApiError carrying the Spanish message", async (status, code, message, extra) => {
    const { request } = clientWith(failure(status, code, message, extra));
    const error = await promoteBrief("PRY-2026-001", request).catch((e) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ status, code, message });
  });

  it("422 incomplete_deliverable keeps the missing labels", async () => {
    const missing = ["Programa", "Datos técnicos obtenidos", "Aprobación del cliente registrada"];
    const { request } = clientWith(failure(422, "incomplete_deliverable", "El brief no está listo para promover: faltan 3 requisitos.", { missing }));
    const error = await promoteBrief("PRY-2026-001", request).catch((e) => e);
    expect(error).toMatchObject({ status: 422, code: "incomplete_deliverable", missing });
  });

  it.each([
    ["not an object", "texto"],
    ["no brief", { code: "PRY-2026-001", action: "promote", previous_phase: 2, current_phase: 3, frozen_version: 1 }],
    ["a brief that is not valid", { ...API_PROMOTE_RESULT, brief: { code: "x" } }],
    ["current_phase not a number", { ...API_PROMOTE_RESULT, current_phase: "3" }],
  ])("a response with %s is invalid_brief_response", async (_name, body) => {
    const { request } = clientWith(json(200, body));
    const error = await promoteBrief("PRY-2026-001", request).catch((e) => e);
    expect(error).toMatchObject({ status: 200, code: "invalid_brief_response", message: INVALID });
  });
});

describe("labels", () => {
  it("the 8 fields in the server order", () => {
    expect(BRIEF_FIELD_IDS).toEqual([
      "needs",
      "program",
      "constraints",
      "target_budget",
      "deadline",
      "topographic_survey",
      "alignment",
      "client_approval",
    ]);
  });

  it("Spanish labels of the fields", () => {
    expect(BRIEF_FIELD_LABELS).toEqual({
      needs: "Necesidades",
      program: "Programa",
      constraints: "Condicionantes",
      target_budget: "Presupuesto objetivo",
      deadline: "Plazo",
      topographic_survey: "Levantamiento topográfico",
      alignment: "Alineación",
      client_approval: "Aprobación del cliente",
    });
    expect(briefFieldLabel("deadline")).toBe("Plazo");
  });

  it("the five required fields are the first five", () => {
    expect(REQUIRED_BRIEF_FIELDS).toEqual(["needs", "program", "constraints", "target_budget", "deadline"]);
  });

  it("client approval values and labels", () => {
    expect(CLIENT_APPROVALS).toEqual(["pending", "email", "meeting", "signed"]);
    expect(CLIENT_APPROVAL_LABELS).toEqual({ pending: "Pendiente", email: "Por correo", meeting: "En reunión", signed: "Con firma" });
    expect(clientApprovalLabel("signed")).toBe("Con firma");
  });

  it.each([
    ["catastro", "Catastro"],
    ["inspire", "INSPIRE"],
    ["open_meteo", "Open-Meteo"],
    ["calculated", "Calculado"],
    ["cte", "CTE"],
    ["ncse", "NCSE-02"],
    ["pvgis", "PVGIS"],
    ["manual", "Manual"],
    ["unknown_source", "unknown_source"],
  ])("source %s reads %s", (source, label) => {
    expect(sourceLabel(source)).toBe(label);
  });
});

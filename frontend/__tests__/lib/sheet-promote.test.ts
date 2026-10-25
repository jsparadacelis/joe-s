/**
 * RGB-19 contract of `@/lib/sheet` (additions):
 *   ProjectSheet gains `frozen_version: number | null` and `permissions: { can_edit: boolean; can_promote: boolean }`
 *     (both required by the shape validation: a sheet without them is ApiError(200, ...), never a TypeError).
 *   promoteProjectSheet(code, request?) -> Promise<PromoteResult>   POST /api/projects/{code}/sheet/promote, no body
 *   PromoteResult { code: string; action: "promote"; previous_phase: number; current_phase: number;
 *                   frozen_version: number; sheet: ProjectSheet }   (wire shape kept; `sheet` validated like GET /sheet)
 *   `ApiError` (`@/lib/api`) gains `missing?: string[]`, read from `detail.missing` when it is an array of strings
 *   (422 incomplete_deliverable lists the Spanish labels of the empty required fields).
 */
import { ApiError, createApiClient, type ResponseLike } from "@/lib/api";
import { fetchProjectSheet, promoteProjectSheet, saveProjectSheet } from "@/lib/sheet";
import { API_SHEET, API_SHEET_COMPLETE, API_SHEET_FROZEN } from "../helpers/sheet-fixtures";

function json(status: number, body?: unknown): ResponseLike {
  return { ok: status >= 200 && status < 300, status, text: async () => (body === undefined ? "" : JSON.stringify(body)) };
}
function clientWith(response: ResponseLike) {
  const fetch = jest.fn().mockResolvedValue(response);
  return { request: createApiClient({ baseUrl: "http://api", fetch }).request, fetch };
}
const failure = (status: number, detail: Record<string, unknown>) => json(status, { detail });

const RESULT = { code: "PRY-2026-001", action: "promote", previous_phase: 1, current_phase: 2, frozen_version: 1, sheet: API_SHEET_FROZEN };

describe("sheet shape with permissions and frozen_version (RGB-19)", () => {
  it("fetchProjectSheet keeps permissions and frozen_version", async () => {
    const { request } = clientWith(json(200, API_SHEET_COMPLETE));
    const sheet = await fetchProjectSheet("PRY-2026-001", request);
    expect(sheet.permissions).toEqual({ can_edit: true, can_promote: true });
    expect(sheet.frozen_version).toBeNull();
    const frozen = await fetchProjectSheet("PRY-2026-001", clientWith(json(200, API_SHEET_FROZEN)).request);
    expect(frozen.frozen_version).toBe(1);
  });

  it.each([
    ["no permissions", { ...API_SHEET, permissions: undefined }],
    ["permissions without can_promote", { ...API_SHEET, permissions: { can_edit: true } }],
    ["permissions without can_edit", { ...API_SHEET, permissions: { can_promote: false } }],
    ["non boolean permissions", { ...API_SHEET, permissions: { can_edit: "yes", can_promote: false } }],
    ["no frozen_version", { ...API_SHEET, frozen_version: undefined }],
    ["a text frozen_version", { ...API_SHEET, frozen_version: "1" }],
  ])("%s is an ApiError for GET and for PUT", async (_name, body) => {
    const get = await fetchProjectSheet("PRY-2026-001", clientWith(json(200, body)).request).catch((e) => e);
    expect(get).toBeInstanceOf(ApiError);
    expect(get.status).toBe(200);
    const put = await saveProjectSheet("PRY-2026-001", { fields: { team: "x" } }, clientWith(json(200, body)).request).catch((e) => e);
    expect(put).toBeInstanceOf(ApiError);
  });
});

describe("promoteProjectSheet", () => {
  it("POSTs /api/projects/{code}/sheet/promote with no body and returns the wire result", async () => {
    const { request, fetch } = clientWith(json(200, RESULT));
    const result = await promoteProjectSheet("PRY-2026-001", request);
    const [url, init] = fetch.mock.calls[0];
    expect(new URL(url).pathname).toBe("/api/projects/PRY-2026-001/sheet/promote");
    expect(init.method).toBe("POST");
    expect(init.body).toBeUndefined();
    expect(result).toMatchObject({ code: "PRY-2026-001", action: "promote", previous_phase: 1, current_phase: 2, frozen_version: 1 });
    expect(result.sheet.frozen_version).toBe(1);
    expect(result.sheet.permissions).toEqual({ can_edit: false, can_promote: false });
  });

  it("encodes the code in the path", async () => {
    const { request, fetch } = clientWith(json(200, RESULT));
    await promoteProjectSheet("A/B C", request);
    expect(new URL(fetch.mock.calls[0][0]).pathname).toBe("/api/projects/A%2FB%20C/sheet/promote");
  });

  it.each([
    [403, "no_authority", "Solo un socio o un director puede promover la ficha."],
    [404, "project_not_found", "No existe el proyecto X."],
    [409, "sheet_not_editable", "La ficha solo se promueve mientras el proyecto está en Inicio."],
  ])("%s %s is an ApiError carrying the Spanish message", async (status, code, message) => {
    const { request } = clientWith(failure(status, { code, message }));
    const error = await promoteProjectSheet("PRY-2026-001", request).catch((e) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ status, code, message });
  });

  it("422 incomplete_deliverable keeps the missing labels in `missing`", async () => {
    const missing = ["Referencia catastral", "Alcance incluido"];
    const { request } = clientWith(failure(422, { code: "incomplete_deliverable", message: "Faltan 2 campos obligatorios.", missing }));
    const error = await promoteProjectSheet("PRY-2026-001", request).catch((e) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ status: 422, code: "incomplete_deliverable", message: "Faltan 2 campos obligatorios.", missing });
  });

  it("an error without `missing` leaves it undefined; a non-list `missing` is ignored", async () => {
    const plain = await promoteProjectSheet("X", clientWith(failure(403, { code: "no_authority", message: "No." })).request).catch((e) => e);
    expect(plain.missing).toBeUndefined();
    const odd = await promoteProjectSheet("X", clientWith(failure(422, { code: "incomplete_deliverable", message: "No.", missing: "todo" })).request).catch((e) => e);
    expect(odd.missing).toBeUndefined();
  });

  it("a success whose sheet is not a sheet is an ApiError, never a TypeError", async () => {
    const { request } = clientWith(json(200, { ...RESULT, sheet: { code: "PRY-2026-001" } }));
    const error = await promoteProjectSheet("PRY-2026-001", request).catch((e) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect(error.status).toBe(200);
  });

  it("an empty success body is an ApiError", async () => {
    const error = await promoteProjectSheet("PRY-2026-001", clientWith(json(200)).request).catch((e) => e);
    expect(error).toBeInstanceOf(ApiError);
  });
});

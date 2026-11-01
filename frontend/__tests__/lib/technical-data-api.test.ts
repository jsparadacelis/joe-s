/**
 * RGB-51 · contract for `@/lib/technical-data-api` (new module; `lib/technical-data.ts` keeps DEFINITIONS, types,
 * pure functions and the sample data). Every request function takes the api `request` as LAST argument, defaulting to
 * `@/lib/api`'s, like lib/project-team.ts:
 *   interface TechnicalDataApi {
 *     load(code): Promise<TechnicalData>
 *     edit(code, fieldId, value: string): Promise<TechnicalDatum>
 *     restore(code, fieldId): Promise<TechnicalDatum>
 *     verify(code, fieldId): Promise<TechnicalDatum>
 *     verifyAll(code): Promise<TechnicalData>
 *     refresh(code, cadastralReference): Promise<RefreshResult>      // RefreshResult = TechnicalData & { unmapped: string[] }
 *   }
 *   fetchProjectTechnicalData(code, request?)            GET  /api/projects/{code}/technical-data
 *   editDatum(code, fieldId, value, request?)            PUT  .../technical-data/{fieldId}          body {value}
 *   restoreDatum(code, fieldId, request?)                POST .../{fieldId}/restore                 (no body)
 *   verifyDatum(code, fieldId, request?)                 POST .../{fieldId}/verify                  (no body)
 *   verifyAll(code, request?)                            POST .../verify-all                        (no body)
 *   refreshFromCadastre(code, cadastralReference, request?)  POST .../refresh                       body {cadastral_reference}
 *   createTechnicalDataApi(request?): TechnicalDataApi   wraps the functions above
 *   createSampleTechnicalDataApi(): TechnicalDataApi     in-memory, for the PRY-EJ-* samples (state per instance and code)
 *   technicalDataApiFor(code): TechnicalDataApi          sample api when isSampleProject(code), else the real one
 * Mapping: cadastral_reference (null -> ""), queried_on -> queriedOn, data[] -> { id, value, original, verified, edited, source }.
 */
import { ApiError } from "@/lib/api";
import { DEFINITIONS } from "@/lib/technical-data";
import {
  createSampleTechnicalDataApi,
  createTechnicalDataApi,
  editDatum,
  fetchProjectTechnicalData,
  refreshFromCadastre,
  restoreDatum,
  technicalDataApiFor,
  verifyAll,
  verifyDatum,
} from "@/lib/technical-data-api";
import { apiSheetJson } from "../helpers/technical-data-fake-api";

const REF = "1234567DG3413S0001AB";
const BASE = "/api/projects/PRY-2026-001/technical-data";
const ID = DEFINITIONS.length;

const API_DATUM = { id: "address", value: "CL TEST 1", original: "CL TEST 0", verified: true, edited: true, source: "catastro" };
const MAPPED_DATUM = { id: "address", value: "CL TEST 1", original: "CL TEST 0", verified: true, edited: true, source: "catastro" };

describe("fetchProjectTechnicalData", () => {
  it("GETs the sheet and maps snake_case to the front model", async () => {
    const request = jest.fn().mockResolvedValue(apiSheetJson({ address: { value: "CL TEST 1", original: "CL TEST 0", edited: true, verified: true } }));
    const result = await fetchProjectTechnicalData("PRY-2026-001", request);
    expect(request).toHaveBeenCalledWith(BASE, expect.objectContaining({ method: "GET" }));
    expect(result.cadastralReference).toBe(REF);
    expect(result.queriedOn).toBe("2026-10-18");
    expect(result.data).toHaveLength(ID);
    expect(result.data.find((d) => d.id === "address")).toEqual(MAPPED_DATUM);
    expect(result.data.find((d) => d.id === "buildability")).toEqual({ id: "buildability", value: "", original: null, verified: false, edited: false, source: "manual" });
  });

  it("a sheet that was never queried: null reference becomes \"\" and null date stays null", async () => {
    const request = jest.fn().mockResolvedValue(apiSheetJson({}, { cadastral_reference: null, queried_on: null }));
    const result = await fetchProjectTechnicalData("PRY-2026-001", request);
    expect(result.cadastralReference).toBe("");
    expect(result.queriedOn).toBeNull();
  });

  it("encodes the project code in the path", async () => {
    const request = jest.fn().mockResolvedValue(apiSheetJson());
    await fetchProjectTechnicalData("PRY 1/../x?", request);
    expect(request.mock.calls[0][0]).toBe(`/api/projects/${encodeURIComponent("PRY 1/../x?")}/technical-data`);
  });

  it("propagates the ApiError untouched", async () => {
    const error = new ApiError(404, "project_not_found", "No existe el proyecto.");
    await expect(fetchProjectTechnicalData("X", jest.fn().mockRejectedValue(error))).rejects.toBe(error);
  });

  it.each([
    ["not an object", "oops"],
    ["data is not a list", { cadastral_reference: null, queried_on: null, data: "x" }],
    ["a datum without id", { cadastral_reference: null, queried_on: null, data: [{ value: "a" }] }],
  ])("a malformed response (%s) is rejected as invalid_technical_data_response", async (_n, body) => {
    await expect(fetchProjectTechnicalData("X", jest.fn().mockResolvedValue(body))).rejects.toMatchObject({
      name: "ApiError",
      code: "invalid_technical_data_response",
    });
  });
});

describe("datum operations", () => {
  it("editDatum PUTs {value} and returns the mapped datum", async () => {
    const request = jest.fn().mockResolvedValue(API_DATUM);
    await expect(editDatum("PRY-2026-001", "address", "CL TEST 1", request)).resolves.toEqual(MAPPED_DATUM);
    expect(request).toHaveBeenCalledWith(`${BASE}/address`, { method: "PUT", body: { value: "CL TEST 1" } });
  });

  it("editDatum sends an empty value as \"\" (not null)", async () => {
    const request = jest.fn().mockResolvedValue(API_DATUM);
    await editDatum("PRY-2026-001", "zone", "", request);
    expect(request.mock.calls[0][1]).toEqual({ method: "PUT", body: { value: "" } });
  });

  it("restoreDatum POSTs to /restore without body", async () => {
    const request = jest.fn().mockResolvedValue(API_DATUM);
    await expect(restoreDatum("PRY-2026-001", "address", request)).resolves.toEqual(MAPPED_DATUM);
    expect(request).toHaveBeenCalledWith(`${BASE}/address/restore`, { method: "POST" });
  });

  it("verifyDatum POSTs to /verify without body", async () => {
    const request = jest.fn().mockResolvedValue(API_DATUM);
    await expect(verifyDatum("PRY-2026-001", "address", request)).resolves.toEqual(MAPPED_DATUM);
    expect(request).toHaveBeenCalledWith(`${BASE}/address/verify`, { method: "POST" });
  });

  it("encodes the code and the field id", async () => {
    const request = jest.fn().mockResolvedValue(API_DATUM);
    const code = "PRY 1/x";
    const id = "a/b?c";
    await editDatum(code, id, "v", request);
    await restoreDatum(code, id, request);
    await verifyDatum(code, id, request);
    const base = `/api/projects/${encodeURIComponent(code)}/technical-data/${encodeURIComponent(id)}`;
    expect(request.mock.calls.map((c) => c[0])).toEqual([base, `${base}/restore`, `${base}/verify`]);
  });

  it.each([
    ["editDatum", (r: never) => editDatum("X", "address", "v", r)],
    ["restoreDatum", (r: never) => restoreDatum("X", "address", r)],
    ["verifyDatum", (r: never) => verifyDatum("X", "address", r)],
    ["verifyAll", (r: never) => verifyAll("X", r)],
    ["refreshFromCadastre", (r: never) => refreshFromCadastre("X", REF, r)],
  ])("%s propagates the ApiError untouched (403, 409, 422, 503...)", async (_n, call) => {
    const error = new ApiError(409, "technical_data_not_editable", "Solo se pueden editar en Briefing.");
    await expect(call(jest.fn().mockRejectedValue(error) as never)).rejects.toBe(error);
  });

  it("a malformed datum response is rejected", async () => {
    await expect(editDatum("X", "address", "v", jest.fn().mockResolvedValue({ value: 3 }))).rejects.toMatchObject({
      code: "invalid_technical_data_response",
    });
  });
});

describe("verifyAll and refreshFromCadastre", () => {
  it("verifyAll POSTs to /verify-all and returns the mapped whole sheet", async () => {
    const request = jest.fn().mockResolvedValue(apiSheetJson({ address: { verified: true } }));
    const result = await verifyAll("PRY-2026-001", request);
    expect(request).toHaveBeenCalledWith(`${BASE}/verify-all`, { method: "POST" });
    expect(result.queriedOn).toBe("2026-10-18");
    expect(result.data).toHaveLength(ID);
    expect(result.data.find((d) => d.id === "address")?.verified).toBe(true);
  });

  it("refreshFromCadastre POSTs {cadastral_reference} and returns the sheet plus `unmapped`", async () => {
    const request = jest.fn().mockResolvedValue({ ...apiSheetJson(), unmapped: ["use", "year"] });
    const result = await refreshFromCadastre("PRY-2026-001", REF, request);
    expect(request).toHaveBeenCalledWith(`${BASE}/refresh`, { method: "POST", body: { cadastral_reference: REF } });
    expect(result.unmapped).toEqual(["use", "year"]);
    expect(result.cadastralReference).toBe(REF);
    expect(result.queriedOn).toBe("2026-10-18");
    expect(result.data).toHaveLength(ID);
  });

  it("a response without `unmapped` is treated as nothing unmapped", async () => {
    const result = await refreshFromCadastre("X", REF, jest.fn().mockResolvedValue(apiSheetJson()));
    expect(result.unmapped).toEqual([]);
  });
});

describe("createTechnicalDataApi", () => {
  it("wraps every function with the given request, in the interface's argument order", async () => {
    const request = jest.fn().mockImplementation(async (path: string) => (path.endsWith("/address") || path.endsWith("/restore") || path.endsWith("/verify") ? API_DATUM : apiSheetJson()));
    const api = createTechnicalDataApi(request);
    await api.load("P");
    await api.edit("P", "address", "v");
    await api.restore("P", "address");
    await api.verify("P", "address");
    await api.verifyAll("P");
    await api.refresh("P", REF);
    expect(request.mock.calls.map((c) => [c[1].method, c[0]])).toEqual([
      ["GET", "/api/projects/P/technical-data"],
      ["PUT", "/api/projects/P/technical-data/address"],
      ["POST", "/api/projects/P/technical-data/address/restore"],
      ["POST", "/api/projects/P/technical-data/address/verify"],
      ["POST", "/api/projects/P/technical-data/verify-all"],
      ["POST", "/api/projects/P/technical-data/refresh"],
    ]);
  });
});

describe("technicalDataApiFor", () => {
  let original: typeof fetch;
  let calls: string[];
  beforeEach(() => {
    original = globalThis.fetch;
    calls = [];
    globalThis.fetch = (async (url: string) => {
      calls.push(String(url));
      return { ok: true, status: 200, text: async () => JSON.stringify(apiSheetJson()) };
    }) as unknown as typeof fetch;
  });
  afterEach(() => {
    globalThis.fetch = original;
  });

  it("a PRY-EJ sample never touches the network", async () => {
    await technicalDataApiFor("PRY-EJ-001").load("PRY-EJ-001");
    expect(calls).toEqual([]);
  });

  it("a real project goes through the API", async () => {
    await technicalDataApiFor("PRY-2026-001").load("PRY-2026-001");
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatch(/\/api\/projects\/PRY-2026-001\/technical-data$/);
  });
});

describe("createSampleTechnicalDataApi (fictitious data, in memory)", () => {
  it("loads PRY-EJ-001 as the saved, verified sheet with two edited data", async () => {
    const sheet = await createSampleTechnicalDataApi().load("PRY-EJ-001");
    expect(sheet.cadastralReference).toBe(REF);
    expect(sheet.queriedOn).toBe("2026-10-18");
    expect(sheet.data).toHaveLength(ID);
    expect(sheet.data.filter((d) => d.edited).map((d) => d.id).sort()).toEqual(["builtArea", "polygonPlotArea"]);
    expect(sheet.data.every((d) => d.verified)).toBe(true);
  });

  it("loads any other sample as the empty catalog, never queried", async () => {
    const sheet = await createSampleTechnicalDataApi().load("PRY-EJ-004");
    expect(sheet.queriedOn).toBeNull();
    expect(sheet.data).toHaveLength(ID);
    expect(sheet.data.every((d) => d.value === "" && !d.verified)).toBe(true);
  });

  it("edit keeps the original and clears verified; restore goes back; verify and verifyAll mark", async () => {
    const api = createSampleTechnicalDataApi();
    await api.load("PRY-EJ-001");
    const edited = await api.edit("PRY-EJ-001", "address", "CL NEW 2");
    expect(edited).toMatchObject({ id: "address", value: "CL NEW 2", original: "CL EJEMPLO 12", edited: true, verified: false });
    const restored = await api.restore("PRY-EJ-001", "address");
    expect(restored).toMatchObject({ value: "CL EJEMPLO 12", edited: false });
    expect((await api.verify("PRY-EJ-001", "address")).verified).toBe(true);
    await api.edit("PRY-EJ-001", "address", "X");
    const all = await api.verifyAll("PRY-EJ-001");
    expect(all.data.every((d) => d.verified)).toBe(true);
    expect((await api.load("PRY-EJ-001")).data.find((d) => d.id === "address")?.value).toBe("X");
  });

  it("refresh returns sample origin data, unverified, keeps manual data and reports nothing unmapped", async () => {
    const api = createSampleTechnicalDataApi();
    await api.load("PRY-EJ-004");
    await api.edit("PRY-EJ-004", "buildability", "2");
    const result = await api.refresh("PRY-EJ-004", REF);
    expect(result.unmapped).toEqual([]);
    expect(result.queriedOn).toBe("2026-10-18");
    expect(result.data.find((d) => d.id === "address")?.value).toBe("CL EJEMPLO 12");
    expect(result.data.find((d) => d.id === "buildability")?.value).toBe("2");
    expect(result.data.some((d) => d.verified)).toBe(false);
  });

  it("state is kept per instance and per project code", async () => {
    const api = createSampleTechnicalDataApi();
    await api.edit("PRY-EJ-004", "buildability", "2");
    expect((await api.load("PRY-EJ-002")).data.find((d) => d.id === "buildability")?.value).toBe("");
    expect((await createSampleTechnicalDataApi().load("PRY-EJ-004")).data.find((d) => d.id === "buildability")?.value).toBe("");
  });
});

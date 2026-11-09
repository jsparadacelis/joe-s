/**
 * RGB-51b · contract for `@/lib/alerts-api` (new module):
 *   type Alert = { code: string; severity: "warning" | "info"; message: string; suggestion: string; fields: string[] }
 *   fetchAlerts(code, request?): Promise<Alert[]>   GET /api/projects/{code}/alerts  -> { alerts: [...] }
 * Strict validation: anything off the server contract is ApiError(502, "invalid_alerts_response").
 * `TechnicalDataApi` gains `alerts(code)` (wraps fetchAlerts) and `capacity(code)` (wraps fetchCapacity).
 */
import { ApiError } from "@/lib/api";
import { fetchAlerts } from "@/lib/alerts-api";
import { createTechnicalDataApi } from "@/lib/technical-data-api";

const ALERT = {
  code: "area_mismatch",
  severity: "warning",
  message: "La superficie del Catastro (96 m²) y la del polígono (99,4 m²) difieren un 3,5 %.",
  suggestion: "Revisa cuál usar como superficie de cálculo.",
  fields: ["cadastralPlotArea", "polygonPlotArea"],
};

async function invalid(raw: unknown): Promise<ApiError> {
  try {
    await fetchAlerts("PRY-2026-001", jest.fn().mockResolvedValue(raw));
  } catch (error) {
    expect(error).toBeInstanceOf(ApiError);
    return error as ApiError;
  }
  throw new Error("fetchAlerts did not throw");
}

describe("fetchAlerts", () => {
  it("GETs the alerts of the project (code encoded) and returns them as given", async () => {
    const request = jest.fn().mockResolvedValue({ alerts: [ALERT, { ...ALERT, code: "old_building", severity: "info", fields: [] }] });
    const result = await fetchAlerts("PRY 2026/001", request);
    expect(request).toHaveBeenCalledWith("/api/projects/PRY%202026%2F001/alerts", expect.objectContaining({ method: "GET" }));
    expect(result).toEqual([ALERT, { ...ALERT, code: "old_building", severity: "info", fields: [] }]);
  });

  it("an empty list is valid", async () => {
    expect(await fetchAlerts("PRY-2026-001", jest.fn().mockResolvedValue({ alerts: [] }))).toEqual([]);
  });

  it.each([
    ["not an object", "nope"],
    ["null", null],
    ["no alerts key", {}],
    ["alerts not an array", { alerts: "x" }],
    ["an item that is not an object", { alerts: ["x"] }],
    ["unknown severity", { alerts: [{ ...ALERT, severity: "critical" }] }],
    ["missing code", { alerts: [{ ...ALERT, code: undefined }] }],
    ["message not a string", { alerts: [{ ...ALERT, message: 3 }] }],
    ["suggestion not a string", { alerts: [{ ...ALERT, suggestion: null }] }],
    ["fields not an array", { alerts: [{ ...ALERT, fields: "address" }] }],
    ["fields with a non-string", { alerts: [{ ...ALERT, fields: ["address", 1] }] }],
  ])("%s -> ApiError 502 invalid_alerts_response", async (_name, raw) => {
    const error = await invalid(raw);
    expect(error.status).toBe(502);
    expect(error.code).toBe("invalid_alerts_response");
    expect(error.message).toMatch(/respuesta del servidor no es válida/i);
  });

  it("lets the server error through untouched (404 project not found)", async () => {
    const failure = new ApiError(404, "project_not_found", "No existe el proyecto PRY-2026-001.");
    await expect(fetchAlerts("PRY-2026-001", jest.fn().mockRejectedValue(failure))).rejects.toBe(failure);
  });
});

describe("createTechnicalDataApi · alerts and capacity", () => {
  it("alerts(code) goes through the given request", async () => {
    const request = jest.fn().mockResolvedValue({ alerts: [ALERT] });
    expect(await createTechnicalDataApi(request).alerts("PRY-2026-001")).toEqual([ALERT]);
    expect(request).toHaveBeenCalledWith("/api/projects/PRY-2026-001/alerts", expect.objectContaining({ method: "GET" }));
  });

  it("capacity(code) goes through the given request", async () => {
    const request = jest.fn().mockResolvedValue({ capacity: null, missing: ["floors"] });
    expect(await createTechnicalDataApi(request).capacity("PRY-2026-001")).toEqual({ capacity: null, missing: ["floors"] });
    expect(request).toHaveBeenCalledWith("/api/projects/PRY-2026-001/capacity", expect.objectContaining({ method: "GET" }));
  });
});

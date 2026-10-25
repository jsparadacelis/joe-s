/**
 * RGB-16 contract of `@/lib/start` (to be created by the front developer):
 *   fetchProposedPlan(projectType, scale, request?) -> ProposedPlan        GET  /api/plan?project_type=&scale=
 *   startProject(code, scale, weeks, request?)      -> StartResult         POST /api/projects/{code}/start
 *   fetchProjectPlan(code, request?)                -> ConfirmedPlan|null  GET  /api/projects/{code}/plan (404 plan_not_found -> null)
 *   doNotPursue(code, reason, request?)             -> Transition          POST /api/projects/{code}/do-not-pursue
 *   validateWeeks, MAX_WEEKS, totalWeeks(weeks)     same limits and message as lib/plan-settings
 */
import { ApiError, createApiClient, type ResponseLike } from "@/lib/api";
import { MAX_WEEKS as SETTINGS_MAX_WEEKS, validateWeeks as settingsValidateWeeks } from "@/lib/plan-settings";
import {
  MAX_WEEKS,
  doNotPursue,
  fetchProjectPlan,
  fetchProposedPlan,
  startProject,
  totalWeeks,
  validateWeeks,
} from "@/lib/start";

const WEEKS_MESSAGE = "Cada plantilla necesita exactamente 7 valores de semanas, enteros y entre 1 y 520.";
const WEEKS = [2, 4, 6, 8, 10, 12, 14];

function json(status: number, body?: unknown): ResponseLike {
  return { ok: status >= 200 && status < 300, status, text: async () => (body === undefined ? "" : JSON.stringify(body)) };
}
function clientWith(response: ResponseLike) {
  const fetch = jest.fn().mockResolvedValue(response);
  return { request: createApiClient({ baseUrl: "http://api", fetch }).request, fetch };
}

// Real wire shape (backend/app/api/plan_routes.py): weeks_by_phase is an OBJECT keyed "1".."7", not an array.
const WEEKS_OBJECT = { "1": 2, "2": 4, "3": 6, "4": 8, "5": 10, "6": 12, "7": 14 };
const API_PLAN = { project_type: "single_family_house", scale: "medium", weeks_by_phase: WEEKS_OBJECT, total: 56 };

describe("weeks rules (same as the server and the plan settings)", () => {
  it("uses the same limit and message as the plan settings", () => {
    expect(MAX_WEEKS).toBe(520);
    expect(MAX_WEEKS).toBe(SETTINGS_MAX_WEEKS);
    expect(validateWeeks([1, 1, 1, 1, 1, 1, 1])).toBeNull();
    expect(validateWeeks(Array(7).fill(520))).toBeNull();
    expect(validateWeeks([1, 2, 3, 4, 5, 6, 0])).toBe(WEEKS_MESSAGE);
    expect(validateWeeks([1, 2, 3, 4, 5, 6, 7])).toBe(settingsValidateWeeks([1, 2, 3, 4, 5, 6, 7]));
  });

  it.each([
    ["six values", [1, 2, 3, 4, 5, 6]],
    ["eight values", [1, 2, 3, 4, 5, 6, 7, 8]],
    ["zero", [0, 2, 3, 4, 5, 6, 7]],
    ["above the limit", [1, 2, 3, 4, 5, 6, 521]],
    ["a decimal", [1.5, 2, 3, 4, 5, 6, 7]],
    ["NaN", [NaN, 2, 3, 4, 5, 6, 7]],
    ["negative", [-1, 2, 3, 4, 5, 6, 7]],
  ])("rejects %s with the server message", (_name, weeks) => {
    expect(validateWeeks(weeks)).toBe(WEEKS_MESSAGE);
  });

  it("totalWeeks adds the seven values", () => {
    expect(totalWeeks(WEEKS)).toBe(56);
  });
});

describe("fetchProposedPlan", () => {
  it("GETs /api/plan with project_type and scale and maps to camelCase", async () => {
    const { request, fetch } = clientWith(json(200, API_PLAN));
    const plan = await fetchProposedPlan("single_family_house", "medium", request);
    const [url, init] = fetch.mock.calls[0];
    const parsed = new URL(url);
    expect(parsed.pathname).toBe("/api/plan");
    expect(parsed.searchParams.get("project_type")).toBe("single_family_house");
    expect(parsed.searchParams.get("scale")).toBe("medium");
    expect(init.method).toBe("GET");
    expect(plan).toEqual({ projectType: "single_family_house", scale: "medium", weeksByPhase: WEEKS, total: 56 });
  });

  it("surfaces an API error with its code and Spanish message", async () => {
    const { request } = clientWith(json(422, { detail: { code: "invalid_scale", message: "La escala no es válida." } }));
    await expect(fetchProposedPlan("facility", "large", request)).rejects.toMatchObject({
      status: 422,
      code: "invalid_scale",
      message: "La escala no es válida.",
    });
  });
});

describe("startProject", () => {
  const apiResult = {
    code: "PRY-2026-001",
    action: "promote",
    previous_phase: 0,
    current_phase: 1,
    frozen_version: 3,
    plan: API_PLAN,
  };

  it("POSTs {scale, weeks} and maps the response to camelCase", async () => {
    const { request, fetch } = clientWith(json(200, apiResult));
    const result = await startProject("PRY-2026-001", "medium", WEEKS, request);
    const [url, init] = fetch.mock.calls[0];
    expect(url).toBe("http://api/api/projects/PRY-2026-001/start");
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body)).toEqual({ scale: "medium", weeks: WEEKS });
    expect(result).toEqual({
      code: "PRY-2026-001",
      action: "promote",
      previousPhase: 0,
      currentPhase: 1,
      frozenVersion: 3,
      plan: { projectType: "single_family_house", scale: "medium", weeksByPhase: WEEKS, total: 56 },
    });
  });

  it("encodes the project code in the path", async () => {
    const { request, fetch } = clientWith(json(200, apiResult));
    await startProject("PRY 2026/1", "small", WEEKS, request);
    expect(fetch.mock.calls[0][0]).toBe("http://api/api/projects/PRY%202026%2F1/start");
  });

  it.each([
    [403, "no_authority", "No tienes autoridad para promover desde esta fase."],
    [404, "project_not_found", "No existe el proyecto PRY-2026-001."],
    [409, "plan_already_confirmed", "El proyecto ya tiene un plan confirmado."],
    [422, "incomplete_deliverable", "Falta guardar el scoring de la oportunidad."],
    [422, "invalid_weeks", WEEKS_MESSAGE],
    [422, "invalid_scale", "La escala no es válida."],
  ])("a %i %s becomes an ApiError with the server's code and message", async (status, code, message) => {
    const { request } = clientWith(json(status, { detail: { code, message } }));
    const error = await startProject("PRY-2026-001", "medium", WEEKS, request).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ status, code, message });
  });

  it("a network failure is an ApiError with status 0", async () => {
    const fetch = jest.fn().mockRejectedValue(new TypeError("failed"));
    const request = createApiClient({ baseUrl: "http://api", fetch }).request;
    await expect(startProject("PRY-2026-001", "medium", WEEKS, request)).rejects.toMatchObject({ status: 0, code: "network_error" });
  });

  it("a body that is not {detail:{code,message}} gives the generic Spanish error", async () => {
    const { request } = clientWith(json(500, { oops: true }));
    await expect(startProject("PRY-2026-001", "medium", WEEKS, request)).rejects.toMatchObject({
      status: 500,
      message: "Ocurrió un error inesperado. Inténtalo de nuevo.",
    });
  });
});

describe("weeks_by_phase wire contract (object keyed by phase)", () => {
  it("maps a literal API response to an ordered array of seven numbers", async () => {
    const literal = '{"project_type":"single_family_house","scale":"medium","weeks_by_phase":{"1":2,"2":4,"3":6,"4":8,"5":10,"6":12,"7":14},"total":56}';
    const fetch = jest.fn().mockResolvedValue({ ok: true, status: 200, text: async () => literal });
    const request = createApiClient({ baseUrl: "http://api", fetch }).request;
    const plan = await fetchProposedPlan("single_family_house", "medium", request);
    expect(plan.weeksByPhase).toEqual([2, 4, 6, 8, 10, 12, 14]);
  });

  it("orders by phase number whatever the key order of the object", async () => {
    const shuffled = { "7": 14, "1": 2, "3": 6, "2": 4, "5": 10, "4": 8, "6": 12 };
    const { request } = clientWith(json(200, { ...API_PLAN, weeks_by_phase: shuffled }));
    expect((await fetchProposedPlan("single_family_house", "medium", request)).weeksByPhase).toEqual(WEEKS);
  });

  it.each([
    ["a missing phase", { "1": 2, "2": 4, "3": 6, "4": 8, "5": 10, "6": 12 }],
    ["a non-integer value", { ...WEEKS_OBJECT, "3": 6.5 }],
    ["a string value", { ...WEEKS_OBJECT, "3": "6" }],
    ["an array instead of an object", WEEKS],
    ["null", null],
  ])("rejects %s with a clear ApiError", async (_name, bad) => {
    const { request } = clientWith(json(200, { ...API_PLAN, weeks_by_phase: bad }));
    const error = await fetchProposedPlan("single_family_house", "medium", request).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ code: "invalid_plan_response" });
  });

  it("the plan inside /start and the confirmed plan use the same shape", async () => {
    const start = clientWith(
      json(200, { code: "PRY-2026-001", action: "promote", previous_phase: 0, current_phase: 1, frozen_version: 3, plan: API_PLAN }),
    );
    expect((await startProject("PRY-2026-001", "medium", WEEKS, start.request)).plan.weeksByPhase).toEqual(WEEKS);
    const confirmed = clientWith(json(200, { ...API_PLAN, confirmed_at: "2026-10-25T09:30:00Z", confirmed_by: "Test partner" }));
    expect((await fetchProjectPlan("PRY-2026-001", confirmed.request))?.weeksByPhase).toEqual(WEEKS);
  });
});

describe("fetchProjectPlan", () => {
  it("returns the confirmed plan mapped to camelCase", async () => {
    const { request, fetch } = clientWith(
      json(200, { ...API_PLAN, confirmed_at: "2026-10-25T09:30:00Z", confirmed_by: "Test partner" }),
    );
    const plan = await fetchProjectPlan("PRY-2026-001", request);
    expect(fetch.mock.calls[0][0]).toBe("http://api/api/projects/PRY-2026-001/plan");
    expect(plan).toEqual({
      projectType: "single_family_house",
      scale: "medium",
      weeksByPhase: WEEKS,
      total: 56,
      confirmedAt: "2026-10-25T09:30:00Z",
      confirmedBy: "Test partner",
    });
  });

  it("returns null for plan_not_found", async () => {
    const { request } = clientWith(json(404, { detail: { code: "plan_not_found", message: "El proyecto aún no tiene plan confirmado." } }));
    await expect(fetchProjectPlan("PRY-2026-001", request)).resolves.toBeNull();
  });

  it("does not disguise another 404 or a server error as «no plan»", async () => {
    const missing = clientWith(json(404, { detail: { code: "project_not_found", message: "No existe el proyecto X." } }));
    await expect(fetchProjectPlan("X", missing.request)).rejects.toMatchObject({ code: "project_not_found" });
    const broken = clientWith(json(500, {}));
    await expect(fetchProjectPlan("PRY-2026-001", broken.request)).rejects.toMatchObject({ status: 500 });
  });
});

describe("doNotPursue", () => {
  it("POSTs {reason} to the RGB-9 route and maps the transition", async () => {
    const { request, fetch } = clientWith(
      json(200, { code: "PRY-2026-001", action: "do_not_pursue", previous_phase: 0, current_phase: 0, frozen_version: 2 }),
    );
    const result = await doNotPursue("PRY-2026-001", "Budget too low", request);
    const [url, init] = fetch.mock.calls[0];
    expect(url).toBe("http://api/api/projects/PRY-2026-001/do-not-pursue");
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body)).toEqual({ reason: "Budget too low" });
    expect(result).toMatchObject({ code: "PRY-2026-001", action: "do_not_pursue", previousPhase: 0, frozenVersion: 2 });
  });

  it.each([
    [403, "no_authority", "No tienes autoridad para descartar esta oportunidad."],
    [409, "action_not_allowed", "Esta acción no está permitida en la fase actual."],
    [422, "reason_required", "El motivo es obligatorio."],
  ])("a %i %s becomes an ApiError", async (status, code, message) => {
    const { request } = clientWith(json(status, { detail: { code, message } }));
    await expect(doNotPursue("PRY-2026-001", "x", request)).rejects.toMatchObject({ status, code, message });
  });
});

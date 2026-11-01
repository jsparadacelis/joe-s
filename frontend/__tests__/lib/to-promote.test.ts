import { ApiError, createApiClient } from "@/lib/api";
import { fetchToPromote, toPromoteStateLabel } from "@/lib/to-promote";
import { API_TO_PROMOTE } from "../helpers/to-promote-fixtures";

const INVALID = "La respuesta del servidor no es válida. Inténtalo de nuevo.";

function clientFor(body: unknown, status = 200) {
  const fetch = jest.fn().mockResolvedValue({
    ok: status < 300,
    status,
    text: async () => (typeof body === "string" ? body : JSON.stringify(body)),
  });
  return { fetch, request: createApiClient({ baseUrl: "http://api.test", fetch }).request };
}

async function rejection(promise: Promise<unknown>): Promise<unknown> {
  try {
    await promise;
  } catch (error) {
    return error;
  }
  throw new Error("expected the promise to reject");
}

describe("toPromoteStateLabel", () => {
  it.each([
    ["ready", "Listo para promover"],
    ["in_progress", "En curso"],
    ["blocked", "Bloqueado"],
  ])("labels %s as «%s»", (state, label) => {
    expect(toPromoteStateLabel(state)).toBe(label);
  });

  it.each(["", "archived", "constructor", "__proto__", "toString"])("does not break on the unknown state %p", (state) => {
    expect(toPromoteStateLabel(state)).toBe("Estado desconocido");
  });
});

describe("fetchToPromote", () => {
  it("calls GET /api/to-promote", async () => {
    const { fetch, request } = clientFor(API_TO_PROMOTE);
    await fetchToPromote(request);
    expect(fetch).toHaveBeenCalledTimes(1);
    const [url, init] = fetch.mock.calls[0];
    expect(url).toBe("http://api.test/api/to-promote");
    expect(init.method).toBe("GET");
  });

  it("maps snake_case to the front model and keeps the server order", async () => {
    const { request } = clientFor(API_TO_PROMOTE);
    const result = await fetchToPromote(request);
    expect(result.readyCount).toBe(2);
    expect(result.projects.map((p) => p.code)).toEqual(["PRY-2026-001", "PRY-2026-002", "PRY-2026-003", "PRY-2026-004"]);
    expect(result.projects[0]).toEqual({
      code: "PRY-2026-001",
      name: "Vivienda unifamiliar Los Almendros (demo)",
      phase: 0,
      phaseName: "Oportunidad",
      deliverable: API_TO_PROMOTE.projects[0].deliverable,
      state: "ready",
      reason: null,
      promoter: "Socio o director",
      canPromote: true,
    });
    expect(result.projects[2].reason).toBe("Falta: Referencia catastral, Alcance incluido, Alcance excluido y 10 más.");
    expect(result.projects[3]).toMatchObject({ state: "blocked", canPromote: false, promoter: "Director de proyecto" });
  });

  it("accepts an empty list with ready_count 0", async () => {
    const { request } = clientFor({ ready_count: 0, projects: [] });
    expect(await fetchToPromote(request)).toEqual({ readyCount: 0, projects: [] });
  });

  it("keeps a state this client does not know instead of failing", async () => {
    const body = { ready_count: 0, projects: [{ ...API_TO_PROMOTE.projects[0], state: "archived" }] };
    const result = await fetchToPromote(clientFor(body).request);
    expect(result.projects[0].state).toBe("archived");
  });

  it.each([401, 403, 503])("lets the ApiError of a %s through with the server message", async (status) => {
    const { request } = clientFor({ detail: { code: "some_code", message: `Mensaje ${status}` } }, status);
    const error = await rejection(fetchToPromote(request));
    expect(error).toBeInstanceOf(ApiError);
    if (!(error instanceof ApiError)) return;
    expect(error.status).toBe(status);
    expect(error.code).toBe("some_code");
    expect(error.message).toBe(`Mensaje ${status}`);
  });

  it("lets a network failure through as an ApiError", async () => {
    const request = createApiClient({ baseUrl: "http://api.test", fetch: jest.fn().mockRejectedValue(new Error("down")) }).request;
    const error = await rejection(fetchToPromote(request));
    expect(error).toBeInstanceOf(ApiError);
    if (error instanceof ApiError) expect(error.code).toBe("network_error");
  });

  const project = API_TO_PROMOTE.projects[0];
  it.each<[string, unknown]>([
    ["an empty body", ""],
    ["a body that is not JSON", "<html>"],
    ["null", "null"],
    ["an array", []],
    ["no projects", { ready_count: 0 }],
    ["projects that is not a list", { ready_count: 0, projects: "x" }],
    ["no ready_count", { projects: [] }],
    ["a ready_count that is not a number", { ready_count: "2", projects: [] }],
    ["a project that is not an object", { ready_count: 0, projects: ["x"] }],
    ["a project without code", { ready_count: 0, projects: [{ ...project, code: undefined }] }],
    ["a project with a numeric name", { ready_count: 0, projects: [{ ...project, name: 7 }] }],
    ["a project without phase", { ready_count: 0, projects: [{ ...project, phase: undefined }] }],
    ["a project without phase_name", { ready_count: 0, projects: [{ ...project, phase_name: undefined }] }],
    ["a project without deliverable", { ready_count: 0, projects: [{ ...project, deliverable: undefined }] }],
    ["a project without state", { ready_count: 0, projects: [{ ...project, state: undefined }] }],
    ["a reason that is not text or null", { ready_count: 0, projects: [{ ...project, reason: 3 }] }],
    ["a project without promoter", { ready_count: 0, projects: [{ ...project, promoter: undefined }] }],
    ["a can_promote that is not boolean", { ready_count: 0, projects: [{ ...project, can_promote: "yes" }] }],
  ])("rejects %s with invalid_to_promote_response", async (_name, body) => {
    const error = await rejection(fetchToPromote(clientFor(body).request));
    expect(error).toBeInstanceOf(ApiError);
    if (!(error instanceof ApiError)) return;
    expect(error.code).toBe("invalid_to_promote_response");
    expect(error.message).toBe(INVALID);
  });
});

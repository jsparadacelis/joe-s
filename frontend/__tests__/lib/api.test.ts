import { ApiError, createApiClient, request } from "@/lib/api";

const UNEXPECTED = "Ocurrió un error inesperado. Inténtalo de nuevo.";
const NETWORK = "No se pudo conectar con el servidor. Comprueba tu conexión e inténtalo de nuevo.";

/** Minimal fake of a fetch Response: supports text() and json(). */
function fakeResponse(status: number, bodyText = "") {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: () => null },
    text: async () => bodyText,
    json: async () => JSON.parse(bodyText),
  };
}

const jsonResponse = (status: number, body: unknown) => fakeResponse(status, JSON.stringify(body));

function clientWith(response: ReturnType<typeof fakeResponse>, baseUrl = "https://api.example.test") {
  const fetch = jest.fn().mockResolvedValue(response);
  return { fetch, client: createApiClient({ baseUrl, fetch }) };
}

async function failureOf(promise: Promise<unknown>): Promise<ApiError> {
  try {
    await promise;
  } catch (error) {
    return error as ApiError;
  }
  throw new Error("expected the request to fail");
}

describe("createApiClient · base URL", () => {
  const original = process.env.NEXT_PUBLIC_API_URL;
  afterEach(() => {
    if (original === undefined) delete process.env.NEXT_PUBLIC_API_URL;
    else process.env.NEXT_PUBLIC_API_URL = original;
  });

  it("joins the base URL and the path", async () => {
    const { fetch, client } = clientWith(jsonResponse(200, {}), "https://api.example.test");
    await client.request("/api/health");
    expect(fetch.mock.calls[0][0]).toBe("https://api.example.test/api/health");
  });

  it("ignores a trailing slash on the base URL", async () => {
    const { fetch, client } = clientWith(jsonResponse(200, {}), "https://api.example.test/");
    await client.request("/api/health");
    expect(fetch.mock.calls[0][0]).toBe("https://api.example.test/api/health");
  });

  it("reads NEXT_PUBLIC_API_URL when no base URL is given", async () => {
    process.env.NEXT_PUBLIC_API_URL = "https://from-env.example.test/";
    const fetch = jest.fn().mockResolvedValue(jsonResponse(200, {}));
    await createApiClient({ fetch }).request("/api/health");
    expect(fetch.mock.calls[0][0]).toBe("https://from-env.example.test/api/health");
  });

  it("defaults to http://localhost:8000", async () => {
    delete process.env.NEXT_PUBLIC_API_URL;
    const fetch = jest.fn().mockResolvedValue(jsonResponse(200, {}));
    await createApiClient({ fetch }).request("/api/health");
    expect(fetch.mock.calls[0][0]).toBe("http://localhost:8000/api/health");
  });
});

describe("createApiClient · success", () => {
  it("sends GET by default and returns the parsed JSON", async () => {
    const { fetch, client } = clientWith(jsonResponse(200, { templates: { industrial: [1, 2] } }));
    const result = await client.request<{ templates: Record<string, number[]> }>("/api/settings/plan");
    expect(result).toEqual({ templates: { industrial: [1, 2] } });
    expect(fetch.mock.calls[0][1]).toEqual(expect.objectContaining({ method: "GET" }));
    expect(fetch.mock.calls[0][1].body).toBeUndefined();
  });

  it("serialises the body as JSON with a JSON content type", async () => {
    const { fetch, client } = clientWith(fakeResponse(204));
    await client.request("/api/x", { method: "PUT", body: { weeks: [1, 2, 3] } });
    const init = fetch.mock.calls[0][1];
    expect(init.method).toBe("PUT");
    expect(init.body).toBe(JSON.stringify({ weeks: [1, 2, 3] }));
    expect(new Headers(init.headers).get("Content-Type")).toBe("application/json");
  });

  it("returns undefined on 204", async () => {
    const { client } = clientWith(fakeResponse(204));
    await expect(client.request("/api/x", { method: "PUT", body: {} })).resolves.toBeUndefined();
  });
});

describe("createApiClient · errors", () => {
  it("keeps status, code and message of a { detail: { code, message } } body", async () => {
    const { client } = clientWith(
      jsonResponse(422, { detail: { code: "invalid_weeks", message: "Cada plantilla necesita exactamente 7 valores." } }),
    );
    const error = await failureOf(client.request("/api/x", { method: "PUT", body: {} }));
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toBeInstanceOf(Error);
    expect(error.status).toBe(422);
    expect(error.code).toBe("invalid_weeks");
    expect(error.message).toBe("Cada plantilla necesita exactamente 7 valores.");
  });

  it("maps a FastAPI validation error (detail as a list) to unexpected_error", async () => {
    const { client } = clientWith(
      jsonResponse(422, { detail: [{ loc: ["body", "weeks"], msg: "field required", type: "missing" }] }),
    );
    const error = await failureOf(client.request("/api/x"));
    expect(error.status).toBe(422);
    expect(error.code).toBe("unexpected_error");
    expect(error.message).toBe(UNEXPECTED);
  });

  it("maps an HTML body to unexpected_error", async () => {
    const { client } = clientWith(fakeResponse(502, "<html><body>Bad gateway</body></html>"));
    const error = await failureOf(client.request("/api/x"));
    expect(error.status).toBe(502);
    expect(error.code).toBe("unexpected_error");
    expect(error.message).toBe(UNEXPECTED);
  });

  it("maps an empty error body to unexpected_error", async () => {
    const { client } = clientWith(fakeResponse(500, ""));
    const error = await failureOf(client.request("/api/x"));
    expect(error.status).toBe(500);
    expect(error.code).toBe("unexpected_error");
    expect(error.message).toBe(UNEXPECTED);
  });

  it("maps a JSON body without detail to unexpected_error", async () => {
    const { client } = clientWith(jsonResponse(404, { other: true }));
    const error = await failureOf(client.request("/api/x"));
    expect(error.status).toBe(404);
    expect(error.code).toBe("unexpected_error");
    expect(error.message).toBe(UNEXPECTED);
  });

  it("maps a network failure to status 0 / network_error", async () => {
    const fetch = jest.fn().mockRejectedValue(new TypeError("Failed to fetch"));
    const client = createApiClient({ baseUrl: "https://api.example.test", fetch });
    const error = await failureOf(client.request("/api/x"));
    expect(error).toBeInstanceOf(ApiError);
    expect(error.status).toBe(0);
    expect(error.code).toBe("network_error");
    expect(error.message).toBe(NETWORK);
  });
});

describe("createApiClient · edge cases", () => {
  it("does not send a body or a JSON content type on a GET", async () => {
    const { fetch, client } = clientWith(jsonResponse(200, {}));
    await client.request("/api/health");
    expect(fetch.mock.calls[0][1].body).toBeUndefined();
  });

  it("maps a detail object missing the message to unexpected_error", async () => {
    const { client } = clientWith(jsonResponse(422, { detail: { code: "invalid_weeks" } }));
    const error = await failureOf(client.request("/api/x"));
    expect(error.code).toBe("unexpected_error");
    expect(error.message).toBe(UNEXPECTED);
  });

  it("maps a detail given as a plain string to unexpected_error", async () => {
    const { client } = clientWith(jsonResponse(404, { detail: "Not Found" }));
    const error = await failureOf(client.request("/api/x"));
    expect(error.status).toBe(404);
    expect(error.code).toBe("unexpected_error");
    expect(error.message).toBe(UNEXPECTED);
  });
});

describe("ApiError", () => {
  it("exposes status, code and message", () => {
    const error = new ApiError(409, "conflict", "Mensaje");
    expect(error).toBeInstanceOf(Error);
    expect([error.status, error.code, error.message]).toEqual([409, "conflict", "Mensaje"]);
  });
});

describe("default request", () => {
  const originalFetch = (globalThis as { fetch?: unknown }).fetch;
  afterEach(() => {
    (globalThis as { fetch?: unknown }).fetch = originalFetch;
  });

  it("uses the global fetch resolved at call time", async () => {
    const fetch = jest.fn().mockResolvedValue(jsonResponse(200, { ok: true }));
    (globalThis as { fetch?: unknown }).fetch = fetch;
    await expect(request<{ ok: boolean }>("/api/health")).resolves.toEqual({ ok: true });
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(String(fetch.mock.calls[0][0])).toMatch(/\/api\/health$/);
  });
});

/**
 * RGB-2b · contract for `createApiClient({ getToken })` in `@/lib/api`:
 *   getToken?: () => string | null | undefined | Promise<string | null | undefined>
 *   - called on every request (tokens rotate); a non-empty token adds `Authorization: Bearer <token>`;
 *     null/undefined/"" adds no Authorization header at all.
 *   - Content-Type is still sent with a body; existing behaviour (api.test.ts) does not change.
 */
import { createApiClient } from "@/lib/api";

const ok = { ok: true, status: 200, text: async () => "{}" };
const fetchMock = () => jest.fn().mockResolvedValue(ok);
const headersOf = (fetch: jest.Mock, call = 0): Record<string, string> => fetch.mock.calls[call][1].headers ?? {};

describe("createApiClient · token provider", () => {
  it("adds the Bearer header from a sync provider", async () => {
    const fetch = fetchMock();
    await createApiClient({ baseUrl: "https://api.example.test", fetch, getToken: () => "token-abc" }).request("/api/me");
    expect(headersOf(fetch).Authorization).toBe("Bearer token-abc");
  });

  it("adds the Bearer header from an async provider", async () => {
    const fetch = fetchMock();
    await createApiClient({ baseUrl: "https://api.example.test", fetch, getToken: async () => "token-async" }).request("/api/me");
    expect(headersOf(fetch).Authorization).toBe("Bearer token-async");
  });

  it.each([null, undefined, ""])("adds no Authorization header when the token is %p", async (token) => {
    const fetch = fetchMock();
    await createApiClient({ baseUrl: "https://api.example.test", fetch, getToken: () => token }).request("/api/me");
    expect(headersOf(fetch)).not.toHaveProperty("Authorization");
  });

  it("adds no Authorization header without a provider", async () => {
    const fetch = fetchMock();
    await createApiClient({ baseUrl: "https://api.example.test", fetch }).request("/api/me");
    expect(headersOf(fetch)).not.toHaveProperty("Authorization");
  });

  it("asks for the token on every request", async () => {
    const fetch = fetchMock();
    const getToken = jest.fn().mockReturnValueOnce("first").mockReturnValueOnce("second");
    const client = createApiClient({ baseUrl: "https://api.example.test", fetch, getToken });
    await client.request("/a");
    await client.request("/b");
    expect(headersOf(fetch, 0).Authorization).toBe("Bearer first");
    expect(headersOf(fetch, 1).Authorization).toBe("Bearer second");
  });

  it("keeps Content-Type next to the token when sending a body", async () => {
    const fetch = fetchMock();
    await createApiClient({ baseUrl: "https://api.example.test", fetch, getToken: () => "t" }).request("/api/x", { method: "POST", body: { a: 1 } });
    expect(headersOf(fetch)).toEqual({ "Content-Type": "application/json", Authorization: "Bearer t" });
  });

  it("does not put the token in the URL or the body", async () => {
    const fetch = fetchMock();
    await createApiClient({ baseUrl: "https://api.example.test", fetch, getToken: () => "secret-token" }).request("/api/x", { method: "POST", body: { a: 1 } });
    expect(fetch.mock.calls[0][0]).not.toContain("secret-token");
    expect(fetch.mock.calls[0][1].body).not.toContain("secret-token");
  });

  it("reports a failing provider as a network-style error instead of sending an unauthenticated request", async () => {
    const fetch = fetchMock();
    const client = createApiClient({ baseUrl: "https://api.example.test", fetch, getToken: () => { throw new Error("no session"); } });
    await expect(client.request("/api/me")).rejects.toMatchObject({ name: "ApiError", status: 0 });
    expect(fetch).not.toHaveBeenCalled();
  });
});

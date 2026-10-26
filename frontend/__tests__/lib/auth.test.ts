/**
 * RGB-2b · contract for `@/lib/auth` (pure, no Supabase import):
 *   getAuthMode(env?: Record<string, string | undefined>): "dev" | "supabase"
 *     - env defaults to process.env; unset or "dev" -> "dev"; "supabase" -> "supabase";
 *       any other value throws an Error whose message mentions NEXT_PUBLIC_AUTH_MODE.
 *   getSupabaseConfig(env?): { url: string; anonKey: string } | null
 *     - null in dev mode (never throws there); in supabase mode throws an Error naming the missing
 *       NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY variable.
 *   getLoginNotice(code: string | null | undefined): string | null   (Spanish text for /login?error=<code>)
 *   resolveAuthError(code: string): { destination: string; message: string } | null
 *   resolveApiError(error: ApiError): { destination: string; message: string } | null
 *   type AuthClient (the injectable slice of the Supabase client, see helpers/fake-auth-client.ts)
 */
import { ApiError } from "@/lib/api";
import { getAuthMode, getLoginNotice, getSupabaseConfig, resolveApiError, resolveAuthError } from "@/lib/auth";

describe("getAuthMode", () => {
  it("defaults to dev when the variable is not set", () => {
    expect(getAuthMode({})).toBe("dev");
  });

  it("defaults to dev when the variable is an empty string", () => {
    expect(getAuthMode({ NEXT_PUBLIC_AUTH_MODE: "" })).toBe("dev");
  });

  it("returns dev when explicitly set", () => {
    expect(getAuthMode({ NEXT_PUBLIC_AUTH_MODE: "dev" })).toBe("dev");
  });

  it("returns supabase when explicitly set", () => {
    expect(getAuthMode({ NEXT_PUBLIC_AUTH_MODE: "supabase" })).toBe("supabase");
  });

  it("rejects an unknown mode with a clear message", () => {
    expect(() => getAuthMode({ NEXT_PUBLIC_AUTH_MODE: "oauth" })).toThrow(/NEXT_PUBLIC_AUTH_MODE/);
  });

  it("reads process.env by default (dev in the test environment)", () => {
    expect(getAuthMode()).toBe("dev");
  });
});

describe("getSupabaseConfig", () => {
  const full = {
    NEXT_PUBLIC_AUTH_MODE: "supabase",
    NEXT_PUBLIC_SUPABASE_URL: "https://project.example.test",
    NEXT_PUBLIC_SUPABASE_ANON_KEY: "publishable-key-example",
  };

  it("returns the url and the publishable key in supabase mode", () => {
    expect(getSupabaseConfig(full)).toEqual({ url: "https://project.example.test", anonKey: "publishable-key-example" });
  });

  it("returns null in dev mode even without variables", () => {
    expect(getSupabaseConfig({})).toBeNull();
  });

  it("fails at start-up when the url is missing in supabase mode", () => {
    const { NEXT_PUBLIC_SUPABASE_URL: _omit, ...rest } = full;
    expect(() => getSupabaseConfig(rest)).toThrow(/NEXT_PUBLIC_SUPABASE_URL/);
  });

  it("fails at start-up when the key is missing in supabase mode", () => {
    const { NEXT_PUBLIC_SUPABASE_ANON_KEY: _omit, ...rest } = full;
    expect(() => getSupabaseConfig(rest)).toThrow(/NEXT_PUBLIC_SUPABASE_ANON_KEY/);
  });

  it("treats blank values as missing", () => {
    expect(() => getSupabaseConfig({ ...full, NEXT_PUBLIC_SUPABASE_URL: "  " })).toThrow(/NEXT_PUBLIC_SUPABASE_URL/);
  });
});

describe("resolveAuthError (server error code -> screen)", () => {
  it("sends unauthenticated to /login", () => {
    expect(resolveAuthError("unauthenticated")?.destination).toBe("/login");
  });

  it("sends mfa_required to /login/mfa", () => {
    expect(resolveAuthError("mfa_required")?.destination).toBe("/login/mfa");
  });

  it.each(["not_invited", "member_revoked", "email_not_verified"])("sends %s to /login with its notice code", (code) => {
    expect(resolveAuthError(code)?.destination).toBe(`/login?error=${code}`);
  });

  it("explains not_invited in Spanish", () => {
    expect(resolveAuthError("not_invited")?.message).toMatch(/No tienes invitación/);
  });

  it("explains member_revoked in Spanish", () => {
    expect(resolveAuthError("member_revoked")?.message).toMatch(/Tu acceso ha sido retirado/);
  });

  it("explains email_not_verified in Spanish", () => {
    expect(resolveAuthError("email_not_verified")?.message).toMatch(/verific/i);
  });

  it("gives every known code a non-empty Spanish message", () => {
    for (const code of ["unauthenticated", "mfa_required", "not_invited", "member_revoked", "email_not_verified"]) {
      expect(resolveAuthError(code)?.message.length).toBeGreaterThan(10);
    }
  });

  it("returns null for codes that are not about access", () => {
    expect(resolveAuthError("no_authority")).toBeNull();
    expect(resolveAuthError("unexpected_error")).toBeNull();
    expect(resolveAuthError("")).toBeNull();
  });
});

describe("resolveApiError (ApiError -> screen)", () => {
  it("sends a 401 to /login", () => {
    const error = new ApiError(401, "unauthenticated", "x");
    expect(resolveApiError(error)?.destination).toBe("/login");
  });

  it("sends any 401 to /login, whatever its code", () => {
    expect(resolveApiError(new ApiError(401, "unexpected_error", "x"))?.destination).toBe("/login");
  });

  it("sends a 403 mfa_required to /login/mfa", () => {
    expect(resolveApiError(new ApiError(403, "mfa_required", "x"))?.destination).toBe("/login/mfa");
  });

  it.each(["not_invited", "member_revoked", "email_not_verified"])("sends a 403 %s to /login with the notice", (code) => {
    expect(resolveApiError(new ApiError(403, code, "x"))?.destination).toBe(`/login?error=${code}`);
  });

  it("does not redirect a 403 about business authority", () => {
    expect(resolveApiError(new ApiError(403, "no_authority", "x"))).toBeNull();
  });

  it("does not redirect other statuses", () => {
    expect(resolveApiError(new ApiError(404, "not_found", "x"))).toBeNull();
    expect(resolveApiError(new ApiError(422, "incomplete_deliverable", "x"))).toBeNull();
    expect(resolveApiError(new ApiError(500, "unexpected_error", "x"))).toBeNull();
  });

  it("does not redirect network failures", () => {
    expect(resolveApiError(new ApiError(0, "network_error", "x"))).toBeNull();
  });

  it("does not trust a code on the wrong status (a 200-range style code on 403 only)", () => {
    expect(resolveApiError(new ApiError(500, "mfa_required", "x"))).toBeNull();
  });
});

describe("getLoginNotice (?error= on /login)", () => {
  it("explains a person who was not invited", () => {
    expect(getLoginNotice("not_invited")).toMatch(/No tienes invitación/);
  });

  it("explains a revoked access", () => {
    expect(getLoginNotice("member_revoked")).toMatch(/Tu acceso ha sido retirado/);
  });

  it("explains an unverified email", () => {
    expect(getLoginNotice("email_not_verified")).toMatch(/verific/i);
  });

  it("explains an expired or missing session", () => {
    expect(getLoginNotice("unauthenticated")).toMatch(/sesión/i);
  });

  it("returns null for no code", () => {
    expect(getLoginNotice(null)).toBeNull();
    expect(getLoginNotice(undefined)).toBeNull();
    expect(getLoginNotice("")).toBeNull();
  });

  it("ignores unknown codes instead of echoing them (no reflected text)", () => {
    expect(getLoginNotice("<script>alert(1)</script>")).toBeNull();
    expect(getLoginNotice("mfa_required")).toBeNull();
  });
});

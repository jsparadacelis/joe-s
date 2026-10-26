/**
 * RGB-2b · contract for `@/lib/auth-guard` (pure function used by `proxy.ts`):
 *   type GuardSession = { aal: "aal1" | "aal2"; nextAal?: "aal1" | "aal2"; role?: string | null } | null
 *   decideAccess({ mode: "dev" | "supabase", pathname: string, session: GuardSession }):
 *     { action: "allow" } | { action: "redirect"; to: "/login" | "/login/mfa" | "/" }
 *   requiresMfa(role: string | null | undefined): boolean   (partner, director, administration)
 *
 * Rules:
 *  - dev mode allows everything.
 *  - Public: /login, /login/mfa, /auth/callback (exact or with trailing slash / its own subpaths for callback),
 *    /_next/*, and any path whose last segment has a file extension (favicon.ico, logo.png, robots.txt).
 *  - "Needs MFA" = aal1 and (nextAal === "aal2" (factor enrolled) or the role requires it).
 *    A role of unknown/undefined never needs MFA on its own: the server decides (403 mfa_required).
 *  - Protected path: no session -> /login; needs MFA -> /login/mfa; otherwise allow.
 *  - /login: no session or needs MFA -> allow; complete session -> redirect "/".
 *  - /login/mfa: no session -> /login; needs MFA -> allow; complete session -> redirect "/".
 *  - /auth/callback and assets: always allow.
 */
import { decideAccess, requiresMfa, type GuardSession } from "@/lib/auth-guard";

const allow = { action: "allow" };
const to = (path: string) => ({ action: "redirect", to: path });

const complete: GuardSession = { aal: "aal2", role: "partner" };
const aal1Architect: GuardSession = { aal: "aal1", role: "architect" };

const guard = (pathname: string, session: GuardSession, mode: "dev" | "supabase" = "supabase") =>
  decideAccess({ mode, pathname, session });

describe("requiresMfa", () => {
  it.each(["partner", "director", "administration"])("is required for %s", (role) => {
    expect(requiresMfa(role)).toBe(true);
  });

  it.each(["project_director", "technical_lead", "architect", "site_collaborator"])("is not required for %s", (role) => {
    expect(requiresMfa(role)).toBe(false);
  });

  it("is not required for an unknown, null or missing role", () => {
    expect(requiresMfa("intern")).toBe(false);
    expect(requiresMfa(null)).toBe(false);
    expect(requiresMfa(undefined)).toBe(false);
  });
});

describe("decideAccess · dev mode", () => {
  it.each(["/", "/portfolio", "/projects/abc", "/login", "/login/mfa", "/auth/callback"])("allows %s without session", (path) => {
    expect(guard(path, null, "dev")).toEqual(allow);
  });

  it("allows a partner at aal1 in dev mode", () => {
    expect(guard("/portfolio", { aal: "aal1", role: "partner" }, "dev")).toEqual(allow);
  });
});

describe("decideAccess · protected routes", () => {
  it.each(["/", "/portfolio", "/projects", "/projects/abc-123/phases/2", "/settings"])("sends %s to /login without session", (path) => {
    expect(guard(path, null)).toEqual(to("/login"));
  });

  it("allows a complete session (aal2)", () => {
    expect(guard("/portfolio", complete)).toEqual(allow);
  });

  it("allows aal1 for a role that does not need the second factor", () => {
    expect(guard("/portfolio", aal1Architect)).toEqual(allow);
  });

  it.each(["partner", "director", "administration"])("sends %s at aal1 to /login/mfa", (role) => {
    expect(guard("/portfolio", { aal: "aal1", role })).toEqual(to("/login/mfa"));
  });

  it("sends an aal1 person with an enrolled factor (nextAal aal2) to /login/mfa even if the role is lax", () => {
    expect(guard("/portfolio", { aal: "aal1", nextAal: "aal2", role: "architect" })).toEqual(to("/login/mfa"));
  });

  it("allows aal1 when the role is not known yet: the server decides", () => {
    expect(guard("/portfolio", { aal: "aal1", role: null })).toEqual(allow);
    expect(guard("/portfolio", { aal: "aal1" })).toEqual(allow);
  });

  it("allows aal2 even when nextAal is aal2", () => {
    expect(guard("/portfolio", { aal: "aal2", nextAal: "aal2", role: "director" })).toEqual(allow);
  });

  it("does not let a lookalike path through as public", () => {
    expect(guard("/loginx", null)).toEqual(to("/login"));
    expect(guard("/login/mfa/extra", null)).toEqual(to("/login"));
    expect(guard("/login/other", null)).toEqual(to("/login"));
    expect(guard("/auth/callbackx", null)).toEqual(to("/login"));
    expect(guard("/auth", null)).toEqual(to("/login"));
    expect(guard("/projects/login", null)).toEqual(to("/login"));
  });

  it("does not treat a dot in a directory as an asset", () => {
    expect(guard("/projects/a.b/details", null)).toEqual(to("/login"));
  });
});

describe("decideAccess · public routes", () => {
  it("allows /login without session", () => {
    expect(guard("/login", null)).toEqual(allow);
  });

  it("allows /login with a trailing slash", () => {
    expect(guard("/login/", null)).toEqual(allow);
  });

  it("allows /login while the second factor is pending", () => {
    expect(guard("/login", { aal: "aal1", role: "partner" })).toEqual(allow);
  });

  it("sends a complete session away from /login to the app", () => {
    expect(guard("/login", complete)).toEqual(to("/"));
    expect(guard("/login", aal1Architect)).toEqual(to("/"));
  });

  it("allows /auth/callback in every state (it creates the session)", () => {
    expect(guard("/auth/callback", null)).toEqual(allow);
    expect(guard("/auth/callback", complete)).toEqual(allow);
    expect(guard("/auth/callback", { aal: "aal1", role: "partner" })).toEqual(allow);
  });

  it("sends /login/mfa without session to /login", () => {
    expect(guard("/login/mfa", null)).toEqual(to("/login"));
  });

  it("allows /login/mfa while the second factor is pending", () => {
    expect(guard("/login/mfa", { aal: "aal1", role: "director" })).toEqual(allow);
    expect(guard("/login/mfa", { aal: "aal1", nextAal: "aal2" })).toEqual(allow);
  });

  it("sends a complete session away from /login/mfa to the app", () => {
    expect(guard("/login/mfa", complete)).toEqual(to("/"));
  });

  it.each(["/_next/static/chunks/main.js", "/_next/image", "/favicon.ico", "/logo.png", "/robots.txt"])("allows the asset %s without session", (path) => {
    expect(guard(path, null)).toEqual(allow);
  });
});

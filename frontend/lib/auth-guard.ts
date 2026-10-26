import type { AuthMode } from "@/lib/auth";

/** RGB-2b · pure access decision used by `proxy.ts`. The API stays the authority; this only routes screens. */

export type GuardSession = { aal: "aal1" | "aal2"; nextAal?: "aal1" | "aal2"; role?: string | null } | null;
export type AccessDecision = { action: "allow" } | { action: "redirect"; to: "/login" | "/login/mfa" | "/" };

const MFA_ROLES = new Set(["partner", "director", "administration"]);

export function requiresMfa(role: string | null | undefined): boolean {
  return role != null && MFA_ROLES.has(role);
}

function isAsset(pathname: string): boolean {
  if (pathname === "/_next" || pathname.startsWith("/_next/")) return true;
  const last = pathname.split("/").pop() ?? "";
  return /\.[A-Za-z0-9]+$/.test(last);
}

function needsMfa(session: NonNullable<GuardSession>): boolean {
  return session.aal === "aal1" && (session.nextAal === "aal2" || requiresMfa(session.role));
}

export function decideAccess({ mode, pathname, session }: { mode: AuthMode; pathname: string; session: GuardSession }): AccessDecision {
  const allow: AccessDecision = { action: "allow" };
  const redirect = (to: "/login" | "/login/mfa" | "/"): AccessDecision => ({ action: "redirect", to });
  if (mode === "dev") return allow;

  const path = pathname.length > 1 ? pathname.replace(/\/+$/, "") : pathname;
  if (path === "/auth/callback" || path.startsWith("/auth/callback/") || isAsset(path)) return allow;

  const pending = session !== null && needsMfa(session);
  if (path === "/login") return session === null || pending ? allow : redirect("/");
  if (path === "/login/mfa") {
    if (session === null) return redirect("/login");
    return pending ? allow : redirect("/");
  }
  if (session === null) return redirect("/login");
  return pending ? redirect("/login/mfa") : allow;
}

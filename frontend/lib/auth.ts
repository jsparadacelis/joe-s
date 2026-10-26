import type { ApiError } from "@/lib/api";

/**
 * RGB-2b · access mode, access messages and the injectable slice of the Supabase client.
 * Pure: it does not import Supabase, so it is safe in the proxy, the server and the browser.
 */

export type AuthMode = "dev" | "supabase";
type Env = Record<string, string | undefined>;

/**
 * `NEXT_PUBLIC_*` variables are inlined by Next only when they are read literally, so the default
 * environment is built key by key instead of passing `process.env` around.
 */
function publicEnv(): Env {
  return {
    NEXT_PUBLIC_AUTH_MODE: process.env.NEXT_PUBLIC_AUTH_MODE,
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  };
}

export function getAuthMode(env: Env = publicEnv()): AuthMode {
  const value = env.NEXT_PUBLIC_AUTH_MODE?.trim();
  if (!value || value === "dev") return "dev";
  if (value === "supabase") return "supabase";
  throw new Error(`NEXT_PUBLIC_AUTH_MODE must be "dev" or "supabase" (got "${value}").`);
}

export function getSupabaseConfig(env: Env = publicEnv()): { url: string; anonKey: string } | null {
  if (getAuthMode(env) === "dev") return null;
  const url = env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const anonKey = env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
  if (!url) throw new Error("NEXT_PUBLIC_SUPABASE_URL is required when NEXT_PUBLIC_AUTH_MODE=supabase.");
  if (!anonKey) throw new Error("NEXT_PUBLIC_SUPABASE_ANON_KEY is required when NEXT_PUBLIC_AUTH_MODE=supabase.");
  return { url, anonKey };
}

const LOGIN_NOTICES: Record<string, string> = {
  not_invited: "No tienes invitación para entrar en RGB Proyectos. Pide a un socio que te invite con tu correo.",
  member_revoked: "Tu acceso ha sido retirado. Si crees que es un error, habla con un socio.",
  email_not_verified: "Tu correo no está verificado. Verifica el correo de tu cuenta de Google e inténtalo de nuevo.",
  unauthenticated: "Tu sesión no es válida o ha caducado. Entra de nuevo.",
};

const MFA_MESSAGE = "Hace falta el segundo factor para continuar.";

export function getLoginNotice(code: string | null | undefined): string | null {
  if (!code) return null;
  return Object.hasOwn(LOGIN_NOTICES, code) ? LOGIN_NOTICES[code] : null;
}

export type AuthRedirect = { destination: string; message: string };

export function resolveAuthError(code: string): AuthRedirect | null {
  if (code === "unauthenticated") return { destination: "/login", message: LOGIN_NOTICES.unauthenticated };
  if (code === "mfa_required") return { destination: "/login/mfa", message: MFA_MESSAGE };
  if (code === "not_invited" || code === "member_revoked" || code === "email_not_verified") {
    return { destination: `/login?error=${code}`, message: LOGIN_NOTICES[code] };
  }
  return null;
}

/** Maps an API error to the access screen it belongs to; `null` when it is not about access. */
export function resolveApiError(error: ApiError): AuthRedirect | null {
  if (error.status === 401) return resolveAuthError("unauthenticated");
  if (error.status === 403) return resolveAuthError(error.code);
  return null;
}

type AuthResult<T = unknown> = Promise<{ data: T; error: { code?: string; message?: string } | null }>;
type Factor = { id: string; factor_type?: string; status?: string };

/** The slice of the Supabase browser client the access components use (injectable in tests). */
export interface AuthClient {
  auth: {
    signInWithOAuth(credentials: { provider: "google"; options?: { redirectTo?: string } }): AuthResult<unknown>;
    signOut(): Promise<{ error: { code?: string; message?: string } | null }>;
    mfa: {
      listFactors(): AuthResult<{ all?: Factor[]; totp?: Factor[] } | null>;
      enroll(params: { factorType: "totp" }): AuthResult<{ id: string; totp: { qr_code: string; secret: string; uri?: string } } | null>;
      challenge(params: { factorId: string }): AuthResult<{ id: string } | null>;
      verify(params: { factorId: string; challengeId: string; code: string }): AuthResult<unknown>;
    };
  };
}

/** Cookie (a UX hint, never a permission) set when the API answered `mfa_required`; the proxy reads it. */
export const MFA_HINT_COOKIE = "rgb-mfa-required";

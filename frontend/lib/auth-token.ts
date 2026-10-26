import { getAuthMode } from "@/lib/auth";

type TokenProvider = () => Promise<string | null>;

// `next/headers` cannot be reachable from code that client components import (`lib/api.ts` is), so the
// server side registers its cookie reader here instead of being imported. A global symbol is used
// because the registering module (loaded by the root layout) and the pages may be separate bundles.
const SERVER_PROVIDER = Symbol.for("rgb.serverTokenProvider");
type WithProvider = { [SERVER_PROVIDER]?: TokenProvider };

export function registerServerTokenProvider(provider: TokenProvider): void {
  (globalThis as WithProvider)[SERVER_PROVIDER] = provider;
}

/**
 * Token for the default API client. Dev mode never touches Supabase. In supabase mode the server reads
 * the session from the request cookies (the proxy has already refreshed it) and the browser reads its own.
 */
export async function getSessionToken(): Promise<string | null> {
  if (getAuthMode() === "dev") return null;
  if (typeof window === "undefined") {
    const provider = (globalThis as WithProvider)[SERVER_PROVIDER];
    if (!provider) throw new Error("The server token provider is not registered (import @/lib/supabase/server-token in the root layout).");
    return provider();
  }
  const { getBrowserToken } = await import("@/lib/supabase/client");
  return getBrowserToken();
}

import { createBrowserClient } from "@supabase/ssr";
import { getSupabaseConfig, type AuthClient } from "@/lib/auth";

/** Browser Supabase client (session in cookies, so the server can read it). Only valid in supabase mode. */
export function createSupabaseBrowserClient() {
  const config = getSupabaseConfig();
  if (!config) throw new Error("The Supabase client is only available when NEXT_PUBLIC_AUTH_MODE=supabase.");
  return createBrowserClient(config.url, config.anonKey);
}

let shared: ReturnType<typeof createSupabaseBrowserClient> | null = null;

/** One client per tab: it owns the token refresh timer. */
export function getSupabaseBrowserClient() {
  shared ??= createSupabaseBrowserClient();
  return shared;
}

export function getAuthClient(): AuthClient {
  return getSupabaseBrowserClient() as unknown as AuthClient;
}

export async function getBrowserToken(): Promise<string | null> {
  const { data } = await getSupabaseBrowserClient().auth.getSession();
  return data.session?.access_token ?? null;
}

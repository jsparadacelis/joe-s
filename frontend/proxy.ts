import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { getAuthMode, getSupabaseConfig, MFA_HINT_COOKIE } from "@/lib/auth";
import { decideAccess, type GuardSession } from "@/lib/auth-guard";

/**
 * RGB-2b · Next 16 proxy (formerly middleware). In dev mode it lets everything through. In supabase
 * mode it refreshes the session cookies and delegates the redirect decision to `decideAccess`.
 * It only routes screens: the API verifies the token and the second factor on every call.
 */
export async function proxy(request: NextRequest) {
  const mode = getAuthMode();
  if (mode === "dev") return NextResponse.next();

  const config = getSupabaseConfig()!;
  let response = NextResponse.next({ request });
  const supabase = createServerClient(config.url, config.anonKey, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (cookiesToSet, headers) => {
        for (const { name, value } of cookiesToSet) request.cookies.set(name, value);
        response = NextResponse.next({ request });
        for (const { name, value, options } of cookiesToSet) response.cookies.set(name, value, options);
        for (const [key, value] of Object.entries(headers ?? {})) response.headers.set(key, value);
      },
    },
  });

  // Verifies the token (refreshing it when it is about to expire) before the page renders.
  const { data: claimsData } = await supabase.auth.getClaims();
  let session: GuardSession = null;
  if (claimsData?.claims) {
    const aal = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
    const hinted = request.cookies.get(MFA_HINT_COOKIE)?.value === "1";
    session = {
      aal: claimsData.claims.aal === "aal2" ? "aal2" : "aal1",
      nextAal: aal.data?.nextLevel === "aal2" || hinted ? "aal2" : "aal1",
    };
  }

  const decision = decideAccess({ mode, pathname: request.nextUrl.pathname, session });
  if (decision.action === "allow") return response;

  const redirect = NextResponse.redirect(new URL(decision.to, request.url));
  // Keep the refreshed cookies on the redirect too.
  for (const cookie of response.cookies.getAll()) redirect.cookies.set(cookie);
  return redirect;
}

export const config = {
  // Everything except Next internals and files with an extension (the guard also allows them).
  matcher: ["/((?!_next/static|_next/image|.*\\.[A-Za-z0-9]+$).*)"],
};

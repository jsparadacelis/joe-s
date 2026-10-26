import { NextResponse, type NextRequest } from "next/server";
import { getAuthMode } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/** Google sends the person back here with a one-time `code`; it is exchanged for the session cookies. */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  if (getAuthMode() === "dev") return NextResponse.redirect(new URL("/", origin));

  const code = searchParams.get("code");
  if (!code || searchParams.get("error")) return NextResponse.redirect(new URL("/login?error=unauthenticated", origin));

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) return NextResponse.redirect(new URL("/login?error=unauthenticated", origin));

  // The proxy sends the person on to /login/mfa when the second factor is pending.
  return NextResponse.redirect(new URL("/", origin));
}

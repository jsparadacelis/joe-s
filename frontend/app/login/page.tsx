import type { Metadata } from "next";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { LoginScreen } from "@/components/auth/LoginScreen";
import { getAuthMode } from "@/lib/auth";

export const metadata: Metadata = { title: "Entrar" };
export const dynamic = "force-dynamic";

export default async function Page({ searchParams }: { searchParams: Promise<{ error?: string | string[] }> }) {
  // Dev mode has no access screen.
  if (getAuthMode() === "dev") redirect("/");
  const { error } = await searchParams;
  const requestHeaders = await headers();
  const host = requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host") ?? "localhost:3000";
  const protocol = requestHeaders.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return <LoginScreen callbackUrl={`${protocol}://${host}/auth/callback`} error={Array.isArray(error) ? error[0] : error} />;
}

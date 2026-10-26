import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { MfaScreen } from "@/components/auth/MfaScreen";
import { getAuthMode } from "@/lib/auth";

export const metadata: Metadata = { title: "Verificación en dos pasos" };
export const dynamic = "force-dynamic";

export default function Page() {
  // Dev mode has no access screen.
  if (getAuthMode() === "dev") redirect("/");
  return <MfaScreen />;
}

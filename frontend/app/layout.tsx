import type { Metadata } from "next";
import { Inter, Newsreader } from "next/font/google";
import type { ReactNode } from "react";
import { AccountMenu } from "@/components/auth/AccountMenu";
import { AppShell } from "@/components/layout/AppShell";
import { getAuthMode } from "@/lib/auth";
import "@/lib/supabase/server-token";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" });
const newsreader = Newsreader({
  subsets: ["latin"],
  style: "italic",
  variable: "--font-newsreader",
  display: "swap",
});

export const metadata: Metadata = {
  title: { default: "RGB Proyectos", template: "%s · RGB Proyectos" },
  description: "Gestión de proyectos de RGB Arquitectos por fases-estado.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="es" className={`${inter.variable} ${newsreader.variable}`}>
      <body>
        <AppShell account={getAuthMode() === "supabase" ? <AccountMenu /> : undefined}>{children}</AppShell>
      </body>
    </html>
  );
}

"use client";

import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { Sidebar } from "./Sidebar";
import { Topbar } from "./Topbar";

/** Access screens are shown without the application chrome (sidebar and header). */
const ACCESS_PATHS = new Set(["/login", "/login/mfa"]);

export function AppShell({ children, account }: { children: ReactNode; account?: ReactNode }) {
  const pathname = usePathname() ?? "";
  const bare = ACCESS_PATHS.has(pathname.length > 1 ? pathname.replace(/\/+$/, "") : pathname);

  if (bare) {
    return (
      <main id="content" className="flex min-h-screen flex-col px-7 py-6">
        {children}
      </main>
    );
  }

  return (
    <div className="flex min-h-screen">
      <a
        href="#content"
        className="sr-only focus:not-sr-only focus:fixed focus:left-2 focus:top-2 focus:z-10 focus:rounded-base focus:bg-surface focus:px-3 focus:py-2"
      >
        Saltar al contenido
      </a>
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar account={account} />
        <main id="content" className="flex flex-col gap-5 px-7 py-6">
          {children}
        </main>
      </div>
    </div>
  );
}

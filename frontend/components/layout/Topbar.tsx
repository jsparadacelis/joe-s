"use client";

import { usePathname } from "next/navigation";
import { findNavItem } from "@/lib/nav";

export function Topbar() {
  const pathname = usePathname();
  const current = findNavItem(pathname);

  return (
    <header className="sticky top-0 z-5 flex items-center justify-between gap-4 border-b border-hair bg-bg px-7 py-3.5">
      <nav aria-label="Migas de pan">
        <ol className="flex items-center gap-2 text-s text-muted">
          <li>RGB Proyectos</li>
          {current ? (
            <li className="flex items-center gap-2">
              <span aria-hidden="true">/</span>
              <span aria-current="page" className="font-medium text-ink">
                {current.label}
              </span>
            </li>
          ) : null}
        </ol>
      </nav>
    </header>
  );
}

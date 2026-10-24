"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { NAV_ITEMS } from "@/lib/nav";

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="sticky top-0 flex h-screen w-side flex-none flex-col gap-6 bg-side px-4 py-5 text-side-ink">
      <div className="px-2.5 text-l font-semibold">
        RGB <span className="font-serif font-normal italic">Proyectos</span>
      </div>
      <nav aria-label="Principal">
        <ul className="flex flex-col gap-0.5">
          {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
            const active = pathname === href || pathname.startsWith(`${href}/`);
            return (
              <li key={href}>
                <Link
                  href={href}
                  aria-current={active ? "page" : undefined}
                  className={`flex items-center gap-2.5 rounded-base px-2.5 py-[9px] text-m outline-focus-on-side hover:bg-side-active ${
                    active ? "bg-side-active font-medium" : ""
                  }`}
                >
                  <Icon aria-hidden="true" size={16} />
                  {label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </aside>
  );
}

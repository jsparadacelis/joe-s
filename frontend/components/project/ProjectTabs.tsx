"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { PhaseId } from "@/lib/phases";

export type ProjectTabsProps = {
  code: string;
  currentPhase: PhaseId;
};

export function ProjectTabs({ code, currentPhase }: ProjectTabsProps) {
  const path = usePathname() ?? "";
  const base = `/projects/${code}`;
  const tabs = [
    { text: "Fase y promoción", href: `${base}/phase/${currentPhase}`, active: path.startsWith(`${base}/phase/`) },
    { text: "Plan y tiempos", href: `${base}/plan-and-timing`, active: path === `${base}/plan-and-timing` },
    { text: "Equipo", href: `${base}/team`, active: path === `${base}/team` },
  ];
  return (
    <nav aria-label="Secciones del proyecto">
      <ul className="flex gap-1 border-b border-hair">
        {tabs.map(({ text, href, active }) => (
          <li key={href}>
            <Link
              href={href}
              aria-current={active ? "page" : undefined}
              className={`-mb-px block rounded-t-base border-b px-3.5 py-2 text-m font-medium ${
                active ? "border-point bg-surface-2 text-ink" : "border-hair text-muted"
              }`}
            >
              {text}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}

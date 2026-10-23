"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { FaseId } from "@/lib/fases";

export type ProyectoTabsProps = {
  codigo: string;
  faseActual: FaseId;
};

export function ProyectoTabs({ codigo, faseActual }: ProyectoTabsProps) {
  const ruta = usePathname() ?? "";
  const base = `/proyectos/${codigo}`;
  const pestanas = [
    { texto: "Fase y promoción", href: `${base}/fase/${faseActual}`, activa: ruta.startsWith(`${base}/fase/`) },
    { texto: "Plan y tiempos", href: `${base}/plan-y-tiempos`, activa: ruta === `${base}/plan-y-tiempos` },
  ];
  return (
    <nav aria-label="Secciones del proyecto">
      <ul className="flex gap-1 border-b border-hair">
        {pestanas.map(({ texto, href, activa }) => (
          <li key={href}>
            <Link
              href={href}
              aria-current={activa ? "page" : undefined}
              className={`-mb-px block rounded-t-base border-b px-3.5 py-2 text-m font-medium ${
                activa ? "border-point bg-surface-2 text-ink" : "border-hair text-muted"
              }`}
            >
              {texto}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}

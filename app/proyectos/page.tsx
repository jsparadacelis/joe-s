import type { Metadata } from "next";
import Link from "next/link";
import { PageHead } from "@/components/layout/PageHead";
import { Panel } from "@/components/ui/Panel";
import { EmptyState } from "@/components/layout/EmptyState";
import { PHASES } from "@/lib/phases";
import { listProjects } from "@/lib/projects";

export const metadata: Metadata = { title: "Proyectos" };

export default async function Page() {
  const projects = await listProjects();
  return (
    <>
      <PageHead title="Proyectos" description="Listado de todos los proyectos y su fase actual." />
      {projects.length === 0 ? (
        <EmptyState title="Aún no hay proyectos" description="Los proyectos se mostrarán aquí cuando existan." />
      ) : (
        <Panel title="Proyectos de ejemplo" description="Datos ficticios para navegar por las fases.">
          <ul className="flex flex-col">
            {projects.map((p) => (
              <li key={p.code} className="border-b border-hair">
                <Link
                  href={`/proyectos/${p.code}/fase/${p.currentPhase}`}
                  className="flex items-center justify-between gap-4 py-3 text-m"
                >
                  <span>
                    <span className="font-semibold">{p.code}</span> · {p.name}
                  </span>
                  <span className="text-s text-muted">
                    Fase {p.currentPhase} · {PHASES[p.currentPhase].name}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </Panel>
      )}
    </>
  );
}

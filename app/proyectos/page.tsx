import type { Metadata } from "next";
import Link from "next/link";
import { PageHead } from "@/components/layout/PageHead";
import { Panel } from "@/components/ui/Panel";
import { EmptyState } from "@/components/layout/EmptyState";
import { FASES } from "@/lib/fases";
import { listarProyectos } from "@/lib/proyectos";

export const metadata: Metadata = { title: "Proyectos" };

export default async function Page() {
  const proyectos = await listarProyectos();
  return (
    <>
      <PageHead title="Proyectos" description="Listado de todos los proyectos y su fase actual." />
      {proyectos.length === 0 ? (
        <EmptyState title="Aún no hay proyectos" description="Los proyectos se mostrarán aquí cuando existan." />
      ) : (
        <Panel title="Proyectos de ejemplo" description="Datos ficticios para navegar por las fases.">
          <ul className="flex flex-col">
            {proyectos.map((p) => (
              <li key={p.codigo} className="border-b border-hair">
                <Link
                  href={`/proyectos/${p.codigo}/fase/${p.faseActual}`}
                  className="flex items-center justify-between gap-4 py-3 text-m"
                >
                  <span>
                    <span className="font-semibold">{p.codigo}</span> · {p.nombre}
                  </span>
                  <span className="text-s text-muted">
                    Fase {p.faseActual} · {FASES[p.faseActual].nombre}
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

import Link from "next/link";
import { FASES, estadoFase, type EstadoFase, type FaseId } from "@/lib/fases";

export type PhaseTimelineProps = {
  codigo: string;
  faseActual: FaseId;
  /** Fase que se está mostrando en pantalla. */
  faseVista: FaseId;
};

const ESTILOS: Record<EstadoFase, string> = {
  hecha: "bg-ok-soft text-ok",
  actual: "bg-point text-on-point",
  vista: "bg-surface-2 text-muted",
};

export function PhaseTimeline({ codigo, faseActual, faseVista }: PhaseTimelineProps) {
  return (
    <nav aria-label="Fases del proyecto">
      <ol className="grid grid-cols-8 gap-1.5">
        {FASES.map((fase) => {
          const estado = estadoFase(fase.id, faseActual);
          const enPantalla = fase.id === faseVista;
          return (
            <li key={fase.id} className="min-w-0">
              <Link
                href={`/proyectos/${codigo}/fase/${fase.id}`}
                aria-current={enPantalla ? "page" : undefined}
                className={`flex h-full flex-col gap-0.5 rounded-base px-2.5 py-2 ${ESTILOS[estado]} ${
                  enPantalla ? "ring-2 ring-ink" : ""
                }`}
              >
                <span className="text-xs font-semibold">{fase.id}</span>{" "}
                <span className="text-s font-medium">{fase.nombre}</span>{" "}
                <span className="text-xs">{estado}</span>
              </Link>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

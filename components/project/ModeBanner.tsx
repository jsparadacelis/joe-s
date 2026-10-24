import Link from "next/link";
import { Notice } from "@/components/ui/Notice";
import { modoFase, type PhaseId } from "@/lib/phases";

export type ModeBannerProps = {
  code: string;
  currentPhase: PhaseId;
  viewedPhase: PhaseId;
};

export function ModeBanner({ code, currentPhase, viewedPhase }: ModeBannerProps) {
  const mode = modoFase(viewedPhase, currentPhase);
  if (mode === "edit") return null;

  const message =
    mode === "read-only" ? "Fase cerrada · versión congelada" : "Vista previa: nada se guarda en esta fase";

  return (
    <Notice tone={mode === "read-only" ? "info" : "warn"}>
      <div className="flex items-center justify-between gap-4">
        <span>{message}</span>
        <Link href={`/proyectos/${code}/fase/${currentPhase}`} className="font-medium underline">
          Volver a la fase actual
        </Link>
      </div>
    </Notice>
  );
}

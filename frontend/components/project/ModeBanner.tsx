import Link from "next/link";
import { Notice } from "@/components/ui/Notice";
import { phaseMode, type PhaseId } from "@/lib/phases";

export type ModeBannerProps = {
  code: string;
  currentPhase: PhaseId;
  viewedPhase: PhaseId;
};

export function ModeBanner({ code, currentPhase, viewedPhase }: ModeBannerProps) {
  const mode = phaseMode(viewedPhase, currentPhase);
  if (mode === "edit") return null;

  const message =
    mode === "read-only" ? "Fase cerrada · versión congelada" : "Vista previa: nada se guarda en esta fase";

  return (
    <Notice tone={mode === "read-only" ? "info" : "warn"}>
      <div className="flex items-center justify-between gap-4">
        <span>{message}</span>
        <Link href={`/projects/${code}/phase/${currentPhase}`} className="font-medium underline">
          Volver a la fase actual
        </Link>
      </div>
    </Notice>
  );
}

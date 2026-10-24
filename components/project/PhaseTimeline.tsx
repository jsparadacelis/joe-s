import Link from "next/link";
import { PHASES, phaseState, type PhaseState, type PhaseId } from "@/lib/phases";

export type PhaseTimelineProps = {
  code: string;
  currentPhase: PhaseId;
  /** Fase que se está mostrando en pantalla. */
  viewedPhase: PhaseId;
};

const STATE_TEXT: Record<PhaseState, string> = { done: "hecha", current: "actual", upcoming: "vista" };

const STYLES: Record<PhaseState, string> = {
  done: "bg-ok-soft text-ok",
  current: "bg-point text-on-point",
  upcoming: "bg-surface-2 text-muted",
};

export function PhaseTimeline({ code, currentPhase, viewedPhase }: PhaseTimelineProps) {
  return (
    <nav aria-label="Fases del proyecto">
      <ol className="grid grid-cols-8 gap-1.5">
        {PHASES.map((phase) => {
          const state = phaseState(phase.id, currentPhase);
          const onScreen = phase.id === viewedPhase;
          return (
            <li key={phase.id} className="min-w-0">
              <Link
                href={`/proyectos/${code}/fase/${phase.id}`}
                aria-current={onScreen ? "page" : undefined}
                className={`flex h-full flex-col gap-0.5 rounded-base px-2.5 py-2 ${STYLES[state]} ${
                  onScreen ? "ring-2 ring-ink" : ""
                }`}
              >
                <span className="text-xs font-semibold">{phase.id}</span>{" "}
                <span className="text-s font-medium">{phase.name}</span>{" "}
                <span className="text-xs">{STATE_TEXT[state]}</span>
              </Link>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

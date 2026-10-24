import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { EmptyState } from "@/components/layout/EmptyState";
import { PageHead } from "@/components/layout/PageHead";
import { Panel } from "@/components/ui/Panel";
import { Notice } from "@/components/ui/Notice";
import { PauseManager } from "@/components/timing/PauseManager";
import { PauseHistory } from "@/components/timing/PauseHistory";
import { TimingSummary } from "@/components/timing/TimingSummary";
import { TimingTable } from "@/components/timing/TimingTable";
import { ApiError } from "@/lib/api";
import { fetchPauses, type ProjectPauses } from "@/lib/pauses";
import { fetchProject, isSampleProject } from "@/lib/projects";
import { fetchTimingPlan } from "@/lib/timing";

type Props = { params: Promise<{ code: string }> };

export const metadata: Metadata = { title: "Plan y tiempos" };

export default async function Page({ params }: Props) {
  const { code } = await params;
  const project = await fetchProject(code);
  if (!project) notFound();
  const plan = await fetchTimingPlan(project.code);

  // RGB-21: a real project (not a PRY-EJ sample) past phase 0 has no plan weeks yet (RGB-16) but it can be paused.
  if (!plan && !isSampleProject(project.code) && project.currentPhase > 0) {
    let pauses: ProjectPauses | null = null;
    let loadError: string | null = null;
    try {
      pauses = await fetchPauses(project.code);
    } catch (error) {
      loadError = error instanceof ApiError ? error.message : "No se pudieron cargar las pausas. Inténtalo de nuevo.";
    }
    return (
      <>
        <PageHead title={project.name} description={`${project.code} · Plan y tiempos`} />
        <Panel title="Semanas del plan" description="El plan base de semanas todavía no está confirmado.">
          <p className="text-m text-muted">Sin calcular</p>
        </Panel>
        {pauses ? <PauseManager code={project.code} initial={pauses} /> : null}
        {loadError ? <Notice tone="bad">{loadError}</Notice> : null}
      </>
    );
  }

  return (
    <>
      <PageHead title={project.name} description={`${project.code} · Plan y tiempos`} />
      {plan ? (
        <>
          <TimingSummary plan={plan} />
          <Panel title="Consumo por fase" description="Semanas activas frente al plan de cada fase.">
            <TimingTable phases={plan.phases} currentPhase={plan.currentPhase} />
          </Panel>
          <Panel title="Historial de pausas">
            <PauseHistory pauses={plan.pauses} />
          </Panel>
        </>
      ) : (
        <EmptyState title="Sin plan hasta promover" description="El plan de semanas se genera al promover el proyecto desde la fase 0." />
      )}
    </>
  );
}

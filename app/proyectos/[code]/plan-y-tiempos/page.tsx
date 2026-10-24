import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { EmptyState } from "@/components/layout/EmptyState";
import { PageHead } from "@/components/layout/PageHead";
import { Panel } from "@/components/ui/Panel";
import { PauseHistory } from "@/components/timing/PauseHistory";
import { TimingSummary } from "@/components/timing/TimingSummary";
import { TimingTable } from "@/components/timing/TimingTable";
import { fetchProject } from "@/lib/projects";
import { fetchTimingPlan } from "@/lib/timing";

type Props = { params: Promise<{ code: string }> };

export const metadata: Metadata = { title: "Plan y tiempos" };

export default async function Page({ params }: Props) {
  const { code } = await params;
  const proyecto = await fetchProject(code);
  if (!proyecto) notFound();
  const plan = await fetchTimingPlan(proyecto.code);

  return (
    <>
      <PageHead title={proyecto.name} description={`${proyecto.code} · Plan y tiempos`} />
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

import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { EmptyState } from "@/components/layout/EmptyState";
import { PageHead } from "@/components/layout/PageHead";
import { Panel } from "@/components/ui/Panel";
import { HistorialPausas } from "@/components/tiempos/HistorialPausas";
import { ResumenTiempos } from "@/components/tiempos/ResumenTiempos";
import { TablaTiempos } from "@/components/tiempos/TablaTiempos";
import { obtenerProyecto } from "@/lib/proyectos";
import { obtenerPlanTiempos } from "@/lib/tiempos";

type Props = { params: Promise<{ codigo: string }> };

export const metadata: Metadata = { title: "Plan y tiempos" };

export default async function Page({ params }: Props) {
  const { codigo } = await params;
  const proyecto = await obtenerProyecto(codigo);
  if (!proyecto) notFound();
  const plan = await obtenerPlanTiempos(proyecto.codigo);

  return (
    <>
      <PageHead title={proyecto.nombre} description={`${proyecto.codigo} · Plan y tiempos`} />
      {plan ? (
        <>
          <ResumenTiempos plan={plan} />
          <Panel title="Consumo por fase" description="Semanas activas frente al plan de cada fase.">
            <TablaTiempos fases={plan.fases} faseActual={plan.faseActual} />
          </Panel>
          <Panel title="Historial de pausas">
            <HistorialPausas pausas={plan.pausas} />
          </Panel>
        </>
      ) : (
        <EmptyState title="Sin plan hasta promover" description="El plan de semanas se genera al promover el proyecto desde la fase 0." />
      )}
    </>
  );
}

import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PageHead } from "@/components/layout/PageHead";
import { Panel } from "@/components/ui/Panel";
import { FaseEntregable } from "@/components/proyecto/FaseEntregable";
import { ModoBanner } from "@/components/proyecto/ModoBanner";
import { PhaseTimeline } from "@/components/proyecto/PhaseTimeline";
import { FASES, modoFase, parseFaseId } from "@/lib/fases";
import { obtenerEntregable, obtenerProyecto } from "@/lib/proyectos";

type Props = { params: Promise<{ codigo: string; fase: string }> };

export const metadata: Metadata = { title: "Fase del proyecto" };

export default async function Page({ params }: Props) {
  const { codigo, fase: faseRaw } = await params;
  const faseVista = parseFaseId(faseRaw);
  if (faseVista === null) notFound();
  const proyecto = await obtenerProyecto(codigo);
  if (!proyecto) notFound();

  const entregable = await obtenerEntregable(proyecto.codigo, faseVista);
  const fase = FASES[faseVista];
  const { faseActual } = proyecto;

  return (
    <>
      <PageHead title={proyecto.nombre} description={`${proyecto.codigo} · Fase ${fase.id}: ${fase.nombre}`} />
      <PhaseTimeline codigo={proyecto.codigo} faseActual={faseActual} faseVista={faseVista} />
      <ModoBanner codigo={proyecto.codigo} faseActual={faseActual} faseVista={faseVista} />
      <Panel title={`Entregable · ${fase.nombre}`} description={`${fase.entregable}. Autoridad para promover: ${fase.promueve}.`}>
        <FaseEntregable entregable={entregable} modo={modoFase(faseVista, faseActual)} />
      </Panel>
    </>
  );
}

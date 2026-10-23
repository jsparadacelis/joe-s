import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PageHead } from "@/components/layout/PageHead";
import { Panel } from "@/components/ui/Panel";
import { FaseEntregable } from "@/components/proyecto/FaseEntregable";
import { ModoBanner } from "@/components/proyecto/ModoBanner";
import { PhaseTimeline } from "@/components/proyecto/PhaseTimeline";
import { DatosTecnicosEditor } from "@/components/proyecto/datos-tecnicos/DatosTecnicosEditor";
import { obtenerDatosTecnicosGuardados } from "@/lib/datos-tecnicos";
import { FASES, modoFase, parseFaseId } from "@/lib/fases";
import { obtenerEntregable, obtenerProyecto, obtenerReferenciaCatastral } from "@/lib/proyectos";

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
  const modo = modoFase(faseVista, faseActual);
  // Los datos técnicos se revisan en Briefing (fase 2).
  const [guardados, referenciaFicha] =
    faseVista === 2
      ? await Promise.all([obtenerDatosTecnicosGuardados(proyecto.codigo), obtenerReferenciaCatastral(proyecto.codigo)])
      : [null, ""];

  return (
    <>
      <PageHead title={proyecto.nombre} description={`${proyecto.codigo} · Fase ${fase.id}: ${fase.nombre}`} />
      <PhaseTimeline codigo={proyecto.codigo} faseActual={faseActual} faseVista={faseVista} />
      <ModoBanner codigo={proyecto.codigo} faseActual={faseActual} faseVista={faseVista} />
      <Panel title={`Entregable · ${fase.nombre}`} description={`${fase.entregable}. Autoridad para promover: ${fase.promueve}.`}>
        <FaseEntregable entregable={entregable} modo={modo} />
      </Panel>
      {faseVista === 2 ? (
        <DatosTecnicosEditor
          referenciaCatastral={guardados?.referenciaCatastral ?? referenciaFicha}
          inicial={guardados}
          modo={modo}
        />
      ) : null}
    </>
  );
}

import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PageHead } from "@/components/layout/PageHead";
import { Panel } from "@/components/ui/Panel";
import { PhaseDeliverableForm } from "@/components/project/PhaseDeliverableForm";
import { ModeBanner } from "@/components/project/ModeBanner";
import { PhaseTimeline } from "@/components/project/PhaseTimeline";
import { ReliefViewer } from "@/components/project/relief/ReliefViewer";
import { TechnicalDataEditor } from "@/components/project/technical-data/TechnicalDataEditor";
import { fetchSavedTechnicalData } from "@/lib/technical-data";
import { PHASES, phaseMode, parsePhaseId } from "@/lib/phases";
import { fetchDeliverable, fetchProject, fetchCadastralReference } from "@/lib/projects";

type Props = { params: Promise<{ code: string; phase: string }> };

export const metadata: Metadata = { title: "Fase del proyecto" };

export default async function Page({ params }: Props) {
  const { code, phase: rawPhase } = await params;
  const viewedPhase = parsePhaseId(rawPhase);
  if (viewedPhase === null) notFound();
  const project = await fetchProject(code);
  if (!project) notFound();

  const deliverable = await fetchDeliverable(project.code, viewedPhase);
  const phase = PHASES[viewedPhase];
  const { currentPhase } = project;
  const mode = phaseMode(viewedPhase, currentPhase);
  // Technical data are reviewed in Briefing (phase 2); the relief is queried in Anteproyecto (phase 3).
  const [saved, sheetReference] =
    viewedPhase === 2
      ? await Promise.all([fetchSavedTechnicalData(project.code), fetchCadastralReference(project.code)])
      : viewedPhase === 3
        ? [null, await fetchCadastralReference(project.code)]
        : [null, ""];

  return (
    <>
      <PageHead title={project.name} description={`${project.code} · Fase ${phase.id}: ${phase.name}`} />
      <PhaseTimeline code={project.code} currentPhase={currentPhase} viewedPhase={viewedPhase} />
      <ModeBanner code={project.code} currentPhase={currentPhase} viewedPhase={viewedPhase} />
      <Panel title={`Entregable · ${phase.name}`} description={`${phase.deliverable}. Autoridad para promover: ${phase.promoter}.`}>
        <PhaseDeliverableForm deliverable={deliverable} mode={mode} />
      </Panel>
      {viewedPhase === 2 ? (
        <TechnicalDataEditor
          cadastralReference={saved?.cadastralReference ?? sheetReference}
          initial={saved}
          mode={mode}
        />
      ) : null}
      {viewedPhase === 3 ? <ReliefViewer initialReference={sheetReference} /> : null}
    </>
  );
}

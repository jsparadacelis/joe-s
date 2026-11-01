import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ButtonLink } from "@/components/ui/ButtonLink";
import { PageHead } from "@/components/layout/PageHead";
import { Panel } from "@/components/ui/Panel";
import { PhaseDeliverableForm } from "@/components/project/PhaseDeliverableForm";
import { ModeBanner } from "@/components/project/ModeBanner";
import { PhaseTimeline } from "@/components/project/PhaseTimeline";
import { ReliefViewer } from "@/components/project/relief/ReliefViewer";
import { TechnicalDataEditor } from "@/components/project/technical-data/TechnicalDataEditor";
import { BriefScreen } from "@/components/project/brief/BriefScreen";
import { ProjectSheet } from "@/components/project/sheet/ProjectSheet";
import { Notice } from "@/components/ui/Notice";
import { ApiError } from "@/lib/api";
import { getBrief, type Brief } from "@/lib/brief";
import { fetchProjectSheet, type ProjectSheet as ProjectSheetModel } from "@/lib/sheet";
import { fetchSavedTechnicalData } from "@/lib/technical-data";
import { PHASES, phaseMode, parsePhaseId } from "@/lib/phases";
import { fetchDeliverable, fetchProject, fetchCadastralReference, isSampleProject } from "@/lib/projects";

type Props = { params: Promise<{ code: string; phase: string }> };

export const metadata: Metadata = { title: "Fase del proyecto" };

type SheetState = { sheet: ProjectSheetModel } | { empty: true } | { error: string };

/** The sheet never takes the page down: no sheet yet (404 `sheet_not_found`) and API failures become messages. */
async function loadSheet(code: string): Promise<SheetState> {
  try {
    return { sheet: await fetchProjectSheet(code) };
  } catch (error) {
    if (!(error instanceof ApiError)) throw error;
    if (error.status === 404 && error.code === "sheet_not_found") return { empty: true };
    return { error: error.message };
  }
}

type BriefState = { brief: Brief } | { empty: true } | { error: string };

/** The brief never takes the page down: no brief yet (404 `brief_not_found`) and API failures become messages. */
async function loadBrief(code: string): Promise<BriefState> {
  try {
    return { brief: await getBrief(code) };
  } catch (error) {
    if (!(error instanceof ApiError)) throw error;
    if (error.status === 404 && error.code === "brief_not_found") return { empty: true };
    return { error: error.message };
  }
}

export default async function Page({ params }: Props) {
  const { code, phase: rawPhase } = await params;
  const viewedPhase = parsePhaseId(rawPhase);
  if (viewedPhase === null) notFound();
  const project = await fetchProject(code);
  if (!project) notFound();

  const deliverable = await fetchDeliverable(project.code, viewedPhase);
  const phase = PHASES[viewedPhase];
  const { currentPhase } = project;
  // RGB-14: a real opportunity (phase 0) can be scored; the samples have no scoring API.
  const canScore = viewedPhase === 0 && currentPhase === 0 && !isSampleProject(project.code);
  const mode = phaseMode(viewedPhase, currentPhase);
  // Technical data are reviewed in Briefing (phase 2); the relief is queried in Anteproyecto (phase 3).
  const sheetReference = viewedPhase === 2 || viewedPhase === 3 ? await fetchCadastralReference(project.code) : "";
  // RGB-51: a real project's technical data are loaded by the editor from the API (in the browser, with the person's
  // session); only the fictitious samples are resolved here, from their local data.
  const savedSample = viewedPhase === 2 && isSampleProject(project.code) ? await fetchSavedTechnicalData(project.code) : undefined;

  // RGB-17a: the sheet belongs to phase 1 and only exists for real projects; no sheet yet is not an error.
  const sheetState = viewedPhase === 1 && !isSampleProject(project.code) ? await loadSheet(project.code) : undefined;

  // RGB-32b: the brief belongs to phase 2 and only exists for real projects; no brief yet is not an error.
  const briefState = viewedPhase === 2 && !isSampleProject(project.code) ? await loadBrief(project.code) : undefined;

  return (
    <>
      <PageHead
        title={project.name}
        description={`${project.code} · Fase ${phase.id}: ${phase.name}`}
        actions={
          canScore ? (
            <ButtonLink variant="primary" href={`/projects/${project.code}/scoring`}>
              Puntuar oportunidad
            </ButtonLink>
          ) : undefined
        }
      />
      <PhaseTimeline code={project.code} currentPhase={currentPhase} viewedPhase={viewedPhase} />
      <ModeBanner code={project.code} currentPhase={currentPhase} viewedPhase={viewedPhase} />
      <Panel title={`Entregable · ${phase.name}`} description={`${phase.deliverable}. Autoridad para promover: ${phase.promoter}.`}>
        <PhaseDeliverableForm deliverable={deliverable} mode={mode} />
      </Panel>
      {sheetState && "sheet" in sheetState ? <ProjectSheet sheet={sheetState.sheet} /> : null}
      {sheetState && "empty" in sheetState ? <Notice>Todavía no hay ficha para este proyecto.</Notice> : null}
      {sheetState && "error" in sheetState ? <Notice tone="bad">No se pudo cargar la ficha del proyecto. {sheetState.error}</Notice> : null}
      {viewedPhase === 2 ? (
        <TechnicalDataEditor
          projectCode={project.code}
          cadastralReference={savedSample?.cadastralReference ?? sheetReference}
          initial={isSampleProject(project.code) ? savedSample : undefined}
          mode={mode}
        />
      ) : null}
      {briefState && "brief" in briefState ? <BriefScreen brief={briefState.brief} /> : null}
      {briefState && "empty" in briefState ? <Notice>Todavía no hay brief para este proyecto.</Notice> : null}
      {briefState && "error" in briefState ? <Notice tone="bad">No se pudo cargar el brief. {briefState.error}</Notice> : null}
      {viewedPhase === 3 ? <ReliefViewer initialReference={sheetReference} /> : null}
    </>
  );
}

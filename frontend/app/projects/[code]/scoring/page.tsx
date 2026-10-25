import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { EmptyState } from "@/components/layout/EmptyState";
import { PageHead } from "@/components/layout/PageHead";
import { ScoringHistory } from "@/components/scoring/ScoringHistory";
import { ScoringForm } from "@/components/scoring/ScoringForm";
import { StartPanel } from "@/components/scoring/StartPanel";
import { Notice } from "@/components/ui/Notice";
import { ApiError } from "@/lib/api";
import { fetchProject, isSampleProject } from "@/lib/projects";
import { fetchScoring, fetchScoringSettings, type Scoring, type ScoringSettings } from "@/lib/scoring";

type Props = { params: Promise<{ code: string }> };

export const metadata: Metadata = { title: "Scoring de la oportunidad" };

const UNEXPECTED_MESSAGE = "Ocurrió un error inesperado. Inténtalo de nuevo.";

export default async function Page({ params }: Props) {
  const { code } = await params;
  const project = await fetchProject(code);
  if (!project) notFound();
  const head = <PageHead title={project.name} description={`${project.code} · Scoring de la oportunidad`} />;

  // The sample projects (PRY-EJ-00N) live in the front end only: there is no scoring API behind them.
  if (isSampleProject(project.code)) {
    return (
      <>
        {head}
        <EmptyState title="Sin API" description="Los proyectos de ejemplo no se puntúan: solo las oportunidades reales." />
      </>
    );
  }

  let settings: ScoringSettings;
  let scoring: Scoring | null;
  try {
    [settings, scoring] = await Promise.all([fetchScoringSettings(), fetchScoring(project.code)]);
  } catch (error) {
    return (
      <>
        {head}
        <Notice tone="bad">{error instanceof ApiError ? error.message : UNEXPECTED_MESSAGE}</Notice>
      </>
    );
  }

  // Only an opportunity (phase 0) can be scored; what it already has stays readable.
  if (project.currentPhase > 0) {
    return (
      <>
        {head}
        <Notice tone="info">Solo se puede puntuar una oportunidad (fase 0).</Notice>
        {scoring ? <ScoringHistory history={scoring.history} /> : null}
      </>
    );
  }

  return (
    <>
      {head}
      <ScoringForm code={project.code} settings={settings} initial={scoring} />
      {project.projectType ? <StartPanel code={project.code} projectType={project.projectType} /> : null}
    </>
  );
}

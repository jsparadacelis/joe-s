import type { ReactNode } from "react";
import { notFound } from "next/navigation";
import { ProjectTabs } from "@/components/project/ProjectTabs";
import { fetchProject } from "@/lib/projects";

type Props = { params: Promise<{ code: string }>; children: ReactNode };

export default async function Layout({ params, children }: Props) {
  const { code } = await params;
  const proyecto = await fetchProject(code);
  if (!proyecto) notFound();
  // Fragmento: el `main` del shell ya aplica el espaciado entre bloques.
  return (
    <>
      <ProjectTabs code={proyecto.code} currentPhase={proyecto.currentPhase} />
      {children}
    </>
  );
}

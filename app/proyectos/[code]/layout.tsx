import type { ReactNode } from "react";
import { notFound } from "next/navigation";
import { ProjectTabs } from "@/components/project/ProjectTabs";
import { fetchProject } from "@/lib/projects";

type Props = { params: Promise<{ code: string }>; children: ReactNode };

export default async function Layout({ params, children }: Props) {
  const { code } = await params;
  const project = await fetchProject(code);
  if (!project) notFound();
  // Fragment: the shell's `main` already applies the spacing between blocks.
  return (
    <>
      <ProjectTabs code={project.code} currentPhase={project.currentPhase} />
      {children}
    </>
  );
}

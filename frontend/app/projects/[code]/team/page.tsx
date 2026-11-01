import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PageHead } from "@/components/layout/PageHead";
import { ProjectTeamEditor } from "@/components/project/ProjectTeamEditor";
import { fetchProject } from "@/lib/projects";

type Props = { params: Promise<{ code: string }> };

export const metadata: Metadata = { title: "Equipo del proyecto" };

export default async function Page({ params }: Props) {
  const { code } = await params;
  const project = await fetchProject(code);
  if (!project) notFound();
  return (
    <>
      <PageHead title={project.name} description={`${project.code} · Equipo`} />
      <ProjectTeamEditor code={project.code} />
    </>
  );
}

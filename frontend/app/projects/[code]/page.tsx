import { notFound, redirect } from "next/navigation";
import { fetchProject } from "@/lib/projects";

type Props = { params: Promise<{ code: string }> };

export default async function Page({ params }: Props) {
  const { code } = await params;
  const project = await fetchProject(code);
  if (!project) notFound();
  redirect(`/projects/${project.code}/phase/${project.currentPhase}`);
}

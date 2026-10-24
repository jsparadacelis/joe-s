import { notFound, redirect } from "next/navigation";
import { fetchProject } from "@/lib/projects";

type Props = { params: Promise<{ code: string }> };

export default async function Page({ params }: Props) {
  const { code } = await params;
  const proyecto = await fetchProject(code);
  if (!proyecto) notFound();
  redirect(`/proyectos/${proyecto.code}/fase/${proyecto.currentPhase}`);
}

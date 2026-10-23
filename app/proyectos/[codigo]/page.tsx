import { notFound, redirect } from "next/navigation";
import { obtenerProyecto } from "@/lib/proyectos";

type Props = { params: Promise<{ codigo: string }> };

export default async function Page({ params }: Props) {
  const { codigo } = await params;
  const proyecto = await obtenerProyecto(codigo);
  if (!proyecto) notFound();
  redirect(`/proyectos/${proyecto.codigo}/fase/${proyecto.faseActual}`);
}

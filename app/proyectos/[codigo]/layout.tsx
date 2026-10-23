import type { ReactNode } from "react";
import { notFound } from "next/navigation";
import { ProyectoTabs } from "@/components/proyecto/ProyectoTabs";
import { obtenerProyecto } from "@/lib/proyectos";

type Props = { params: Promise<{ codigo: string }>; children: ReactNode };

export default async function Layout({ params, children }: Props) {
  const { codigo } = await params;
  const proyecto = await obtenerProyecto(codigo);
  if (!proyecto) notFound();
  // Fragmento: el `main` del shell ya aplica el espaciado entre bloques.
  return (
    <>
      <ProyectoTabs codigo={proyecto.codigo} faseActual={proyecto.faseActual} />
      {children}
    </>
  );
}

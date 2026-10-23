import type { Metadata } from "next";
import { EmptyState } from "@/components/layout/EmptyState";
import { PageHead } from "@/components/layout/PageHead";

export const metadata: Metadata = { title: "Proyectos" };

export default function Page() {
  return (
    <>
      <PageHead title="Proyectos" description="Listado de todos los proyectos y su fase actual." />
      <EmptyState title="Aún no hay proyectos" description="Los proyectos se mostrarán aquí cuando existan." />
    </>
  );
}

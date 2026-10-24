import type { Metadata } from "next";
import { EmptyState } from "@/components/layout/EmptyState";
import { PageHead } from "@/components/layout/PageHead";

export const metadata: Metadata = { title: "Cartera" };

export default function Page() {
  return (
    <>
      <PageHead title="Cartera" description="Visión general de los proyectos activos y su estado." />
      <EmptyState title="Aún no hay proyectos en la cartera" description="Cuando se creen proyectos, aparecerán aquí con su fase y su semáforo." />
    </>
  );
}

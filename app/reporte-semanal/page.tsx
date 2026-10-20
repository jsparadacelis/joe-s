import type { Metadata } from "next";
import { EmptyState } from "@/components/layout/EmptyState";
import { PageHead } from "@/components/layout/PageHead";

export const metadata: Metadata = { title: "Reporte semanal" };

export default function Page() {
  return (
    <>
      <PageHead title="Reporte semanal" description="Resumen semanal del avance de la cartera." />
      <EmptyState title="Aún no hay reportes" description="El reporte de la semana se mostrará aquí cuando haya datos." />
    </>
  );
}

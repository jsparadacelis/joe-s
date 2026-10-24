import type { Metadata } from "next";
import { EmptyState } from "@/components/layout/EmptyState";
import { PageHead } from "@/components/layout/PageHead";

export const metadata: Metadata = { title: "Por promover" };

export default function Page() {
  return (
    <>
      <PageHead title="Por promover" description="Proyectos con el entregable listo para pasar a la siguiente fase." />
      <EmptyState title="No hay proyectos por promover" description="Los proyectos que cumplan los requisitos de promoción aparecerán aquí." />
    </>
  );
}

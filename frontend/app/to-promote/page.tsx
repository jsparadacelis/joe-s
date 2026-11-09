import type { Metadata } from "next";
import { PageHead } from "@/components/layout/PageHead";
import { ToPromoteView } from "@/components/to-promote/ToPromoteView";

export const metadata: Metadata = { title: "Por promover" };

export default function Page() {
  return (
    <>
      <PageHead title="Por promover" description="Proyectos con el entregable listo para pasar a la siguiente fase." />
      <ToPromoteView />
    </>
  );
}

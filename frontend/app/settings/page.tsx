import type { Metadata } from "next";
import { PageHead } from "@/components/layout/PageHead";
import { PlanSettingsEditor } from "@/components/settings/PlanSettingsEditor";

export const metadata: Metadata = { title: "Ajustes y equipo" };

export default function Page() {
  return (
    <>
      <PageHead title="Ajustes y equipo" description="Configuración general y gestión del equipo." />
      <PlanSettingsEditor />
    </>
  );
}

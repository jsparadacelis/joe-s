import type { Metadata } from "next";
import { EmptyState } from "@/components/layout/EmptyState";
import { PageHead } from "@/components/layout/PageHead";

export const metadata: Metadata = { title: "Ajustes y equipo" };

export default function Page() {
  return (
    <>
      <PageHead title="Ajustes y equipo" description="Configuración general y gestión del equipo." />
      <EmptyState title="Nada configurado todavía" description="Las opciones de ajustes y los miembros del equipo se mostrarán aquí." />
    </>
  );
}

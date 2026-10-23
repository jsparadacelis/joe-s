import Link from "next/link";
import { Notice } from "@/components/ui/Notice";
import { modoFase, type FaseId } from "@/lib/fases";

export type ModoBannerProps = {
  codigo: string;
  faseActual: FaseId;
  faseVista: FaseId;
};

export function ModoBanner({ codigo, faseActual, faseVista }: ModoBannerProps) {
  const modo = modoFase(faseVista, faseActual);
  if (modo === "edicion") return null;

  const mensaje =
    modo === "solo-lectura" ? "Fase cerrada · versión congelada" : "Vista previa: nada se guarda en esta fase";

  return (
    <Notice tone={modo === "solo-lectura" ? "info" : "warn"}>
      <div className="flex items-center justify-between gap-4">
        <span>{mensaje}</span>
        <Link href={`/proyectos/${codigo}/fase/${faseActual}`} className="font-medium underline">
          Volver a la fase actual
        </Link>
      </div>
    </Notice>
  );
}

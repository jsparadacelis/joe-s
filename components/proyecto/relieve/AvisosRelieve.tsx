import { Notice } from "@/components/ui/Notice";

export type AvisosRelieveProps = {
  recortada: boolean;
  parcelaCortada: boolean;
  /** Procedencia del dato (p. ej. «Relieve simulado»). */
  fuente: string;
  /** Hay parcela dentro de la vista; si no, se avisa. */
  hayLecturas: boolean;
};

export function AvisosRelieve({ recortada, parcelaCortada, fuente, hayLecturas }: AvisosRelieveProps) {
  return (
    <div className="flex flex-col gap-2">
      {recortada ? <Notice tone="warn">Parcela mayor que la ventana: se muestra centrada en su centroide.</Notice> : null}
      {parcelaCortada ? <Notice tone="warn">El borde se corta en el límite de la vista.</Notice> : null}
      {hayLecturas ? null : <Notice tone="warn">No hay parcela dentro de la vista: no se pueden calcular las lecturas.</Notice>}
      <p className="text-xs text-muted">
        Orientativo: no sustituye un levantamiento topográfico. Fuente: {fuente}.
      </p>
    </div>
  );
}

import { Notice } from "@/components/ui/Notice";

export type ReliefNoticesProps = {
  clamped: boolean;
  plotClipped: boolean;
  /** Procedencia del dato (p. ej. «Relieve simulado»). */
  source: string;
  /** Hay parcela dentro de la vista; si no, se avisa. */
  hasReadings: boolean;
};

export function ReliefNotices({ clamped, plotClipped, source, hasReadings }: ReliefNoticesProps) {
  return (
    <div className="flex flex-col gap-2">
      {clamped ? <Notice tone="warn">Parcela mayor que la ventana: se muestra centrada en su centroide.</Notice> : null}
      {plotClipped ? <Notice tone="warn">El borde se corta en el límite de la vista.</Notice> : null}
      {hasReadings ? null : <Notice tone="warn">No hay parcela dentro de la vista: no se pueden calcular las lecturas.</Notice>}
      <p className="text-xs text-muted">
        Orientativo: no sustituye un levantamiento topográfico. Fuente: {source}.
      </p>
    </div>
  );
}

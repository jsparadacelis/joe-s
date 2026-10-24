import { Notice } from "@/components/ui/Notice";

export type ReliefNoticesProps = {
  clamped: boolean;
  plotClipped: boolean;
  /** Origin of the data (e.g. «Relieve simulado»). */
  source: string;
  /** There is a plot inside the view; otherwise a notice is shown. */
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

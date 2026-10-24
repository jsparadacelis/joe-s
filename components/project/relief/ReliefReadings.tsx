import type { Exaggeration, Relief } from "@/lib/relief";
import type { Readings } from "@/lib/relief-readings";

export type ReliefReadingsProps = {
  readings: Readings | null;
  viewWindow: Relief["viewWindow"];
  exaggeration: Exaggeration;
};

const number = (value: number, decimals = 0) =>
  new Intl.NumberFormat("es-ES", { minimumFractionDigits: decimals, maximumFractionDigits: decimals }).format(value);

function Reading({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5 rounded-base bg-surface-2 px-3 py-2">
      <dt className="text-xs text-muted">{label}</dt>
      <dd className="text-s font-medium tabular-nums">{value}</dd>
    </div>
  );
}

export function ReliefReadings({ readings, viewWindow, exaggeration }: ReliefReadingsProps) {
  const [x0, y0, x1, y1] = viewWindow;
  return (
    <dl className="grid grid-cols-2 gap-2 md:grid-cols-3">
      {readings ? (
        <>
          <Reading label="Superficie del polígono" value={`${number(readings.surface)} m²`} />
          <Reading
            label="Altitud en la parcela"
            value={`${number(readings.minHeight, 1)}–${number(readings.maxHeight, 1)} m`}
          />
          <Reading label="Desnivel" value={`${number(readings.elevationRange, 1)} m`} />
          <Reading label="Pendiente media" value={`${number(readings.meanSlope, 1)} %`} />
        </>
      ) : null}
      <Reading label="Vista" value={`${number(x1 - x0)} × ${number(y1 - y0)} m`} />
      <Reading label="Relieve" value={`×${exaggeration} vertical`} />
    </dl>
  );
}

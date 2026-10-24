import { Panel } from "@/components/ui/Panel";
import { StatusChip } from "@/components/ui/StatusChip";
import { formatNumber, type Capacity } from "@/lib/capacity";

export type CapacityPanelProps = { capacity: Capacity | null };

const LIMIT_LABEL: Record<Capacity["limitedBy"], string> = {
  buildability: "Edificabilidad",
  "occupancy-floors": "Ocupación × plantas",
};

function Figure({ value, name, limitedBy }: { value: string; name: string; limitedBy: boolean }) {
  return (
    <div
      className={`flex flex-col gap-1 rounded-base border bg-surface p-3 ${limitedBy ? "border-point" : "border-hair"}`}
    >
      <span className="text-l font-medium tabular-nums">{value}</span>
      <span className="text-xs text-muted">{name}</span>
      {limitedBy ? <StatusChip tone="point">Limita</StatusChip> : null}
    </div>
  );
}

export function CapacityPanel({ capacity: c }: CapacityPanelProps) {
  return (
    <Panel
      title="Capacidad"
      description="Calculado con planeamiento y superficie de cálculo. No se edita: cambia al cambiar los datos."
      headingLevel={3}
    >
      {c ? (
        <>
          <div className="grid grid-cols-3 gap-2.5">
            <Figure value={`${formatNumber(c.buildableArea, 1)} m²t`} name="techo por edificabilidad" limitedBy={c.limitedBy === "buildability"} />
            <Figure value={`${formatNumber(c.footprint, 1)} m²`} name="huella máxima" limitedBy={false} />
            <Figure value={`${formatNumber(c.byFloors, 1)} m²t`} name="huella × plantas" limitedBy={c.limitedBy !== "buildability"} />
          </div>
          <dl className="grid grid-cols-[120px_minmax(0,1fr)] gap-x-3 gap-y-1.5 text-s">
            <dt className="text-muted">Techo máximo</dt>
            <dd className="tabular-nums">
              <b className="font-medium">{formatNumber(c.maximum, 1)} m²t</b> · limita: {LIMIT_LABEL[c.limitedBy]}
            </dd>
            <dt className="text-muted">Existente</dt>
            <dd className="tabular-nums">
              {formatNumber(c.existing)} m² construidos
              {c.existing && c.maximum > 0 ? ` · ${formatNumber((c.existing / c.maximum) * 100)} % del techo máximo` : ""}
            </dd>
            <dt className="text-muted">Parcela mínima</dt>
            <dd>
              {c.meetsMinPlot === null
                ? "Sin dato"
                : c.meetsMinPlot
                  ? `Cumple (${formatNumber(c.surface)} ≥ ${formatNumber(c.minPlot)} m²)`
                  : `No cumple (${formatNumber(c.surface)} < ${formatNumber(c.minPlot)} m²)`}
            </dd>
          </dl>
        </>
      ) : (
        <p className="text-s text-muted">
          Rellena edificabilidad, ocupación y número de plantas para calcular la capacidad.
        </p>
      )}
    </Panel>
  );
}

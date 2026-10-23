import { Panel } from "@/components/ui/Panel";
import { StatusChip } from "@/components/ui/StatusChip";
import { formatearNumero, type Capacidad } from "@/lib/capacidad";

export type PanelCapacidadProps = { capacidad: Capacidad | null };

function Cifra({ valor, nombre, limita }: { valor: string; nombre: string; limita: boolean }) {
  return (
    <div
      className={`flex flex-col gap-1 rounded-base border bg-surface p-3 ${limita ? "border-point" : "border-hair"}`}
    >
      <span className="text-l font-medium tabular-nums">{valor}</span>
      <span className="text-xs text-muted">{nombre}</span>
      {limita ? <StatusChip tone="point">Limita</StatusChip> : null}
    </div>
  );
}

export function PanelCapacidad({ capacidad: c }: PanelCapacidadProps) {
  return (
    <Panel
      title="Capacidad"
      description="Calculado con planeamiento y superficie de cálculo. No se edita: cambia al cambiar los datos."
      headingLevel={3}
    >
      {c ? (
        <>
          <div className="grid grid-cols-3 gap-2.5">
            <Cifra valor={`${formatearNumero(c.techo, 1)} m²t`} nombre="techo por edificabilidad" limita={c.limita === "Edificabilidad"} />
            <Cifra valor={`${formatearNumero(c.huella, 1)} m²`} nombre="huella máxima" limita={false} />
            <Cifra valor={`${formatearNumero(c.porPlantas, 1)} m²t`} nombre="huella × plantas" limita={c.limita !== "Edificabilidad"} />
          </div>
          <dl className="grid grid-cols-[120px_minmax(0,1fr)] gap-x-3 gap-y-1.5 text-s">
            <dt className="text-muted">Techo máximo</dt>
            <dd className="tabular-nums">
              <b className="font-medium">{formatearNumero(c.maximo, 1)} m²t</b> · limita: {c.limita}
            </dd>
            <dt className="text-muted">Existente</dt>
            <dd className="tabular-nums">
              {formatearNumero(c.existente)} m² construidos
              {c.existente && c.maximo > 0 ? ` · ${formatearNumero((c.existente / c.maximo) * 100)} % del techo máximo` : ""}
            </dd>
            <dt className="text-muted">Parcela mínima</dt>
            <dd>
              {c.cumpleParcelaMinima === null
                ? "Sin dato"
                : c.cumpleParcelaMinima
                  ? `Cumple (${formatearNumero(c.superficie)} ≥ ${formatearNumero(c.parcelaMinima)} m²)`
                  : `No cumple (${formatearNumero(c.superficie)} < ${formatearNumero(c.parcelaMinima)} m²)`}
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

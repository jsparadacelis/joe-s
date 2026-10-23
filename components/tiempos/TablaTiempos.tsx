import { StatusChip } from "@/components/ui/StatusChip";
import { Table, type TableColumn } from "@/components/ui/Table";
import { TONO_SEMAFORO } from "@/components/tiempos/ResumenTiempos";
import { FASES, estadoFase, type EstadoFase } from "@/lib/fases";
import {
  ETIQUETA_SEMAFORO,
  porcentajeConsumo,
  semaforoConsumo,
  type FaseConPlan,
  type Semaforo,
  type TiempoFase,
} from "@/lib/tiempos";

const ETIQUETA_ESTADO: Record<EstadoFase, string> = { hecha: "Hecha", actual: "Actual", vista: "Pendiente" };
const COLOR_BARRA: Record<Semaforo, string> = { verde: "bg-ok", ambar: "bg-warn", rojo: "bg-bad" };

function BarraConsumo({ fase }: { fase: TiempoFase }) {
  const porcentaje = porcentajeConsumo(fase.activasSemanas, fase.planSemanas);
  const semaforo = semaforoConsumo(fase.activasSemanas, fase.planSemanas);
  return (
    <div className="flex items-center gap-2.5">
      <div
        role="progressbar"
        aria-label={`Consumo de ${FASES[fase.fase].nombre}`}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={porcentaje}
        className="h-2 w-28 flex-none overflow-hidden rounded-full bg-surface-2"
      >
        <div
          className={`h-full rounded-full ${COLOR_BARRA[semaforo]}`}
          style={{ width: `${Math.min(porcentaje, 100)}%` }}
        />
      </div>
      <span className="w-12 flex-none text-right text-s tabular-nums">{porcentaje} %</span>
      {fase.activasSemanas > 0 ? (
        <StatusChip tone={TONO_SEMAFORO[semaforo]} variant="semaforo">
          {ETIQUETA_SEMAFORO[semaforo]}
        </StatusChip>
      ) : null}
    </div>
  );
}

export type TablaTiemposProps = {
  fases: readonly TiempoFase[];
  faseActual: FaseConPlan;
};

export function TablaTiempos({ fases, faseActual }: TablaTiemposProps) {
  const columnas: TableColumn<TiempoFase>[] = [
    { key: "fase", header: "Fase", render: (f) => `${f.fase}. ${FASES[f.fase].nombre}` },
    { key: "plan", header: "Plan", render: (f) => f.planSemanas },
    { key: "activas", header: "Activas", render: (f) => f.activasSemanas },
    { key: "pausa", header: "Pausa", render: (f) => f.pausaSemanas },
    {
      key: "estado",
      header: "Estado",
      render: (f) => {
        const estado = estadoFase(f.fase, faseActual);
        return (
          <StatusChip tone={estado === "hecha" ? "ok" : estado === "actual" ? "point" : "neutral"}>
            {ETIQUETA_ESTADO[estado]}
          </StatusChip>
        );
      },
    },
    { key: "consumo", header: "Consumo", render: (f) => <BarraConsumo fase={f} /> },
  ];
  return (
    <Table
      caption="Plan, semanas activas, pausa y consumo por fase"
      columns={columnas}
      rows={fases}
      getRowKey={(f) => String(f.fase)}
    />
  );
}

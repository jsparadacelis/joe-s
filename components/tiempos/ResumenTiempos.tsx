import { Notice } from "@/components/ui/Notice";
import { StatusChip, type StatusTone } from "@/components/ui/StatusChip";
import { FASES } from "@/lib/fases";
import {
  ETIQUETA_MOTIVO,
  ETIQUETA_SEMAFORO,
  formatearFecha,
  porcentajeConsumo,
  semaforoConsumo,
  type PlanTiempos,
  type Semaforo,
} from "@/lib/tiempos";

export const TONO_SEMAFORO: Record<Semaforo, StatusTone> = { verde: "ok", ambar: "warn", rojo: "bad" };

function Estadistica({ etiqueta, children }: { etiqueta: string; children: string }) {
  return (
    <div className="flex flex-col gap-1 rounded-base border border-hair bg-surface p-3.5">
      <span className="text-xs font-medium text-muted">{etiqueta}</span>
      <p className="text-l font-semibold">{children}</p>
    </div>
  );
}

export type ResumenTiemposProps = { plan: PlanTiempos };

export function ResumenTiempos({ plan }: ResumenTiemposProps) {
  const desviacion = plan.desviacionSemanas > 0 ? `+${plan.desviacionSemanas}` : String(plan.desviacionSemanas);
  const actual = plan.fases.find((f) => f.fase === plan.faseActual);
  const semaforo = actual ? semaforoConsumo(actual.activasSemanas, actual.planSemanas) : null;
  return (
    <div className="flex flex-col gap-3.5">
      {plan.pausaActiva ? (
        <Notice tone="warn">
          Proyecto en pausa desde el {formatearFecha(plan.pausaActiva.desde)}. Motivo:{" "}
          {ETIQUETA_MOTIVO[plan.pausaActiva.motivo]}. Reanudación prevista el{" "}
          {formatearFecha(plan.pausaActiva.reanudacionPrevista)}.
        </Notice>
      ) : null}
      <div className="grid grid-cols-5 gap-3.5">
        <Estadistica etiqueta="Total activo frente al plan">{`${plan.totalActivasSemanas} / ${plan.totalPlanSemanas} sem`}</Estadistica>
        <Estadistica etiqueta="Pausa">{`${plan.totalPausaSemanas} sem en pausa`}</Estadistica>
        <Estadistica etiqueta="Calendario total">{`${plan.calendarioSemanas} sem de calendario`}</Estadistica>
        <Estadistica etiqueta="Desviación">{`${desviacion} sem de desviación`}</Estadistica>
        {actual && semaforo ? (
          <div className="flex flex-col gap-1 rounded-base border border-hair bg-surface p-3.5">
            <span className="text-xs font-medium text-muted">Fase actual · {FASES[plan.faseActual].nombre}</span>
            <p className="text-l font-semibold">{porcentajeConsumo(actual.activasSemanas, actual.planSemanas)} %</p>
            <span>
              <StatusChip tone={TONO_SEMAFORO[semaforo]} variant="semaforo">
                {ETIQUETA_SEMAFORO[semaforo]}
              </StatusChip>
            </span>
          </div>
        ) : null}
      </div>
    </div>
  );
}

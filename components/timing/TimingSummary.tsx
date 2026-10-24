import { Notice } from "@/components/ui/Notice";
import { StatusChip, type StatusTone } from "@/components/ui/StatusChip";
import { PHASES } from "@/lib/phases";
import {
  REASON_LABEL,
  TRAFFIC_LIGHT_LABEL,
  formatDate,
  consumptionPercent,
  consumptionTrafficLight,
  type TimingPlan,
  type TrafficLight,
} from "@/lib/timing";

export const TRAFFIC_LIGHT_TONE: Record<TrafficLight, StatusTone> = { green: "ok", amber: "warn", red: "bad" };

function Stat({ label, children }: { label: string; children: string }) {
  return (
    <div className="flex flex-col gap-1 rounded-base border border-hair bg-surface p-3.5">
      <span className="text-xs font-medium text-muted">{label}</span>
      <p className="text-l font-semibold">{children}</p>
    </div>
  );
}

export type TimingSummaryProps = { plan: TimingPlan };

export function TimingSummary({ plan }: TimingSummaryProps) {
  const deviation = plan.deviationWeeks > 0 ? `+${plan.deviationWeeks}` : String(plan.deviationWeeks);
  const current = plan.phases.find((f) => f.phase === plan.currentPhase);
  const trafficLight = current ? consumptionTrafficLight(current.activeWeeks, current.plannedWeeks) : null;
  return (
    <div className="flex flex-col gap-3.5">
      {plan.activePause ? (
        <Notice tone="warn">
          Proyecto en pausa desde el {formatDate(plan.activePause.from)}. Motivo:{" "}
          {REASON_LABEL[plan.activePause.motivo]}. Reanudación prevista el{" "}
          {formatDate(plan.activePause.expectedResumption)}.
        </Notice>
      ) : null}
      <div className="grid grid-cols-5 gap-3.5">
        <Stat label="Total activo frente al plan">{`${plan.totalActiveWeeks} / ${plan.totalPlannedWeeks} sem`}</Stat>
        <Stat label="Pausa">{`${plan.totalPausedWeeks} sem en pausa`}</Stat>
        <Stat label="Calendario total">{`${plan.calendarioSemanas} sem de calendario`}</Stat>
        <Stat label="Desviación">{`${deviation} sem de desviación`}</Stat>
        {current && trafficLight ? (
          <div className="flex flex-col gap-1 rounded-base border border-hair bg-surface p-3.5">
            <span className="text-xs font-medium text-muted">Fase actual · {PHASES[plan.currentPhase].name}</span>
            <p className="text-l font-semibold">{consumptionPercent(current.activeWeeks, current.plannedWeeks)} %</p>
            <span>
              <StatusChip tone={TRAFFIC_LIGHT_TONE[trafficLight]} variant="traffic-light">
                {TRAFFIC_LIGHT_LABEL[trafficLight]}
              </StatusChip>
            </span>
          </div>
        ) : null}
      </div>
    </div>
  );
}

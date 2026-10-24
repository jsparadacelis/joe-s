import { StatusChip } from "@/components/ui/StatusChip";
import { Table, type TableColumn } from "@/components/ui/Table";
import { TRAFFIC_LIGHT_TONE } from "@/components/timing/TimingSummary";
import { PHASES, phaseState, type PhaseState } from "@/lib/phases";
import {
  TRAFFIC_LIGHT_LABEL,
  consumptionPercent,
  consumptionTrafficLight,
  type PlannedPhase,
  type TrafficLight,
  type PhaseTiming,
} from "@/lib/timing";

const STATE_LABEL: Record<PhaseState, string> = { done: "Hecha", current: "Actual", upcoming: "Pendiente" };
const BAR_COLOR: Record<TrafficLight, string> = { green: "bg-ok", amber: "bg-warn", red: "bg-bad" };

function ConsumptionBar({ phase }: { phase: PhaseTiming }) {
  const percent = consumptionPercent(phase.activeWeeks, phase.plannedWeeks);
  const trafficLight = consumptionTrafficLight(phase.activeWeeks, phase.plannedWeeks);
  return (
    <div className="flex items-center gap-2.5">
      <div
        role="progressbar"
        aria-label={`Consumo de ${PHASES[phase.phase].name}`}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percent}
        className="h-2 w-28 flex-none overflow-hidden rounded-full bg-surface-2"
      >
        <div
          className={`h-full rounded-full ${BAR_COLOR[trafficLight]}`}
          style={{ width: `${Math.min(percent, 100)}%` }}
        />
      </div>
      <span className="w-12 flex-none text-right text-s tabular-nums">{percent} %</span>
      {phase.activeWeeks > 0 ? (
        <StatusChip tone={TRAFFIC_LIGHT_TONE[trafficLight]} variant="traffic-light">
          {TRAFFIC_LIGHT_LABEL[trafficLight]}
        </StatusChip>
      ) : null}
    </div>
  );
}

export type TimingTableProps = {
  phases: readonly PhaseTiming[];
  currentPhase: PlannedPhase;
};

export function TimingTable({ phases, currentPhase }: TimingTableProps) {
  const columns: TableColumn<PhaseTiming>[] = [
    { key: "phase", header: "Fase", render: (f) => `${f.phase}. ${PHASES[f.phase].name}` },
    { key: "plan", header: "Plan", render: (f) => f.plannedWeeks },
    { key: "active", header: "Activas", render: (f) => f.activeWeeks },
    { key: "pause", header: "Pausa", render: (f) => f.pausedWeeks },
    {
      key: "state",
      header: "Estado",
      render: (f) => {
        const state = phaseState(f.phase, currentPhase);
        return (
          <StatusChip tone={state === "done" ? "ok" : state === "current" ? "point" : "neutral"}>
            {STATE_LABEL[state]}
          </StatusChip>
        );
      },
    },
    { key: "consumption", header: "Consumo", render: (f) => <ConsumptionBar phase={f} /> },
  ];
  return (
    <Table
      caption="Plan, semanas activas, pausa y consumo por fase"
      columns={columns}
      rows={phases}
      getRowKey={(f) => String(f.phase)}
    />
  );
}

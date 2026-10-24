import Link from "next/link";
import { StatusChip, type StatusTone } from "@/components/ui/StatusChip";
import { Table, type TableColumn } from "@/components/ui/Table";
import { PHASES } from "@/lib/phases";
import { STATUS_LABEL, isStale, phaseWeeksProgress, type PortfolioRow, type PortfolioStatus } from "@/lib/portfolio";
import { formatDate, type TrafficLight } from "@/lib/timing";

export type PortfolioTableProps = {
  rows: readonly PortfolioRow[];
};

const STATUS_TONE: Record<PortfolioStatus, StatusTone> = {
  green: "ok",
  amber: "warn",
  red: "bad",
  paused: "off",
  "no-plan": "off",
  unknown: "neutral",
};

function daysText(days: number): string {
  if (days === 0) return "Hoy";
  return days === 1 ? "1 día" : `${days} días`;
}

const BAR_COLOR: Record<TrafficLight, string> = { green: "bg-ok", amber: "bg-warn", red: "bg-bad" };

function PhaseWeeksCell({ row }: { row: PortfolioRow }) {
  const progress = phaseWeeksProgress(row);
  if (!row.phaseWeeks || !progress) {
    // An opportunity has no plan until it is promoted; any other row without weeks has them pending (RGB-16/21).
    return <span className="text-muted">{row.status === "no-plan" ? "Sin plan hasta promover" : "Sin calcular"}</span>;
  }
  const { active, planned } = row.phaseWeeks;
  const { percent, trafficLight } = progress;
  const paused = row.status === "paused";
  return (
    <div className="flex flex-col gap-1">
      <span className="tabular-nums">{`${active} / ${planned} sem.`}</span>
      <div
        role="progressbar"
        aria-label={`${active} de ${planned} semanas activas, ${paused ? "reloj parado" : `${percent} % del plan`}`}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.min(percent, 100)}
        aria-valuetext={`${percent} % del plan`}
        className="h-2 w-28 overflow-hidden rounded-full bg-surface-2"
      >
        <div
          className={`h-full rounded-full ${paused ? "bg-off" : BAR_COLOR[trafficLight]}`}
          style={{ width: `${Math.min(percent, 100)}%` }}
        />
      </div>
      {paused && <span className="text-xs text-muted">Reloj parado</span>}
    </div>
  );
}

const COLUMNS: readonly TableColumn<PortfolioRow>[] = [
  {
    key: "project",
    header: "Proyecto",
    render: (row) => (
      <Link
        href={`/projects/${row.code}/phase/${row.phase}`}
        className="flex flex-col rounded-base after:absolute after:inset-0 focus-visible:outline-2 focus-visible:outline-point"
      >
        <span className="text-xs text-muted tabular-nums">{row.code}</span>
        <span className="font-medium text-ink">{row.name}</span>
      </Link>
    ),
  },
  { key: "phase", header: "Fase", render: (row) => `${row.phase}. ${PHASES[row.phase].name}` },
  { key: "phaseWeeks", header: "Semanas de la fase", render: (row) => <PhaseWeeksCell row={row} /> },
  {
    key: "status",
    header: "Semáforo",
    render: (row) => (
      <StatusChip variant="traffic-light" tone={STATUS_TONE[row.status]}>
        {STATUS_LABEL[row.status]}
      </StatusChip>
    ),
  },
  {
    key: "milestone",
    header: "Próximo hito",
    render: ({ nextMilestone }) =>
      nextMilestone ? (
        <div className="flex flex-col">
          <span>{nextMilestone.name}</span>
          {nextMilestone.date ? (
            <time dateTime={nextMilestone.date} className="text-xs text-muted tabular-nums">
              {formatDate(nextMilestone.date)}
            </time>
          ) : (
            <span className="text-xs text-muted">Sin fecha</span>
          )}
        </div>
      ) : (
        <span className="text-muted">Sin hito próximo</span>
      ),
  },
  { key: "owner", header: "Responsable", render: (row) => row.owner },
  {
    key: "blocker",
    header: "Bloqueo",
    render: ({ blocker }) => (blocker ?? <span className="text-muted">Sin bloqueo</span>),
  },
  {
    key: "days",
    header: "Días sin actualizar",
    render: (row) => (
      <div className="flex items-center gap-2">
        <span className="whitespace-nowrap tabular-nums">{daysText(row.daysSinceUpdate)}</span>
        {isStale(row) && <StatusChip tone="warn">Desactualizada</StatusChip>}
      </div>
    ),
  },
];

export function PortfolioTable({ rows }: PortfolioTableProps) {
  return (
    <div
      role="region"
      aria-label="Tabla de la cartera"
      tabIndex={0}
      className="overflow-x-auto rounded-base focus-visible:outline-2 focus-visible:outline-point"
    >
      <Table
        caption="Proyectos de la cartera"
        columns={COLUMNS}
        rows={rows}
        getRowKey={(row) => row.code}
        rowClassName={() => "relative"}
      />
    </div>
  );
}

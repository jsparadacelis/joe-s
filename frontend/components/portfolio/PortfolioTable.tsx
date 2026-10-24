import Link from "next/link";
import { StatusChip, type StatusTone } from "@/components/ui/StatusChip";
import { Table, type TableColumn } from "@/components/ui/Table";
import { PHASES } from "@/lib/phases";
import { STATUS_LABEL, isStale, type PortfolioRow, type PortfolioStatus } from "@/lib/portfolio";
import { formatDate } from "@/lib/timing";

export type PortfolioTableProps = {
  rows: readonly PortfolioRow[];
};

const STATUS_TONE: Record<PortfolioStatus, StatusTone> = {
  green: "ok",
  amber: "warn",
  red: "bad",
  paused: "off",
  "no-plan": "off",
};

function daysText(days: number): string {
  if (days === 0) return "Hoy";
  return days === 1 ? "1 día" : `${days} días`;
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
          <time dateTime={nextMilestone.date} className="text-xs text-muted tabular-nums">
            {formatDate(nextMilestone.date)}
          </time>
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

import Link from "next/link";
import { EmptyState } from "@/components/layout/EmptyState";
import { StatusChip, type StatusTone } from "@/components/ui/StatusChip";
import { Table, type TableColumn } from "@/components/ui/Table";
import { toPromoteStateLabel, type ToPromoteProject } from "@/lib/to-promote";

export type ToPromoteTableProps = {
  projects: readonly ToPromoteProject[];
};

const STATE_TONE: Record<string, StatusTone> = { ready: "ok", in_progress: "warn", blocked: "bad" };

const COLUMNS: readonly TableColumn<ToPromoteProject>[] = [
  {
    key: "project",
    header: "Proyecto",
    render: (project) => (
      <Link
        href={`/projects/${project.code}`}
        className="flex flex-col rounded-base focus-visible:outline-2 focus-visible:outline-point"
      >
        <span className="text-xs text-muted tabular-nums">{project.code}</span>
        <span className="break-words font-medium text-ink">{project.name}</span>
      </Link>
    ),
  },
  { key: "phase", header: "Fase", render: (project) => `${project.phase}. ${project.phaseName}` },
  {
    key: "deliverable",
    header: "Entregable de salida",
    render: (project) => <span className="break-words">{project.deliverable}</span>,
  },
  {
    key: "state",
    header: "Estado",
    render: (project) => (
      <div className="flex flex-col items-start gap-1">
        <StatusChip variant="traffic-light" tone={Object.hasOwn(STATE_TONE, project.state) ? STATE_TONE[project.state] : "neutral"}>
          {toPromoteStateLabel(project.state)}
        </StatusChip>
        {project.reason ? <span className="break-words text-xs text-muted">{project.reason}</span> : null}
      </div>
    ),
  },
  {
    key: "promoter",
    header: "Quién promueve",
    render: (project) => (
      <div className="flex flex-col items-start gap-1">
        <span>{project.promoter}</span>
        {project.canPromote ? <StatusChip tone="point">Puedes promover</StatusChip> : null}
      </div>
    ),
  },
];

export function ToPromoteTable({ projects }: ToPromoteTableProps) {
  if (projects.length === 0) {
    return (
      <EmptyState
        title="No hay proyectos por promover"
        description="Los proyectos que cumplan los requisitos de promoción aparecerán aquí."
      />
    );
  }
  return (
    <div
      role="region"
      aria-label="Tabla de proyectos por promover"
      tabIndex={0}
      className="overflow-x-auto rounded-base focus-visible:outline-2 focus-visible:outline-point"
    >
      <Table caption="Proyectos por promover" columns={COLUMNS} rows={projects} getRowKey={(project) => project.code} />
    </div>
  );
}

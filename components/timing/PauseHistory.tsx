import { Table, type TableColumn } from "@/components/ui/Table";
import { PHASES } from "@/lib/phases";
import { REASON_LABEL, formatDate, type Pause } from "@/lib/timing";

const COLUMNS: TableColumn<Pause>[] = [
  {
    key: "period",
    header: "Desde – Hasta",
    render: (p) => `${formatDate(p.from)} – ${p.to ? formatDate(p.to) : "en curso"}`,
  },
  { key: "phase", header: "Fase", render: (p) => PHASES[p.phase].name },
  { key: "reason", header: "Motivo", render: (p) => REASON_LABEL[p.motivo] },
  { key: "weeks", header: "Semanas", render: (p) => p.weeks },
];

export type PauseHistoryProps = { pauses: readonly Pause[] };

export function PauseHistory({ pauses }: PauseHistoryProps) {
  return (
    <Table
      caption="Historial de pausas del proyecto"
      columns={COLUMNS}
      rows={pauses}
      getRowKey={(p) => `${p.from}-${p.phase}`}
      emptyMessage="Sin pausas registradas"
    />
  );
}

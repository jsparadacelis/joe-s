import { Panel } from "@/components/ui/Panel";
import { Table, type TableColumn } from "@/components/ui/Table";
import { RECOMMENDATION_LABELS, formatScore, formatScoredAt, type ScoringHistoryEntry } from "@/lib/scoring";

const COLUMNS: TableColumn<ScoringHistoryEntry>[] = [
  { key: "version", header: "Versión", render: (h) => `v${h.version}` },
  { key: "score", header: "Nota", render: (h) => <span className="tabular-nums">{formatScore(h.score)}</span> },
  { key: "recommendation", header: "Recomendación", render: (h) => RECOMMENDATION_LABELS[h.recommendation] },
  { key: "date", header: "Fecha (UTC)", render: (h) => <span className="tabular-nums">{formatScoredAt(h.scoredAt)}</span> },
];

/** Saved scorings, newest first. Insert-only on the server: changing weights or threshold never rewrites them. */
export function ScoringHistory({ history }: { history: readonly ScoringHistoryEntry[] }) {
  return (
    <Panel
      title="Historial de puntuaciones"
      description="Cambiar los pesos o el umbral no altera las puntuaciones ya guardadas. De la más reciente a la más antigua."
    >
      <Table
        caption="Historial de puntuaciones"
        columns={COLUMNS}
        rows={history}
        getRowKey={(h) => String(h.version)}
        emptyMessage="Sin puntuaciones todavía"
      />
    </Panel>
  );
}

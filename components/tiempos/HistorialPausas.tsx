import { Table, type TableColumn } from "@/components/ui/Table";
import { FASES } from "@/lib/fases";
import { ETIQUETA_MOTIVO, formatearFecha, type Pausa } from "@/lib/tiempos";

const COLUMNAS: TableColumn<Pausa>[] = [
  {
    key: "periodo",
    header: "Desde – Hasta",
    render: (p) => `${formatearFecha(p.desde)} – ${p.hasta ? formatearFecha(p.hasta) : "en curso"}`,
  },
  { key: "fase", header: "Fase", render: (p) => FASES[p.fase].nombre },
  { key: "motivo", header: "Motivo", render: (p) => ETIQUETA_MOTIVO[p.motivo] },
  { key: "semanas", header: "Semanas", render: (p) => p.semanas },
];

export type HistorialPausasProps = { pausas: readonly Pausa[] };

export function HistorialPausas({ pausas }: HistorialPausasProps) {
  return (
    <Table
      caption="Historial de pausas del proyecto"
      columns={COLUMNAS}
      rows={pausas}
      getRowKey={(p) => `${p.desde}-${p.fase}`}
      emptyMessage="Sin pausas registradas"
    />
  );
}

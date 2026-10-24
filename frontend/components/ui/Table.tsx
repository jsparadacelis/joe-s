import type { ReactNode } from "react";

export type TableColumn<Row> = {
  key: string;
  header: string;
  render: (row: Row) => ReactNode;
};

export type TableProps<Row> = {
  /** Accessible description of the table. */
  caption: string;
  columns: readonly TableColumn<Row>[];
  rows: readonly Row[];
  getRowKey: (row: Row) => string;
  /** Text when there are no rows. */
  emptyMessage?: string;
  /** Extra classes for each body row (e.g. `relative` for stretched links). */
  rowClassName?: (row: Row) => string;
};

export function Table<Row>({
  caption,
  columns,
  rows,
  getRowKey,
  emptyMessage = "No hay registros para mostrar.",
  rowClassName,
}: TableProps<Row>) {
  return (
    <table className="w-full border-collapse text-m">
      <caption className="sr-only">{caption}</caption>
      <thead>
        <tr>
          {columns.map((column) => (
            <th
              key={column.key}
              scope="col"
              className="whitespace-nowrap border-b border-hair px-3.5 py-2.5 text-left text-xs font-medium tracking-wide text-muted"
            >
              {column.header}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.length === 0 ? (
          <tr>
            <td colSpan={columns.length} className="px-3.5 py-6 text-center text-s text-muted">
              {emptyMessage}
            </td>
          </tr>
        ) : (
          rows.map((row) => (
            <tr key={getRowKey(row)} className={rowClassName?.(row)}>
              {columns.map((column) => (
                <td key={column.key} className="border-b border-hair px-3.5 py-[11px] align-middle">
                  {column.render(row)}
                </td>
              ))}
            </tr>
          ))
        )}
      </tbody>
    </table>
  );
}

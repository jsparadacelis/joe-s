"use client";

import { useId } from "react";
import { ALL_FILTER, STATUS_LABEL, type PortfolioFilter, type PortfolioStatus } from "@/lib/portfolio";

export type PortfolioFiltersProps = {
  owners: readonly string[];
  value: PortfolioFilter;
  onChange: (next: PortfolioFilter) => void;
};

const SELECT_CLASS = "rounded-base border bg-surface px-2.5 py-1.5 text-s text-ink";
const STATUSES = Object.keys(STATUS_LABEL) as PortfolioStatus[];

export function PortfolioFilters({ owners, value, onChange }: PortfolioFiltersProps) {
  const id = useId();
  return (
    <div role="group" aria-label="Filtros de la cartera" className="flex flex-wrap gap-4">
      <label htmlFor={`${id}-status`} className="flex flex-col gap-1 text-xs text-muted">
        Semáforo
        <select
          id={`${id}-status`}
          className={SELECT_CLASS}
          value={value.status}
          onChange={(event) => onChange({ ...value, status: event.target.value as PortfolioFilter["status"] })}
        >
          <option value={ALL_FILTER}>Todos</option>
          {STATUSES.map((status) => (
            <option key={status} value={status}>
              {STATUS_LABEL[status]}
            </option>
          ))}
        </select>
      </label>
      <label htmlFor={`${id}-owner`} className="flex flex-col gap-1 text-xs text-muted">
        Responsable
        <select
          id={`${id}-owner`}
          className={SELECT_CLASS}
          value={value.owner}
          onChange={(event) => onChange({ ...value, owner: event.target.value })}
        >
          <option value={ALL_FILTER}>Todos</option>
          {owners.map((owner) => (
            <option key={owner} value={owner}>
              {owner}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}

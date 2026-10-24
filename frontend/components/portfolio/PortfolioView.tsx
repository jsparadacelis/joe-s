"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { EmptyState } from "@/components/layout/EmptyState";
import { PortfolioFilters } from "@/components/portfolio/PortfolioFilters";
import { PortfolioSummary } from "@/components/portfolio/PortfolioSummary";
import { PortfolioTable } from "@/components/portfolio/PortfolioTable";
import { Button } from "@/components/ui/Button";
import { Notice } from "@/components/ui/Notice";
import { ApiError } from "@/lib/api";
import {
  ALL_FILTER,
  fetchPortfolio,
  filterPortfolio,
  summarizePortfolio,
  type PortfolioFilter,
  type PortfolioRow,
} from "@/lib/portfolio";

export interface PortfolioViewProps {
  fetcher?: () => Promise<PortfolioRow[]>;
  /** ISO date (yyyy-mm-dd) used for the milestones summary; defaults to today. */
  today?: string;
}

const UNEXPECTED_MESSAGE = "Ocurrió un error inesperado. Inténtalo de nuevo.";
const NO_FILTER: PortfolioFilter = { status: ALL_FILTER, owner: ALL_FILTER };

const defaultFetcher = () => fetchPortfolio();
const todayIso = () => new Date().toISOString().slice(0, 10);

export function PortfolioView({ fetcher = defaultFetcher, today }: PortfolioViewProps) {
  const [rows, setRows] = useState<PortfolioRow[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [filter, setFilter] = useState<PortfolioFilter>(NO_FILTER);

  useEffect(() => {
    let cancelled = false;
    fetcher().then(
      (loaded) => {
        if (cancelled) return;
        setRows(loaded);
        setLoadError(null);
      },
      (error: unknown) => {
        if (!cancelled) setLoadError(error instanceof ApiError ? error.message : UNEXPECTED_MESSAGE);
      },
    );
    return () => {
      cancelled = true;
    };
  }, [fetcher, attempt]);

  const retry = useCallback(() => {
    setLoadError(null);
    setAttempt((n) => n + 1);
  }, []);

  const owners = useMemo(
    () => [...new Set((rows ?? []).map((row) => row.owner))].sort((a, b) => a.localeCompare(b, "es")),
    [rows],
  );

  if (loadError !== null) {
    return (
      <div className="flex flex-col items-start gap-3">
        <Notice tone="bad">{loadError}</Notice>
        <Button onClick={retry}>Reintentar</Button>
      </div>
    );
  }
  if (rows === null) return <p className="text-s text-muted">Cargando la cartera…</p>;
  if (rows.length === 0) {
    return (
      <EmptyState
        title="Aún no hay proyectos en la cartera"
        description="Cuando se creen proyectos, aparecerán aquí con su fase y su semáforo."
      />
    );
  }

  const visible = filterPortfolio(rows, filter);
  return (
    <div className="flex flex-col gap-5">
      <PortfolioSummary summary={summarizePortfolio(rows, today ?? todayIso())} />
      <PortfolioFilters owners={owners} value={filter} onChange={setFilter} />
      <p role="status" className="text-s text-muted">
        Mostrando {visible.length} de {rows.length} proyectos
      </p>
      {visible.length === 0 ? (
        <Notice tone="info">Ningún proyecto coincide con los filtros</Notice>
      ) : (
        <PortfolioTable rows={visible} />
      )}
    </div>
  );
}

"use client";

import { useCallback, useEffect, useState } from "react";
import { ToPromoteTable } from "@/components/to-promote/ToPromoteTable";
import { Button } from "@/components/ui/Button";
import { Notice } from "@/components/ui/Notice";
import { ApiError } from "@/lib/api";
import { fetchToPromote, type ToPromote } from "@/lib/to-promote";

export interface ToPromoteViewProps {
  fetcher?: () => Promise<ToPromote>;
}

const UNEXPECTED_MESSAGE = "Ocurrió un error inesperado. Inténtalo de nuevo.";
const defaultFetcher = () => fetchToPromote();

export function ToPromoteView({ fetcher = defaultFetcher }: ToPromoteViewProps) {
  const [data, setData] = useState<ToPromote | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    fetcher().then(
      (loaded) => {
        if (cancelled) return;
        setData(loaded);
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

  if (loadError !== null) {
    return (
      <div className="flex flex-col items-start gap-3">
        <Notice tone="bad">{loadError}</Notice>
        <Button onClick={retry}>Reintentar</Button>
      </div>
    );
  }
  if (data === null) return <p className="text-s text-muted">Cargando los proyectos por promover…</p>;
  return <ToPromoteTable projects={data.projects} />;
}

"use client";

import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Notice } from "@/components/ui/Notice";
import { Panel } from "@/components/ui/Panel";
import { ApiError } from "@/lib/api";
import { validateCadastralReference } from "@/lib/cadastral-reference";
import { calculateCapacity } from "@/lib/capacity";
import {
  DEFINITIONS,
  DATA_GROUPS,
  countEdited,
  countPending,
  hasTechnicalData,
  type TechnicalDatum,
  type TechnicalData,
} from "@/lib/technical-data";
import { technicalDataApiFor, type TechnicalDataApi } from "@/lib/technical-data-api";
import type { PhaseMode } from "@/lib/phases";
import { CapacityPanel } from "./CapacityPanel";
import { GroupPanel } from "./GroupPanel";
import { VerificationSummary } from "./VerificationSummary";

export type TechnicalDataEditorProps = {
  projectCode: string;
  /** Prefill of the reference; when empty, the reference of the loaded sheet is used. */
  cadastralReference: string;
  /** `undefined`: the editor loads the sheet from the API; `null` or data: used as given, nothing is loaded. */
  initial?: TechnicalData | null;
  mode: PhaseMode;
  /** By default, the API of the project (the sample one for the fictitious projects). */
  api?: TechnicalDataApi;
};

type Notice = { kind: "reference" | "error"; message: string; manualRoute: boolean };

const MONTHS = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
const FAILURE_NOTICE = "No se pudo consultar. Puedes introducir los datos manualmente.";
const SAVE_FAILURE = "No se pudo guardar. Inténtalo de nuevo.";
const NO_AUTHORITY_OR_PHASE = new Set([403, 409]);
const LABELS = new Map(DEFINITIONS.map((d) => [d.id, d.label]));

function readableDate(iso: string): string {
  const [a, m, d] = iso.split("-").map(Number);
  return `${d} ${MONTHS[m - 1]} ${a}`;
}

/** Empty template for the manual path: no datum has an origin, so nothing is marked as edited. */
function emptyData(): TechnicalDatum[] {
  return DEFINITIONS.map((d) => ({ id: d.id, value: "", original: null, verified: false, edited: false }));
}

const byGroup = DATA_GROUPS.map((group) => ({ group, definitions: DEFINITIONS.filter((d) => d.group === group.id) }));

function withoutKey(errors: Record<string, string>, id: string): Record<string, string> {
  if (!(id in errors)) return errors;
  const next = { ...errors };
  delete next[id];
  return next;
}

const replaceDatum = (data: TechnicalDatum[], datum: TechnicalDatum) => data.map((d) => (d.id === datum.id ? datum : d));

export function TechnicalDataEditor({ projectCode, cadastralReference, initial, mode, api }: TechnicalDataEditorProps) {
  const referenceId = useId();
  const client = useMemo(() => api ?? technicalDataApiFor(projectCode), [api, projectCode]);
  const [needsLoad] = useState(initial === undefined);

  const [loading, setLoading] = useState(needsLoad);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [reference, setReference] = useState(cadastralReference || initial?.cadastralReference || "");
  const [data, setData] = useState<TechnicalDatum[] | null>(initial && hasTechnicalData(initial) ? initial.data : null);
  const [queriedOn, setQueriedOn] = useState<string | null>(initial?.queriedOn ?? null);

  const [saving, setSaving] = useState<ReadonlySet<string>>(new Set());
  const [rowErrors, setRowErrors] = useState<Record<string, string>>({});
  const [querying, setQuerying] = useState(false);
  const [verifyingAll, setVerifyingAll] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [unmapped, setUnmapped] = useState<string[]>([]);
  // 403/409: the server will not accept changes, so the screen stops offering them.
  const [locked, setLocked] = useState(false);
  const noticeRef = useRef<HTMLDivElement>(null);

  const editable = mode === "edit" && !locked;
  const busy = saving.size > 0 || querying || verifyingAll;

  useEffect(() => {
    if (!needsLoad) return;
    let cancelled = false;
    client
      .load(projectCode)
      .then((sheet) => {
        if (cancelled) return;
        setData(hasTechnicalData(sheet) ? sheet.data : null);
        setQueriedOn(sheet.queriedOn);
        setReference((current) => current || sheet.cadastralReference);
        setLoading(false);
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        setLoadError(error instanceof ApiError ? error.message : "No se pudieron cargar los datos técnicos.");
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [needsLoad, client, projectCode]);

  // A new general error takes the focus so it is announced and reachable.
  useEffect(() => {
    if (notice?.kind === "error") noticeRef.current?.focus();
  }, [notice]);

  /** Shows a failure that is not about one datum; 403 and 409 also leave the screen read-only. */
  const failGeneral = useCallback((error: unknown, fallback: string, manualRoute: boolean) => {
    if (error instanceof ApiError) {
      if (NO_AUTHORITY_OR_PHASE.has(error.status)) setLocked(true);
      setNotice({ kind: "error", message: error.message, manualRoute: manualRoute && error.status === 503 });
    } else {
      setNotice({ kind: "error", message: fallback, manualRoute });
    }
  }, []);

  /** Runs a request about one datum and paints the datum the server returns. */
  const runDatum = useCallback(
    async (id: string, operation: () => Promise<TechnicalDatum>): Promise<boolean> => {
      setNotice(null);
      setRowErrors((prev) => withoutKey(prev, id));
      setSaving((prev) => new Set(prev).add(id));
      try {
        const datum = await operation();
        setData((prev) => (prev ? replaceDatum(prev, datum) : prev));
        return true;
      } catch (error) {
        if (error instanceof ApiError && (NO_AUTHORITY_OR_PHASE.has(error.status) || error.status === 404)) {
          failGeneral(error, SAVE_FAILURE, false);
        } else {
          setRowErrors((prev) => ({ ...prev, [id]: error instanceof ApiError ? error.message : SAVE_FAILURE }));
        }
        return false;
      } finally {
        setSaving((prev) => {
          const next = new Set(prev);
          next.delete(id);
          return next;
        });
      }
    },
    [failGeneral],
  );

  const onValueChange = useCallback(
    (id: string, value: string) => runDatum(id, () => client.edit(projectCode, id, value)),
    [runDatum, client, projectCode],
  );
  const onVerify = useCallback((id: string) => void runDatum(id, () => client.verify(projectCode, id)), [runDatum, client, projectCode]);
  const onRestore = useCallback((id: string) => void runDatum(id, () => client.restore(projectCode, id)), [runDatum, client, projectCode]);
  const onEditStart = useCallback((id: string) => {
    setRowErrors((prev) => withoutKey(prev, id));
  }, []);

  async function markAll() {
    if (!editable || busy) return;
    setNotice(null);
    setVerifyingAll(true);
    try {
      const sheet = await client.verifyAll(projectCode);
      setData(sheet.data);
    } catch (error) {
      failGeneral(error, SAVE_FAILURE, false);
    } finally {
      setVerifyingAll(false);
    }
  }

  async function requestData() {
    if (!editable || busy) return;
    const checked = validateCadastralReference(reference);
    if (!checked.valid) {
      setNotice({ kind: "reference", message: checked.message, manualRoute: false });
      return;
    }
    setNotice(null);
    setUnmapped([]);
    setQuerying(true);
    try {
      const result = await client.refresh(projectCode, checked.value);
      setData(result.data);
      setQueriedOn(result.queriedOn);
      setUnmapped(result.unmapped);
    } catch (error) {
      failGeneral(error, FAILURE_NOTICE, true);
    } finally {
      setQuerying(false);
    }
  }

  function manualEntry() {
    setData(emptyData());
    setQueriedOn(null);
    setNotice(null);
  }

  const byId = useMemo(() => (data ? new Map(data.map((d) => [d.id, d])) : null), [data]);
  const capacity = useMemo(() => (data ? calculateCapacity(data) : null), [data]);

  if (loading) {
    return (
      <Panel title="Datos técnicos del inmueble">
        <p role="status" className="text-s text-muted">
          Cargando datos técnicos…
        </p>
      </Panel>
    );
  }

  if (loadError) {
    return (
      <Panel title="Datos técnicos del inmueble">
        <Notice tone="bad">{loadError}</Notice>
      </Panel>
    );
  }

  if (!data && mode === "read-only") {
    return (
      <Panel title="Datos técnicos del inmueble">
        <p className="text-s text-muted">Sin datos técnicos registrados.</p>
      </Panel>
    );
  }

  const unmappedLabels = unmapped.map((id) => LABELS.get(id) ?? id);

  return (
    <Panel
      title="Datos técnicos del inmueble"
      description="Todos editables. Un dato cambiado conserva su valor de origen, y cada dato se puede marcar como verificado."
    >
      <div className="flex flex-wrap items-end gap-2">
        <div className="flex min-w-56 flex-1 flex-col gap-1.5">
          <label htmlFor={referenceId} className="text-s font-medium">
            Referencia catastral (de la ficha)
          </label>
          <input
            id={referenceId}
            type="text"
            maxLength={20}
            placeholder="20 caracteres"
            value={reference}
            disabled={!editable}
            aria-invalid={notice?.kind === "reference"}
            onChange={(e) => {
              setReference(e.target.value);
              if (notice?.kind === "reference") setNotice(null);
            }}
            className="w-full rounded-base border border-hair bg-surface px-3 py-2 text-m tracking-wide text-ink tabular-nums uppercase disabled:bg-surface-2 disabled:text-muted"
          />
        </div>
        <Button variant="primary" disabled={!editable || busy} onClick={requestData}>
          {querying ? "Consultando…" : data ? "Volver a consultar" : "Obtener datos técnicos"}
        </Button>
      </div>

      <div aria-live="polite" className="flex flex-col gap-2">
        {notice?.kind === "reference" ? <Notice tone="warn">{notice.message}</Notice> : null}
        {notice?.kind === "error" ? (
          <Notice tone="bad" ref={noticeRef} tabIndex={-1}>
            <span className="flex flex-wrap items-center gap-3">
              {notice.message}
              {notice.manualRoute && !data ? (
                <Button size="sm" disabled={!editable} onClick={manualEntry}>
                  Introducir datos manualmente
                </Button>
              ) : null}
            </span>
          </Notice>
        ) : null}
        {unmappedLabels.length > 0 ? (
          <Notice tone="warn">{`No se pudieron rellenar: ${unmappedLabels.join(", ")}. Introdúcelos a mano.`}</Notice>
        ) : null}
        {data && queriedOn ? (
          <p className="text-xs text-muted">
            Consultado el {readableDate(queriedOn)} a través del servidor. Volver a consultar sustituye los datos de
            origen y conserva los manuales.
          </p>
        ) : null}
      </div>

      {data && byId ? (
        <>
          <VerificationSummary
            pending={countPending(data)}
            edited={countEdited(data)}
            disabled={!editable || busy}
            verifying={verifyingAll}
            onMarkAll={markAll}
          />
          <div className="grid grid-cols-2 items-start gap-4">
            {byGroup.map(({ group, definitions }) => (
              <GroupPanel
                key={group.id}
                group={group}
                definitions={definitions}
                data={byId}
                disabled={!editable || querying || verifyingAll}
                saving={saving}
                errors={rowErrors}
                onValueChange={onValueChange}
                onVerify={onVerify}
                onRestore={onRestore}
                onEditStart={onEditStart}
              />
            ))}
            <CapacityPanel capacity={capacity} />
          </div>
        </>
      ) : null}
    </Panel>
  );
}

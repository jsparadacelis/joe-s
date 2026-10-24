"use client";

import { useCallback, useId, useMemo, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Notice } from "@/components/ui/Notice";
import { Panel } from "@/components/ui/Panel";
import { calculateCapacity } from "@/lib/capacity";
import {
  DEFINITIONS,
  DATA_GROUPS,
  countEdited,
  countPending,
  isValidCadastralReference,
  markAllVerified,
  fetchTechnicalData,
  requery,
  restoreDatum,
  type TechnicalDatum,
  type TechnicalData,
} from "@/lib/technical-data";
import type { PhaseMode } from "@/lib/phases";
import { CapacityPanel } from "./CapacityPanel";
import { GroupPanel } from "./GroupPanel";
import { VerificationSummary } from "./VerificationSummary";

export type TechnicalDataEditorProps = {
  cadastralReference: string;
  initial: TechnicalData | null;
  mode: PhaseMode;
  /** Por defecto, el contrato de `lib/datos-tecnicos` (la consulta real va por la API del servidor). */
  query?: (cadastralReference: string) => Promise<TechnicalData>;
};

const MONTHS = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
const REFERENCE_NOTICE = "La referencia catastral debe tener 20 caracteres.";
const FAILURE_NOTICE = "No se pudo consultar. Puedes introducir los datos manualmente.";

function readableDate(iso: string): string {
  const [a, m, d] = iso.split("-").map(Number);
  return `${d} ${MONTHS[m - 1]} ${a}`;
}

/** Plantilla vacía para la ruta manual: ningún dato tiene origen, así que nada se marca como editado. */
function emptyData(): TechnicalDatum[] {
  return DEFINITIONS.map((d) => ({ id: d.id, value: "", original: null, verified: false }));
}

const byGroup = DATA_GROUPS.map((group) => ({ group, definitions: DEFINITIONS.filter((d) => d.group === group.id) }));

export function TechnicalDataEditor({
  cadastralReference,
  initial,
  mode,
  query = fetchTechnicalData,
}: TechnicalDataEditorProps) {
  const referenceId = useId();
  const editable = mode === "edit";
  const [reference, setReference] = useState(cadastralReference || initial?.cadastralReference || "");
  const [data, setData] = useState<TechnicalDatum[] | null>(initial?.data ?? null);
  const [queriedOn, setQueriedOn] = useState<string | null>(initial?.queriedOn ?? null);
  const [querying, setQuerying] = useState(false);
  const [notice, setNotice] = useState<"reference" | "failure" | null>(null);

  const update = useCallback((id: string, cambio: (d: TechnicalDatum) => TechnicalDatum) => {
    setData((prev) => (prev ? prev.map((d) => (d.id === id ? cambio(d) : d)) : prev));
  }, []);
  const onValueChange = useCallback((id: string, value: string) => update(id, (d) => ({ ...d, value })), [update]);
  const onVerify = useCallback(
    (id: string, verified: boolean) => update(id, (d) => ({ ...d, verified })),
    [update],
  );
  const onRestore = useCallback((id: string) => update(id, restoreDatum), [update]);
  const onMarkAll = useCallback(() => setData((prev) => (prev ? markAllVerified(prev) : prev)), []);

  async function pedirDatos() {
    if (!editable || querying) return;
    if (!isValidCadastralReference(reference)) {
      setNotice("reference");
      return;
    }
    setNotice(null);
    setQuerying(true);
    try {
      const result = await query(reference.trim());
      setData((prev) => (prev ? requery(prev, result.data) : result.data));
      setQueriedOn(result.queriedOn);
    } catch {
      setNotice("failure");
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

  if (!data && mode === "read-only") {
    return (
      <Panel title="Datos técnicos del inmueble">
        <p className="text-s text-muted">Sin datos técnicos registrados.</p>
      </Panel>
    );
  }

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
            aria-invalid={notice === "reference"}
            onChange={(e) => {
              setReference(e.target.value);
              if (notice === "reference") setNotice(null);
            }}
            className="w-full rounded-base border border-hair bg-surface px-3 py-2 text-m tracking-wide text-ink tabular-nums uppercase disabled:bg-surface-2 disabled:text-muted"
          />
        </div>
        <Button variant="primary" disabled={!editable || querying} onClick={pedirDatos}>
          {querying ? "Consultando…" : data ? "Volver a consultar" : "Obtener datos técnicos"}
        </Button>
      </div>

      <div aria-live="polite" className="flex flex-col gap-2">
        {notice === "reference" ? <Notice tone="warn">{REFERENCE_NOTICE}</Notice> : null}
        {notice === "failure" ? (
          <Notice tone="bad">
            <span className="flex flex-wrap items-center gap-3">
              {FAILURE_NOTICE}
              {!data ? (
                <Button size="sm" onClick={manualEntry}>
                  Introducir datos manualmente
                </Button>
              ) : null}
            </span>
          </Notice>
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
            disabled={!editable}
            onMarkAll={onMarkAll}
          />
          <div className="grid grid-cols-2 items-start gap-4">
            {byGroup.map(({ group, definitions }) => (
              <GroupPanel
                key={group.id}
                group={group}
                definitions={definitions}
                data={byId}
                disabled={!editable}
                onValueChange={onValueChange}
                onVerify={onVerify}
                onRestore={onRestore}
              />
            ))}
            <CapacityPanel capacity={capacity} />
          </div>
        </>
      ) : null}
    </Panel>
  );
}

"use client";

import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { ButtonLink } from "@/components/ui/ButtonLink";
import { ApiError } from "@/lib/api";
import { PHASES } from "@/lib/phases";
import { blockLabel, fieldLabel, promoteProjectSheet, type ProjectSheet, type PromoteResult } from "@/lib/sheet";

export interface PromotePanelProps {
  sheet: ProjectSheet;
  /** Promotes the project and freezes the sheet; replaceable in tests. */
  promote?: () => Promise<PromoteResult>;
  /** Called once on success; the parent swaps in the frozen sheet. */
  onPromoted?: (result: PromoteResult) => void;
}

type FocusTarget = "confirm" | "alert" | "promote" | "status";

const UNEXPECTED_MESSAGE = "Ocurrió un error inesperado. Inténtalo de nuevo.";
const STALE_MESSAGE = "El proyecto ya no está en Inicio: otra persona pudo haberlo promovido. Recarga la página.";
const TARGET_PHASE = PHASES[2];
const PROMOTE_LABEL = `Promover a ${TARGET_PHASE.id} · ${TARGET_PHASE.name}`;
const OK_NOTICE = "rounded-base bg-ok-soft px-3 py-2.5 text-s text-ok focus-visible:outline-2 focus-visible:outline-point";
const ALERT = "rounded-base bg-bad-soft px-3 py-2.5 text-s text-bad focus-visible:outline-2 focus-visible:outline-point";

export function PromotePanel({ sheet, promote, onPromoted }: PromotePanelProps) {
  const reasonId = useId();
  const router = useRouter();
  // The sheet on screen is out of date (the project already left phase 1): only reloading makes sense.
  const [stale, setStale] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ApiError | string | null>(null);
  const [promoted, setPromoted] = useState<PromoteResult | null>(null);
  const submitting = useRef(false);
  const pending = useRef<FocusTarget | null>(null);
  const promoteRef = useRef<HTMLButtonElement>(null);
  const confirmRef = useRef<HTMLButtonElement>(null);
  const alertRef = useRef<HTMLDivElement>(null);
  const statusRef = useRef<HTMLDivElement>(null);

  // Focus moves after the render that creates (or re-enables) the target.
  useEffect(() => {
    const target = pending.current;
    if (!target || busy) return;
    pending.current = null;
    ({ confirm: confirmRef, alert: alertRef, promote: promoteRef, status: statusRef })[target].current?.focus();
  });

  const doPromote = promote ?? (() => promoteProjectSheet(sheet.code));
  const { filled, required, percent } = sheet.completion;
  const missingCount = required - filled;
  const missingByBlock = sheet.blocks
    .map((b) => ({ block: b.block, fields: b.fields.filter((f) => f.required && f.value === null) }))
    .filter((g) => g.fields.length > 0);

  if (promoted) {
    const phase = PHASES[promoted.current_phase as 2];
    return (
      <section aria-label="Promoción a Briefing" className="flex flex-col items-start gap-3 rounded-base border border-hair p-3.5">
        <div ref={statusRef} role="status" tabIndex={-1} className={OK_NOTICE}>
          {`La ficha v${promoted.frozen_version} quedó congelada y el proyecto pasó a ${phase.name}`}
        </div>
        <ButtonLink href={`/projects/${encodeURIComponent(sheet.code)}/phase/${promoted.current_phase}`}>{`Ir a ${phase.name}`}</ButtonLink>
      </section>
    );
  }
  if (sheet.frozen_version !== null) return null;

  const reason = sheet.permissions.can_promote
    ? null
    : missingCount > 0
      ? missingCount === 1
        ? "Falta 1 campo obligatorio"
        : `Faltan ${missingCount} campos obligatorios`
      : "Solo un socio o un director puede promover";

  function close() {
    setConfirming(false);
    setError(null);
    pending.current = "promote";
  }

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === "Escape" && !busy) close();
  }

  async function confirm() {
    if (submitting.current) return;
    submitting.current = true;
    setError(null);
    setBusy(true);
    try {
      const result = await doPromote();
      setPromoted(result);
      setConfirming(false);
      pending.current = "status";
      onPromoted?.(result);
      // Server components (header, deliverable) still show phase 1 until they are fetched again.
      router.refresh();
    } catch (caught) {
      if (caught instanceof ApiError && caught.code === "sheet_not_editable") {
        setStale(true);
        setConfirming(false);
        setError(STALE_MESSAGE);
      } else {
        setError(caught instanceof ApiError ? caught : UNEXPECTED_MESSAGE);
      }
      pending.current = "alert";
    } finally {
      submitting.current = false;
      setBusy(false);
    }
  }

  if (stale) {
    return (
      <section aria-label="Promoción a Briefing" className="flex flex-col items-start gap-3 rounded-base border border-hair p-3.5">
        <div ref={alertRef} role="alert" tabIndex={-1} className={ALERT}>
          {STALE_MESSAGE}
        </div>
        <Button variant="primary" onClick={() => router.refresh()}>
          Recargar
        </Button>
      </section>
    );
  }

  const errorMessage = typeof error === "string" ? error : error?.message;
  const errorMissing = typeof error === "object" && error !== null ? error.missing : undefined;

  return (
    <section aria-label="Promoción a Briefing" className="flex flex-col gap-3 rounded-base border border-hair p-3.5">
      <p className="text-m">
        <strong className="font-semibold">{percent} %</strong> completa · {filled} de {required} campos obligatorios rellenos
      </p>
      {missingByBlock.length > 0 ? (
        <div className="text-s text-muted">
          <p>Faltan por rellenar:</p>
          <ul className="mt-1 flex flex-col gap-0.5">
            {missingByBlock.map((g) => (
              <li key={g.block}>
                <strong className="font-medium text-ink">{blockLabel(g.block)}</strong>
                {": "}
                {g.fields.map((f) => fieldLabel(f.field)).join(", ")}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      <p className="text-s text-muted">Promover es una decisión de la persona; solo un socio o un director pueden tomarla.</p>
      <div className="flex flex-wrap items-center gap-3">
        <Button
          ref={promoteRef}
          variant="primary"
          disabled={!sheet.permissions.can_promote || busy}
          aria-describedby={reason ? reasonId : undefined}
          onClick={() => {
            setConfirming(true);
            pending.current = "confirm";
          }}
        >
          {PROMOTE_LABEL}
        </Button>
        {reason ? (
          <p id={reasonId} className="text-s text-muted">
            {reason}
          </p>
        ) : null}
      </div>
      {confirming ? (
        <div
          role="group"
          aria-label="Confirmar promoción"
          onKeyDown={handleKeyDown}
          className="flex flex-col gap-3 rounded-base bg-surface-2 p-3.5"
        >
          <p className="text-s">{`Al promover a ${TARGET_PHASE.id} · ${TARGET_PHASE.name}, la ficha quedará congelada como versión 1 y no se podrá editar.`}</p>
          {errorMessage ? (
            <div ref={alertRef} role="alert" tabIndex={-1} className={ALERT}>
              <p>{errorMessage}</p>
              {errorMissing && errorMissing.length > 0 ? <p>{errorMissing.join(", ")}</p> : null}
            </div>
          ) : null}
          <div className="flex gap-3">
            <Button ref={confirmRef} variant="primary" disabled={busy} onClick={() => void confirm()}>
              {busy ? "Promoviendo…" : "Confirmar promoción"}
            </Button>
            <Button disabled={busy} onClick={close}>
              Cancelar
            </Button>
          </div>
        </div>
      ) : null}
    </section>
  );
}

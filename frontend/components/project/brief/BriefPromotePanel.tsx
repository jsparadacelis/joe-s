"use client";

import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { ButtonLink } from "@/components/ui/ButtonLink";
import { ApiError } from "@/lib/api";
import { BRIEF_FIELD_LABELS, REQUIRED_BRIEF_FIELDS, promoteBrief, type Brief, type PromoteBriefResult } from "@/lib/brief";
import { PHASES } from "@/lib/phases";

export interface BriefPromotePanelProps {
  brief: Brief;
  /** Promotes the project and freezes the brief; replaceable in tests. */
  promote?: () => Promise<PromoteBriefResult>;
  /** Called once on success; the parent swaps in the frozen brief. */
  onPromoted?: (result: PromoteBriefResult) => void;
}

type FocusTarget = "confirm" | "alert" | "promote" | "status";

const UNEXPECTED_MESSAGE = "Ocurrió un error inesperado. Inténtalo de nuevo.";
const TARGET_PHASE = PHASES[3];
const PROMOTE_LABEL = `Promover a ${TARGET_PHASE.id} · ${TARGET_PHASE.name}`;
const SECTION = "flex flex-col gap-3 rounded-base border border-hair p-3.5";
const OK_NOTICE = "rounded-base bg-ok-soft px-3 py-2.5 text-s text-ok focus-visible:outline-2 focus-visible:outline-point";
const ALERT = "rounded-base bg-bad-soft px-3 py-2.5 text-s text-bad focus-visible:outline-2 focus-visible:outline-point";

/** Phase 2 → 3: what is missing, the promote button with its reason and the confirmation. */
export function BriefPromotePanel({ brief, promote, onPromoted }: BriefPromotePanelProps) {
  const reasonId = useId();
  const router = useRouter();
  // The brief on screen is out of date (the project already left phase 2): only reloading makes sense.
  const [stale, setStale] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ApiError | string | null>(null);
  const [promoted, setPromoted] = useState<PromoteBriefResult | null>(null);
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

  if (promoted) {
    return (
      <section aria-label="Promoción a Anteproyecto" className={`${SECTION} items-start`}>
        <div ref={statusRef} role="status" tabIndex={-1} className={OK_NOTICE}>
          {`El brief v${promoted.frozen_version} quedó congelado y el proyecto pasó a ${TARGET_PHASE.name}`}
        </div>
        <ButtonLink href={`/projects/${encodeURIComponent(brief.code)}/phase/${promoted.current_phase}`}>{`Ir a ${TARGET_PHASE.name}`}</ButtonLink>
      </section>
    );
  }
  if (brief.frozen_version !== null) return null;

  const doPromote = promote ?? (() => promoteBrief(brief.code));
  const { completeness } = brief;
  const requirements = [
    ...REQUIRED_BRIEF_FIELDS.map((id) => ({ label: BRIEF_FIELD_LABELS[id], met: !completeness.missing.includes(BRIEF_FIELD_LABELS[id]) })),
    { label: "Datos técnicos obtenidos", met: completeness.technical_data_obtained },
    { label: "Aprobación del cliente registrada", met: completeness.client_approval_recorded },
  ];
  const missingCount = requirements.filter((r) => !r.met).length;
  const reason = brief.permissions.can_promote
    ? null
    : missingCount > 0
      ? missingCount === 1
        ? "Falta 1 requisito"
        : `Faltan ${missingCount} requisitos`
      : "Solo el director de proyecto de este proyecto puede promover";

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
      // Server components (header, deliverable) still show phase 2 until they are fetched again.
      router.refresh();
    } catch (caught) {
      if (caught instanceof ApiError && caught.code === "brief_not_editable") {
        setStale(true);
        setConfirming(false);
      }
      setError(caught instanceof ApiError ? caught : UNEXPECTED_MESSAGE);
      pending.current = "alert";
    } finally {
      submitting.current = false;
      setBusy(false);
    }
  }

  const errorMessage = typeof error === "string" ? error : error?.message;
  const errorMissing = typeof error === "object" && error !== null ? error.missing : undefined;
  const alert = errorMessage ? (
    <div ref={alertRef} role="alert" tabIndex={-1} className={ALERT}>
      <p>{errorMessage}</p>
      {errorMissing && errorMissing.length > 0 ? (
        <ul className="mt-1 list-disc pl-5">
          {errorMissing.map((label) => (
            <li key={label}>{label}</li>
          ))}
        </ul>
      ) : null}
    </div>
  ) : null;

  if (stale) {
    return (
      <section aria-label="Promoción a Anteproyecto" className={`${SECTION} items-start`}>
        {alert}
        <Button variant="primary" onClick={() => router.refresh()}>
          Recargar
        </Button>
      </section>
    );
  }

  return (
    <section aria-label="Promoción a Anteproyecto" className={SECTION}>
      <ul aria-label="Requisitos" className="flex flex-col gap-1 text-s">
        {requirements.map((r) => (
          <li key={r.label} className="flex gap-2">
            <span className={`w-16 shrink-0 font-medium ${r.met ? "text-ok" : "text-bad"}`}>{r.met ? "Cumplido" : "Falta"}</span>
            <span>{r.label}</span>
          </li>
        ))}
      </ul>
      <p className="text-s text-muted">Promover es una decisión de la persona; solo el director de proyecto puede tomarla.</p>
      <div className="flex flex-wrap items-center gap-3">
        <Button
          ref={promoteRef}
          variant="primary"
          disabled={!brief.permissions.can_promote || busy}
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
        <div role="group" aria-label="Confirmar promoción" onKeyDown={handleKeyDown} className="flex flex-col gap-3 rounded-base bg-surface-2 p-3.5">
          <p className="text-s">{`Al promover a ${TARGET_PHASE.id} · ${TARGET_PHASE.name}, el brief quedará congelado como versión 1 y no se podrá editar.`}</p>
          {alert}
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

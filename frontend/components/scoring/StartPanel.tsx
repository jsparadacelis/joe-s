"use client";

import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import { Button } from "@/components/ui/Button";
import { ButtonLink } from "@/components/ui/ButtonLink";
import { Notice } from "@/components/ui/Notice";
import { Panel } from "@/components/ui/Panel";
import { ApiError } from "@/lib/api";
import { PHASES } from "@/lib/phases";
import { SCALES, SCALE_LABELS, type ProjectType, type Scale } from "@/lib/plan-settings";
import {
  doNotPursue,
  fetchProposedPlan,
  isValidWeek,
  startProject,
  totalWeeks,
  validateWeeks,
  type ProposedPlan,
  type StartResult,
  type Transition,
} from "@/lib/start";

export interface StartPanelProps {
  code: string;
  projectType: ProjectType;
  /** Loads the proposed plan of a scale; replaceable in tests. */
  loadPlan?: (scale: Scale) => Promise<ProposedPlan>;
  /** Confirms the plan and promotes the project; replaceable in tests. */
  start?: (scale: Scale, weeks: number[]) => Promise<StartResult>;
  /** Discards the opportunity with a reason; replaceable in tests. */
  discard?: (reason: string) => Promise<Transition>;
}

type Decision = "promote" | "discard";
type FocusTarget = "confirm" | "reason" | "alert" | "promote" | "discard" | "status";
type Outcome = { kind: "promoted"; result: StartResult } | { kind: "discarded" };

const UNEXPECTED_MESSAGE = "Ocurrió un error inesperado. Inténtalo de nuevo.";
const REASON_MESSAGE = "El campo «Motivo» es obligatorio.";
const DECISION_TEXT = "Promover o descartar es una decisión de la persona; solo un socio o un director pueden tomarla.";
const TARGET_PHASE = PHASES[1];
const WEEK_PHASES = PHASES.slice(1);
const CONTROL = "rounded-base border bg-surface px-3 py-2 text-m text-ink";
const OK_NOTICE = "rounded-base bg-ok-soft px-3 py-2.5 text-s text-ok focus-visible:outline-2 focus-visible:outline-point";
const ALERT = "rounded-base bg-bad-soft px-3 py-2.5 text-s text-bad focus-visible:outline-2 focus-visible:outline-point";

const errorMessage = (error: unknown) => (error instanceof ApiError ? error.message : UNEXPECTED_MESSAGE);
const toNumber = (draft: string) => (draft.trim() === "" ? NaN : Number(draft));

export function StartPanel({ code, projectType, loadPlan, start, discard }: StartPanelProps) {
  const idPrefix = useId();
  const [scale, setScale] = useState<Scale | null>(null);
  const [weeks, setWeeks] = useState<string[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [decision, setDecision] = useState<Decision | null>(null);
  const [weekError, setWeekError] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [reasonError, setReasonError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [outcome, setOutcome] = useState<Outcome | null>(null);

  const submitting = useRef(false);
  const loadToken = useRef(0);
  const pending = useRef<FocusTarget | null>(null);
  const weekRefs = useRef<(HTMLInputElement | null)[]>([]);
  const reasonRef = useRef<HTMLTextAreaElement>(null);
  const alertRef = useRef<HTMLDivElement>(null);
  const statusRef = useRef<HTMLDivElement>(null);
  const confirmRef = useRef<HTMLButtonElement>(null);
  const promoteRef = useRef<HTMLButtonElement>(null);
  const discardRef = useRef<HTMLButtonElement>(null);

  // Focus moves after the render that creates (or re-enables) the target.
  useEffect(() => {
    const target = pending.current;
    if (!target || busy) return;
    pending.current = null;
    const elements = {
      confirm: confirmRef.current,
      reason: reasonRef.current,
      alert: alertRef.current,
      status: statusRef.current,
      promote: promoteRef.current,
      discard: discardRef.current,
    };
    elements[target]?.focus();
  });

  const doLoad = loadPlan ?? ((s: Scale) => fetchProposedPlan(projectType, s));
  const doStart = start ?? ((s: Scale, w: number[]) => startProject(code, s, w));
  const doDiscard = discard ?? ((r: string) => doNotPursue(code, r));

  const numbers = weeks ? weeks.map(toNumber) : null;
  const total = numbers && validateWeeks(numbers) === null ? totalWeeks(numbers) : null;
  const done = outcome !== null;
  const weekErrorId = `${idPrefix}-weeks-error`;
  const reasonErrorId = `${idPrefix}-reason-error`;

  async function chooseScale(next: Scale) {
    const token = ++loadToken.current;
    setScale(next);
    setWeeks(null);
    setLoadError(null);
    setWeekError(null);
    setActionError(null);
    setDecision(null);
    setLoading(true);
    try {
      const plan = await doLoad(next);
      if (token === loadToken.current) setWeeks(plan.weeksByPhase.map(String));
    } catch (error) {
      if (token === loadToken.current) setLoadError(errorMessage(error));
    } finally {
      if (token === loadToken.current) setLoading(false);
    }
  }

  function editWeek(index: number, value: string) {
    setWeeks((current) => (current ? current.map((w, i) => (i === index ? value : w)) : current));
    setWeekError(null);
  }

  /** Marks and focuses the first invalid week; returns true when there is one. */
  function rejectInvalidWeeks(): boolean {
    const firstInvalid = numbers?.findIndex((w) => !isValidWeek(w)) ?? -1;
    if (!numbers || firstInvalid < 0) return false;
    setWeekError(validateWeeks(numbers));
    weekRefs.current[firstInvalid]?.focus();
    return true;
  }

  function open(next: Decision) {
    setActionError(null);
    setWeekError(null);
    setReasonError(null);
    if (next === "promote") {
      if (rejectInvalidWeeks()) {
        setDecision(null);
        return;
      }
      pending.current = "confirm";
    } else {
      pending.current = "reason";
    }
    setDecision(next);
  }

  function close(returnTo: FocusTarget) {
    setDecision(null);
    setActionError(null);
    setReasonError(null);
    pending.current = returnTo;
  }

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>, returnTo: FocusTarget) {
    if (event.key === "Escape" && !busy) close(returnTo);
  }

  async function confirmPromotion() {
    if (submitting.current || !scale || !numbers) return;
    // The weeks stay editable while the confirmation is open, so they are checked again before sending.
    if (rejectInvalidWeeks()) return;
    submitting.current = true;
    setActionError(null);
    setBusy(true);
    try {
      const result = await doStart(scale, numbers);
      setOutcome({ kind: "promoted", result });
      setDecision(null);
      pending.current = "status";
    } catch (error) {
      setActionError(errorMessage(error));
      pending.current = "alert";
    } finally {
      submitting.current = false;
      setBusy(false);
    }
  }

  async function confirmDiscard() {
    if (submitting.current) return;
    const trimmed = reason.trim();
    if (trimmed === "") {
      setReasonError(REASON_MESSAGE);
      reasonRef.current?.focus();
      return;
    }
    setReasonError(null);
    submitting.current = true;
    setActionError(null);
    setBusy(true);
    try {
      await doDiscard(trimmed);
      setOutcome({ kind: "discarded" });
      setDecision(null);
      pending.current = "status";
    } catch (error) {
      setActionError(errorMessage(error));
      pending.current = "alert";
    } finally {
      submitting.current = false;
      setBusy(false);
    }
  }

  const actionAlert = actionError ? (
    <div ref={alertRef} role="alert" tabIndex={-1} className={ALERT}>
      {actionError}
    </div>
  ) : null;

  const promoteLabel = `Promover a ${TARGET_PHASE.id} · ${TARGET_PHASE.name}`;
  const canPromote = scale !== null && weeks !== null && !loading && !busy;

  return (
    <div className="mt-3.5">
      <Panel
        title="Plan propuesto"
        description="El plan sale de la plantilla de la tipología y la escala; puedes ajustar las semanas antes de promover."
      >
        <fieldset disabled={done} className="flex min-w-0 flex-col gap-2 border-0 p-0">
          <legend className="mb-1.5 text-s font-medium">Escala</legend>
          <div className="flex flex-wrap gap-4">
            {SCALES.map((value) => (
              <label key={value} className="flex items-center gap-2 text-m">
                <input
                  type="radio"
                  name={`${idPrefix}-scale`}
                  value={value}
                  checked={scale === value}
                  onChange={() => void chooseScale(value)}
                  className="accent-point"
                />
                <span>{SCALE_LABELS[value]}</span>
              </label>
            ))}
          </div>
        </fieldset>

        {scale === null ? <p className="text-s text-muted">Elige una escala para ver el plan propuesto.</p> : null}
        {loading ? <p className="text-s text-muted">Cargando plan…</p> : null}
        {loadError ? <Notice tone="bad">{loadError}</Notice> : null}

        {weeks ? (
          <div className="flex flex-col gap-3">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {WEEK_PHASES.map((phase, index) => (
                <div key={phase.id} className="flex flex-col gap-1.5">
                  <label htmlFor={`${idPrefix}-week-${phase.id}`} className="text-s font-medium">
                    {`Semanas de ${phase.name}`}
                  </label>
                  <input
                    id={`${idPrefix}-week-${phase.id}`}
                    ref={(el) => {
                      weekRefs.current[index] = el;
                    }}
                    type="number"
                    inputMode="numeric"
                    value={weeks[index]}
                    readOnly={done}
                    onChange={(e) => editWeek(index, e.target.value)}
                    aria-invalid={weekError && !isValidWeek(toNumber(weeks[index])) ? true : undefined}
                    aria-describedby={weekError && !isValidWeek(toNumber(weeks[index])) ? weekErrorId : undefined}
                    className={`${CONTROL} ${weekError && !isValidWeek(toNumber(weeks[index])) ? "border-bad" : "border-hair"}`}
                  />
                </div>
              ))}
            </div>
            {weekError ? (
              <p id={weekErrorId} role="alert" className="text-s text-bad">
                {weekError}
              </p>
            ) : null}
            <p className="text-m font-semibold tabular-nums">{total === null ? "Total: —" : `Total: ${total} semanas`}</p>
          </div>
        ) : null}

        <p className="text-s text-muted">{DECISION_TEXT}</p>

        {outcome?.kind === "promoted" ? (
          <div className="flex flex-col items-start gap-3">
            <div ref={statusRef} role="status" tabIndex={-1} className={OK_NOTICE}>
              {`Proyecto promovido a ${outcome.result.currentPhase} · ${PHASES[outcome.result.currentPhase].name}. Se congeló la versión ${outcome.result.frozenVersion} del scoring y el plan.`}
            </div>
            <ButtonLink href={`/projects/${encodeURIComponent(code)}/phase/${outcome.result.currentPhase}`}>
              {`Ir a ${PHASES[outcome.result.currentPhase].name}`}
            </ButtonLink>
          </div>
        ) : null}
        {outcome?.kind === "discarded" ? (
          <div ref={statusRef} role="status" tabIndex={-1} className={OK_NOTICE}>
            Oportunidad descartada: no perseguir.
          </div>
        ) : null}

        {!done ? (
          <>
            <div className="flex flex-wrap items-center gap-3">
              <Button ref={promoteRef} variant="primary" disabled={!canPromote} onClick={() => open("promote")}>
                {promoteLabel}
              </Button>
              <Button ref={discardRef} disabled={busy} onClick={() => open("discard")}>
                No perseguir
              </Button>
            </div>
            {scale === null ? <p className="text-s text-muted">Elige una escala para promover.</p> : null}

            {decision === "promote" ? (
              <div
                role="group"
                aria-label="Confirmar promoción"
                onKeyDown={(e) => handleKeyDown(e, "promote")}
                className="flex flex-col gap-3 rounded-base bg-surface-2 p-3.5"
              >
                <p className="text-s">
                  {`Al promover a ${TARGET_PHASE.id} · ${TARGET_PHASE.name}, el scoring y el plan quedarán congelados y no se podrán editar.`}
                </p>
                {actionAlert}
                <div className="flex gap-3">
                  <Button ref={confirmRef} variant="primary" disabled={busy} onClick={() => void confirmPromotion()}>
                    {busy ? "Promoviendo…" : "Confirmar promoción"}
                  </Button>
                  <Button disabled={busy} onClick={() => close("promote")}>
                    Cancelar
                  </Button>
                </div>
              </div>
            ) : null}

            {decision === "discard" ? (
              <div
                role="group"
                aria-label="Descartar oportunidad"
                onKeyDown={(e) => handleKeyDown(e, "discard")}
                className="flex flex-col gap-3 rounded-base bg-surface-2 p-3.5"
              >
                <div className="flex flex-col gap-1.5">
                  <label htmlFor={`${idPrefix}-reason`} className="text-s font-medium">
                    Motivo
                  </label>
                  <textarea
                    id={`${idPrefix}-reason`}
                    ref={reasonRef}
                    required
                    rows={3}
                    value={reason}
                    onChange={(e) => {
                      setReason(e.target.value);
                      setReasonError(null);
                    }}
                    aria-invalid={reasonError ? true : undefined}
                    aria-describedby={reasonError ? reasonErrorId : undefined}
                    className={`${CONTROL} w-full ${reasonError ? "border-bad" : "border-hair"}`}
                  />
                  {reasonError ? (
                    <p id={reasonErrorId} role="alert" className="text-s text-bad">
                      {reasonError}
                    </p>
                  ) : null}
                </div>
                {actionAlert}
                <div className="flex gap-3">
                  <Button variant="primary" disabled={busy} onClick={() => void confirmDiscard()}>
                    {busy ? "Guardando…" : "Confirmar no perseguir"}
                  </Button>
                  <Button disabled={busy} onClick={() => close("discard")}>
                    Cancelar
                  </Button>
                </div>
              </div>
            ) : null}
          </>
        ) : null}
      </Panel>
    </div>
  );
}

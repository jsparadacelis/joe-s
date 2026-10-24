"use client";

import { useEffect, useId, useRef, useState, type ChangeEvent, type FormEvent, type ReactNode } from "react";
import { Button } from "@/components/ui/Button";
import { Notice } from "@/components/ui/Notice";
import { Panel } from "@/components/ui/Panel";
import { StatusChip } from "@/components/ui/StatusChip";
import { Table, type TableColumn } from "@/components/ui/Table";
import { ApiError } from "@/lib/api";
import { PHASES } from "@/lib/phases";
import {
  PAUSE_FIELDS,
  PAUSE_FIELD_FROM_API,
  PAUSE_FIELD_LABELS,
  PAUSE_REASONS,
  overdueText,
  pauseProject,
  resumeProject,
  todayUtc,
  validatePause,
  type PauseDraft,
  type PauseErrors,
  type PauseField,
  type ProjectPause,
  type ProjectPauses,
} from "@/lib/pauses";
import { REASON_LABEL, formatDate, type PauseReason } from "@/lib/timing";

export interface PauseManagerProps {
  code: string;
  initial: ProjectPauses;
  /** Opens a pause; replaceable in tests. */
  pauseAction?: (reason: PauseReason, expectedResumption: string) => Promise<ProjectPause>;
  /** Closes the open pause; replaceable in tests. */
  resumeAction?: () => Promise<ProjectPause>;
  /** Today (ISO, UTC); by default the real one at the moment of each submit. */
  today?: string;
}

type FocusTarget = "reason" | "opener" | "resume" | "confirm" | "panel" | "alert";

const UNEXPECTED_MESSAGE = "Ocurrió un error inesperado. Inténtalo de nuevo.";
const CONTROL = "w-full rounded-base border bg-surface px-3 py-2 text-m text-ink";
const EMPTY_DRAFT: PauseDraft = { reason: "", expectedResumption: "" };

const HISTORY_COLUMNS: TableColumn<ProjectPause>[] = [
  {
    key: "period",
    header: "Desde – Hasta",
    render: (p) => `${formatDate(p.startedOn)} – ${p.resumedOn ? formatDate(p.resumedOn) : "en curso"}`,
  },
  { key: "phase", header: "Fase", render: (p) => PHASES[p.phase].name },
  { key: "reason", header: "Motivo", render: (p) => REASON_LABEL[p.reason] },
  { key: "expected", header: "Reanudación prevista", render: (p) => formatDate(p.expectedResumption) },
];

export function PauseManager({ code, initial, pauseAction, resumeAction, today }: PauseManagerProps) {
  const idPrefix = useId();
  const [active, setActive] = useState(initial.active);
  const [history, setHistory] = useState(initial.history);
  const [formOpen, setFormOpen] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [draft, setDraft] = useState<PauseDraft>(EMPTY_DRAFT);
  const [errors, setErrors] = useState<PauseErrors>({});
  const [actionError, setActionError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState<string | null>(null);

  const submitting = useRef(false);
  const pending = useRef<FocusTarget | null>(null);
  const reasonRef = useRef<HTMLSelectElement>(null);
  const dateRef = useRef<HTMLInputElement>(null);
  const openerRef = useRef<HTMLButtonElement>(null);
  const resumeRef = useRef<HTMLButtonElement>(null);
  const confirmRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLHeadingElement>(null);
  const alertRef = useRef<HTMLDivElement>(null);

  // Focus is moved after the render that creates the target (and only once per request).
  useEffect(() => {
    const target = pending.current;
    if (!target) return;
    pending.current = null;
    const element = {
      reason: reasonRef.current,
      opener: openerRef.current,
      resume: resumeRef.current,
      confirm: confirmRef.current,
      panel: panelRef.current,
      alert: alertRef.current,
    }[target];
    element?.focus();
  });

  const doPause = pauseAction ?? ((reason, date) => pauseProject(code, reason, date));
  const doResume = resumeAction ?? (() => resumeProject(code));

  const fieldRef = (field: PauseField) => (field === "reason" ? reasonRef : dateRef);

  const update = (field: PauseField) => (event: ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { value } = event.target;
    setDraft((current) => ({ ...current, [field]: value }));
    setErrors((current) => (current[field] ? { ...current, [field]: undefined } : current));
  };

  function showError(error: unknown) {
    setActionError(error instanceof ApiError ? error.message : UNEXPECTED_MESSAGE);
    pending.current = "alert";
  }

  function openForm() {
    setDone(null);
    setFormOpen(true);
    pending.current = "reason";
  }

  function closeForm() {
    setFormOpen(false);
    setDraft(EMPTY_DRAFT);
    setErrors({});
    setActionError(null);
    pending.current = "opener";
  }

  async function handlePause(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting.current) return;

    const found = validatePause(draft, today ?? todayUtc());
    const firstInvalid = PAUSE_FIELDS.find((field) => found[field] !== undefined);
    setErrors(found);
    setActionError(null);
    if (firstInvalid) {
      fieldRef(firstInvalid).current?.focus();
      return;
    }

    submitting.current = true;
    setSaving(true);
    try {
      const created = await doPause(draft.reason as PauseReason, draft.expectedResumption);
      setActive(created);
      setFormOpen(false);
      setDraft(EMPTY_DRAFT);
      setDone("Pausa registrada: el reloj del proyecto está parado.");
      pending.current = "panel";
    } catch (error) {
      const field = error instanceof ApiError && error.field ? PAUSE_FIELD_FROM_API[error.field] : undefined;
      if (error instanceof ApiError && field) {
        setErrors({ [field]: error.message });
        fieldRef(field).current?.focus();
      } else {
        showError(error);
      }
    } finally {
      submitting.current = false;
      setSaving(false);
    }
  }

  async function handleResume() {
    if (submitting.current) return;
    submitting.current = true;
    setSaving(true);
    setActionError(null);
    try {
      const closed = await doResume();
      setActive(null);
      setHistory((current) => [closed, ...current]);
      setConfirming(false);
      setDone("Proyecto reanudado: el reloj vuelve a correr.");
      pending.current = "opener";
    } catch (error) {
      showError(error);
    } finally {
      submitting.current = false;
      setSaving(false);
    }
  }

  const ids = (field: PauseField) => ({
    control: `${idPrefix}-${field}`,
    error: `${idPrefix}-${field}-error`,
  });

  function controlProps(field: PauseField) {
    const { control, error } = ids(field);
    return {
      id: control,
      name: field,
      value: draft[field],
      onChange: update(field),
      required: true,
      "aria-invalid": errors[field] ? (true as const) : undefined,
      "aria-describedby": errors[field] ? error : undefined,
      className: `${CONTROL} ${errors[field] ? "border-bad" : "border-hair"}`,
    };
  }

  function renderField(field: PauseField, control: ReactNode) {
    const { control: id, error } = ids(field);
    return (
      <div className="flex flex-col gap-1.5">
        <label htmlFor={id} className="text-s font-medium">
          {PAUSE_FIELD_LABELS[field]}
        </label>
        {control}
        {errors[field] ? (
          <p id={error} role="alert" className="text-s text-bad">
            {errors[field]}
          </p>
        ) : null}
      </div>
    );
  }

  const actionAlert = actionError ? (
    <div
      ref={alertRef}
      role="alert"
      tabIndex={-1}
      className="rounded-base bg-bad-soft px-3 py-2.5 text-s text-bad focus-visible:outline-2 focus-visible:outline-point"
    >
      {actionError}
    </div>
  ) : null;

  return (
    <div className="flex flex-col gap-3.5">
      {done ? <Notice tone="ok">{done}</Notice> : null}

      {active ? (
        <section className="flex min-w-0 flex-col gap-3.5 rounded-base border border-hair bg-surface p-[18px]">
          <h2 ref={panelRef} tabIndex={-1} className="text-l font-semibold focus-visible:outline-2 focus-visible:outline-point">
            Pausa activa
          </h2>
          <dl className="grid grid-cols-3 gap-3.5">
            <div className="flex flex-col gap-1">
              <dt className="text-xs font-medium text-muted">Motivo</dt>
              <dd className="text-m">{REASON_LABEL[active.reason]}</dd>
            </div>
            <div className="flex flex-col gap-1">
              <dt className="text-xs font-medium text-muted">Desde</dt>
              <dd className="text-m tabular-nums">{formatDate(active.startedOn)}</dd>
            </div>
            <div className="flex flex-col gap-1">
              <dt className="text-xs font-medium text-muted">Reanudación prevista</dt>
              <dd className="flex flex-wrap items-center gap-2 text-m">
                <span className="tabular-nums">{formatDate(active.expectedResumption)}</span>
                {active.overdue ? <StatusChip tone="bad">{overdueText(active.daysOverdue)}</StatusChip> : null}
              </dd>
            </div>
          </dl>
          {actionAlert}
          {confirming ? (
            <div role="group" aria-label="Confirmar reanudación" className="flex flex-col gap-2.5 rounded-base bg-surface-2 p-3.5">
              <p className="text-s">
                Al reanudar se cierra la pausa y el reloj del proyecto volverá a correr. La acción queda registrada.
              </p>
              <div className="flex items-center gap-3">
                <Button ref={confirmRef} variant="primary" disabled={saving} onClick={handleResume}>
                  {saving ? "Guardando…" : "Confirmar reanudación"}
                </Button>
                <Button
                  disabled={saving}
                  onClick={() => {
                    setConfirming(false);
                    setActionError(null);
                    pending.current = "resume";
                  }}
                >
                  Cancelar
                </Button>
              </div>
            </div>
          ) : (
            <div>
              <Button
                ref={resumeRef}
                variant="primary"
                onClick={() => {
                  setDone(null);
                  setConfirming(true);
                  pending.current = "confirm";
                }}
              >
                Reanudar
              </Button>
            </div>
          )}
        </section>
      ) : (
        <Panel title="Pausa del proyecto" description="El proyecto no está en pausa: el reloj de la fase sigue corriendo.">
          {formOpen ? (
            <form aria-label="Pausar proyecto" aria-busy={saving} noValidate onSubmit={handlePause} className="flex flex-col gap-4">
              <div className="grid gap-4 md:grid-cols-2">
                {renderField(
                  "reason",
                  <select ref={reasonRef} {...controlProps("reason")}>
                    <option value="">Selecciona un motivo</option>
                    {PAUSE_REASONS.map((reason) => (
                      <option key={reason} value={reason}>
                        {REASON_LABEL[reason]}
                      </option>
                    ))}
                  </select>,
                )}
                {renderField(
                  "expectedResumption",
                  <input ref={dateRef} type="date" min={today ?? todayUtc()} {...controlProps("expectedResumption")} />,
                )}
              </div>
              {actionAlert}
              <div className="flex items-center gap-3">
                <Button type="submit" variant="primary" disabled={saving}>
                  {saving ? "Guardando…" : "Guardar pausa"}
                </Button>
                <Button disabled={saving} onClick={closeForm}>
                  Cancelar
                </Button>
              </div>
            </form>
          ) : (
            <div>
              <Button ref={openerRef} onClick={openForm}>
                Pausar proyecto
              </Button>
            </div>
          )}
        </Panel>
      )}

      <Panel title="Historial de pausas" description="Pausas cerradas, de la más reciente a la más antigua.">
        <Table
          caption="Historial de pausas del proyecto"
          columns={HISTORY_COLUMNS}
          rows={history}
          getRowKey={(p) => p.id}
          emptyMessage="Sin pausas registradas"
        />
      </Panel>
    </div>
  );
}

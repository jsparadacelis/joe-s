"use client";

import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { ApiError } from "@/lib/api";
import {
  BRIEF_FIELD_IDS,
  BRIEF_FIELD_LABELS,
  CLIENT_APPROVALS,
  CLIENT_APPROVAL_LABELS,
  REQUIRED_BRIEF_FIELDS,
  parseBudget,
  saveBrief,
  validateBriefField,
  type Brief,
  type BriefFieldId,
  type BriefUpdate,
} from "@/lib/brief";

export interface BriefFormProps {
  brief: Brief;
  /** Saves the changed fields; replaceable in tests. */
  save?: (update: BriefUpdate) => Promise<Brief>;
  /** Called with the brief the API returned, once per successful save. */
  onSaved?: (brief: Brief) => void;
}

type Drafts = Record<BriefFieldId, string>;
type FocusTarget = BriefFieldId | "status" | "alert";

const UNEXPECTED_MESSAGE = "Ocurrió un error inesperado. Inténtalo de nuevo.";
const DEADLINE_INCOMPLETE = "El plazo debe ser una fecha real con el formato AAAA-MM-DD, entre los años 2000 y 2100.";
const TEXTAREAS: readonly BriefFieldId[] = ["needs", "program", "constraints", "topographic_survey", "alignment"];
const CONTROL = "w-full rounded-base border bg-surface px-3 py-2 text-m text-ink";
const ALERT = "rounded-base bg-bad-soft px-3 py-2.5 text-s text-bad focus-visible:outline-2 focus-visible:outline-point";
const STATUS = "rounded-base bg-surface-2 px-3 py-2.5 text-s focus-visible:outline-2 focus-visible:outline-point";
const euros = new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR", maximumFractionDigits: 2 });

function toDrafts(brief: Brief): Drafts {
  const { fields } = brief;
  const draft = (value: string | number | null) => (value === null ? "" : String(value));
  return {
    needs: draft(fields.needs),
    program: draft(fields.program),
    constraints: draft(fields.constraints),
    target_budget: draft(fields.target_budget),
    deadline: draft(fields.deadline),
    topographic_survey: draft(fields.topographic_survey),
    alignment: draft(fields.alignment),
    client_approval: fields.client_approval,
  };
}

/** Read-only text of a field. */
function displayValue(brief: Brief, id: BriefFieldId): string {
  const value = brief.fields[id];
  if (value === null || value === "") return "Sin rellenar";
  if (id === "target_budget") return euros.format(value as number);
  if (id === "client_approval") return CLIENT_APPROVAL_LABELS[value as keyof typeof CLIENT_APPROVAL_LABELS] ?? String(value);
  if (id === "deadline") return String(value).split("-").reverse().join("/");
  return String(value);
}

export function BriefForm({ brief: incoming, save, onSaved }: BriefFormProps) {
  const idPrefix = useId();
  const router = useRouter();
  const [current, setCurrent] = useState(incoming);
  const [seen, setSeen] = useState(incoming);
  const [drafts, setDrafts] = useState<Drafts>(() => toDrafts(incoming));
  // A new brief handed in by the parent replaces the one held here (adjusting state while rendering).
  if (seen !== incoming) {
    setSeen(incoming);
    setCurrent(incoming);
    setDrafts(toDrafts(incoming));
  }
  const [errors, setErrors] = useState<Partial<Record<BriefFieldId, string>>>({});
  const [status, setStatus] = useState<string | null>(null);
  const [alertText, setAlertText] = useState<string | null>(null);
  const [locked, setLocked] = useState(false);
  const [stale, setStale] = useState(false);
  const [busy, setBusy] = useState(false);
  const submitting = useRef(false);
  const pending = useRef<FocusTarget | null>(null);
  const controlRefs = useRef<Partial<Record<BriefFieldId, HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement | null>>>({});
  const statusRef = useRef<HTMLDivElement>(null);
  const alertRef = useRef<HTMLDivElement>(null);

  // Focus moves once the controls are enabled again (a disabled control cannot take it).
  useEffect(() => {
    const target = pending.current;
    if (!target || busy) return;
    pending.current = null;
    const element = target === "status" ? statusRef.current : target === "alert" ? alertRef.current : controlRefs.current[target];
    element?.focus();
  });

  const editable = current.permissions.can_edit && !locked;
  const doSave = save ?? ((update: BriefUpdate) => saveBrief(current.code, update));
  const baseline = toDrafts(current);

  function edit(id: BriefFieldId, value: string) {
    setDrafts((previous) => ({ ...previous, [id]: value }));
    setErrors((previous) => {
      if (!(id in previous)) return previous;
      const next = { ...previous };
      delete next[id];
      return next;
    });
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (submitting.current) return;
    setAlertText(null);
    const changed = BRIEF_FIELD_IDS.filter((id) =>
      id === "client_approval" ? drafts[id] !== baseline[id] : drafts[id].trim() !== baseline[id].trim(),
    );
    if (changed.length === 0) {
      setErrors({});
      setStatus("No hay cambios que guardar");
      return;
    }
    const found: Partial<Record<BriefFieldId, string>> = {};
    for (const id of changed) {
      // A half-typed date reads as empty: it must not erase the previous date.
      const problem =
        id === "deadline" && controlRefs.current[id]?.validity?.badInput ? DEADLINE_INCOMPLETE : validateBriefField(id, drafts[id]);
      if (problem) found[id] = problem;
    }
    const firstInvalid = changed.find((id) => found[id]);
    setErrors(found);
    if (firstInvalid) {
      setStatus(null);
      controlRefs.current[firstInvalid]?.focus();
      return;
    }
    const fields: Record<string, string | number | null> = {};
    for (const id of changed) {
      const trimmed = drafts[id].trim();
      if (id === "target_budget") fields[id] = parseBudget(trimmed);
      else if (id === "client_approval") fields[id] = drafts[id];
      else fields[id] = trimmed === "" ? null : trimmed;
    }
    submitting.current = true;
    setStatus(null);
    setBusy(true);
    try {
      const saved = await doSave({ fields } as BriefUpdate);
      setCurrent(saved);
      setDrafts(toDrafts(saved));
      setStatus("Brief guardado");
      pending.current = "status";
      onSaved?.(saved);
    } catch (caught) {
      if (caught instanceof ApiError && caught.status === 422 && caught.code === "invalid_field" && caught.field && (BRIEF_FIELD_IDS as readonly string[]).includes(caught.field)) {
        const field = caught.field as BriefFieldId;
        setErrors({ [field]: caught.message });
        pending.current = field;
      } else {
        setAlertText(caught instanceof ApiError ? caught.message : UNEXPECTED_MESSAGE);
        pending.current = "alert";
        if (caught instanceof ApiError && caught.status === 403) setLocked(true);
        if (caught instanceof ApiError && caught.status === 409 && caught.code === "brief_not_editable") {
          setLocked(true);
          setStale(true);
        }
      }
    } finally {
      submitting.current = false;
      setBusy(false);
    }
  }

  const notices = (
    <>
      {status ? (
        <div ref={statusRef} role="status" tabIndex={-1} className={STATUS}>
          {status}
        </div>
      ) : null}
      {alertText ? (
        <div ref={alertRef} role="alert" tabIndex={-1} className={ALERT}>
          {alertText}
        </div>
      ) : null}
      {stale ? (
        <div>
          <Button variant="primary" onClick={() => router.refresh()}>
            Recargar
          </Button>
        </div>
      ) : null}
    </>
  );

  if (!editable) {
    return (
      <div className="flex flex-col gap-3">
        {notices}
        <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
          {BRIEF_FIELD_IDS.map((id) => (
            <div key={id} className="flex min-w-0 flex-col gap-0.5">
              <dt className="text-s font-medium text-muted">{BRIEF_FIELD_LABELS[id]}</dt>
              <dd className="whitespace-pre-line text-m">{displayValue(current, id)}</dd>
            </div>
          ))}
        </dl>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <form aria-label="Brief" noValidate onSubmit={(e) => void submit(e)} className="flex flex-col gap-3">
        <fieldset disabled={busy} className="grid min-w-0 gap-3 border-0 p-0 sm:grid-cols-2">
          {BRIEF_FIELD_IDS.map((id) => {
            const controlId = `${idPrefix}-${id}`;
            const required = REQUIRED_BRIEF_FIELDS.includes(id);
            const error = errors[id];
            const common = {
              id: controlId,
              "aria-required": required ? true : undefined,
              "aria-invalid": error ? true : undefined,
              "aria-describedby": error ? `${controlId}-hint ${controlId}-error` : `${controlId}-hint`,
              className: `${CONTROL} ${error ? "border-bad" : "border-hair"}`,
            } as const;
            const onChange = (e: { target: { value: string } }) => edit(id, e.target.value);
            const setRef = (el: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement | null) => void (controlRefs.current[id] = el);
            return (
              <div key={id} className={`flex min-w-0 flex-col gap-1.5 ${TEXTAREAS.includes(id) ? "sm:col-span-2" : ""}`}>
                <label htmlFor={controlId} className="text-s font-medium">
                  {BRIEF_FIELD_LABELS[id]}
                </label>
                {TEXTAREAS.includes(id) ? (
                  <textarea {...common} ref={setRef} rows={3} value={drafts[id]} onChange={onChange} />
                ) : id === "client_approval" ? (
                  <select {...common} ref={setRef} value={drafts[id]} onChange={onChange}>
                    {CLIENT_APPROVALS.map((value) => (
                      <option key={value} value={value}>
                        {CLIENT_APPROVAL_LABELS[value]}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    {...common}
                    ref={setRef}
                    type={id === "deadline" ? "date" : "text"}
                    inputMode={id === "target_budget" ? "decimal" : undefined}
                    value={drafts[id]}
                    onChange={onChange}
                  />
                )}
                <p id={`${controlId}-hint`} className="text-xs text-muted">
                  {required ? "Obligatorio" : "Opcional"}
                </p>
                {error ? (
                  <p id={`${controlId}-error`} className="text-s text-bad">
                    {error}
                  </p>
                ) : null}
              </div>
            );
          })}
        </fieldset>
        <div>
          <Button type="submit" variant="primary" disabled={busy}>
            {busy ? "Guardando…" : "Guardar brief"}
          </Button>
        </div>
      </form>
      {notices}
    </div>
  );
}

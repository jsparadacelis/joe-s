"use client";

import { useEffect, useId, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { PlanRecalculation } from "@/components/project/sheet/PlanRecalculation";
import { Button } from "@/components/ui/Button";
import { ApiError } from "@/lib/api";
import { PROJECT_TYPES, PROJECT_TYPE_LABELS, SCALES, SCALE_LABELS, type ProjectType, type Scale } from "@/lib/plan-settings";
import {
  fieldInputKind,
  fieldLabel,
  saveProjectSheet,
  type ProjectSheet,
  type SheetBlockData,
  type SheetFieldId,
  type SheetUpdate,
} from "@/lib/sheet";
import { fetchProposedPlan, isValidWeek, validateWeeks, type ProposedPlan } from "@/lib/start";

export interface SheetFormProps {
  block: SheetBlockData;
  code: string;
  /** Saves a partial update; replaceable in tests. */
  save?: (update: SheetUpdate) => Promise<ProjectSheet>;
  /** Loads the proposed plan of a type and scale; replaceable in tests. */
  loadPlan?: (projectType: ProjectType, scale: Scale) => Promise<ProposedPlan>;
  onCancel: () => void;
  onSaved: (sheet: ProjectSheet) => void;
}

const UNEXPECTED_MESSAGE = "Ocurrió un error inesperado. Inténtalo de nuevo.";
const ALERT_TARGET = "\u0000alert";
const INCOMPLETE_DATE = "Fecha incompleta";
const CONTROL = "w-full rounded-base border bg-surface px-3 py-2 text-m text-ink";
const ALERT = "rounded-base bg-bad-soft px-3 py-2.5 text-s text-bad focus-visible:outline-2 focus-visible:outline-point";

const errorMessage = (error: unknown) => (error instanceof ApiError ? error.message : UNEXPECTED_MESSAGE);
const toNumber = (draft: string) => (draft.trim() === "" ? NaN : Number(draft));

/** Edit mode of one block: the manual fields and, in Identificación, type and scale with the plan recalculation. */
export function SheetBlockForm({ block, code, save, loadPlan, onCancel, onSaved }: SheetFormProps) {
  const idPrefix = useId();
  const editable = block.fields.filter((f) => fieldInputKind(f.field) !== null);
  const initial = Object.fromEntries(editable.map((f) => [f.field, typeof f.value === "string" ? f.value : ""])) as Record<string, string>;
  const initialOf = (id: "project_type" | "scale") => {
    const value = block.fields.find((f) => f.field === id)?.value;
    return typeof value === "string" ? value : "";
  };
  const hasPlanChoice = block.fields.some((f) => f.field === "project_type") && block.fields.some((f) => f.field === "scale");

  const [drafts, setDrafts] = useState(initial);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [projectType, setProjectType] = useState(initialOf("project_type"));
  const [scale, setScale] = useState(initialOf("scale"));
  const [weeks, setWeeks] = useState<string[] | null>(null);
  const [planLoading, setPlanLoading] = useState(false);
  const [planError, setPlanError] = useState<string | null>(null);
  const [weekError, setWeekError] = useState<string | null>(null);
  const [alertText, setAlertText] = useState<string | null>(null);
  const [waitNotice, setWaitNotice] = useState(false);
  const [busy, setBusy] = useState(false);

  const submitting = useRef(false);
  const loadToken = useRef(0);
  const focusField = useRef<string | null>(null);
  const controlRefs = useRef<Record<string, HTMLInputElement | HTMLTextAreaElement | null>>({});
  const alertRef = useRef<HTMLDivElement>(null);
  const weekRefs = useRef<(HTMLInputElement | null)[]>([]);

  // A field error moves focus once the form is enabled again.
  useEffect(() => {
    if (busy || !focusField.current) return;
    const target = focusField.current === ALERT_TARGET ? alertRef.current : controlRefs.current[focusField.current];
    target?.focus();
    focusField.current = null;
  });

  // Focus starts on the first control when the form opens.
  useEffect(() => {
    controlRefs.current[editable[0]?.field]?.focus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const doSave = save ?? ((update: SheetUpdate) => saveProjectSheet(code, update));
  const doLoad = loadPlan ?? fetchProposedPlan;
  const planChanged = hasPlanChoice && projectType !== "" && scale !== "" && (projectType !== initialOf("project_type") || scale !== initialOf("scale"));
  const numbers = weeks ? weeks.map(toNumber) : null;

  async function chooseType(nextType: string, nextScale: string) {
    const token = ++loadToken.current;
    setProjectType(nextType);
    setScale(nextScale);
    setWeeks(null);
    setPlanError(null);
    setWeekError(null);
    setAlertText(null);
    setWaitNotice(false);
    const changed = nextType !== initialOf("project_type") || nextScale !== initialOf("scale");
    if (!changed || nextType === "" || nextScale === "") {
      setPlanLoading(false);
      return;
    }
    setPlanLoading(true);
    try {
      const plan = await doLoad(nextType as ProjectType, nextScale as Scale);
      if (token === loadToken.current) setWeeks(plan.weeksByPhase.map(String));
    } catch (error) {
      if (token === loadToken.current) setPlanError(errorMessage(error));
    } finally {
      if (token === loadToken.current) setPlanLoading(false);
    }
  }

  function editField(id: SheetFieldId, value: string) {
    setDrafts((current) => ({ ...current, [id]: value }));
    setFieldErrors((current) => {
      const next = { ...current };
      delete next[id];
      return next;
    });
  }

  function editWeek(index: number, value: string) {
    setWeeks((current) => (current ? current.map((w, i) => (i === index ? value : w)) : current));
    setWeekError(null);
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (submitting.current) return;
    if (planLoading) {
      setWaitNotice(true);
      return;
    }
    // A half-typed date reads as empty: it must not erase the previous date.
    const incomplete = editable.find(
      (f) => fieldInputKind(f.field) === "date" && controlRefs.current[f.field]?.validity?.badInput,
    );
    if (incomplete) {
      setFieldErrors({ [incomplete.field]: INCOMPLETE_DATE });
      controlRefs.current[incomplete.field]?.focus();
      return;
    }
    const touched = Object.fromEntries(Object.entries(drafts).filter(([id, value]) => value !== initial[id]));
    const update: SheetUpdate = {};
    if (Object.keys(touched).length > 0) update.fields = touched;
    if (planChanged) {
      if (!numbers) return;
      const firstInvalid = numbers.findIndex((w) => !isValidWeek(w));
      if (firstInvalid >= 0) {
        setWeekError(validateWeeks(numbers));
        weekRefs.current[firstInvalid]?.focus();
        return;
      }
      update.plan = { project_type: projectType as ProjectType, scale: scale as Scale, weeks: numbers };
    }
    if (!update.fields && !update.plan) {
      onCancel();
      return;
    }
    submitting.current = true;
    setAlertText(null);
    setBusy(true);
    try {
      onSaved(await doSave(update));
    } catch (error) {
      if (error instanceof ApiError && error.field && error.field in drafts) {
        setFieldErrors({ [error.field]: error.message });
        focusField.current = error.field;
      } else {
        setAlertText(errorMessage(error));
        focusField.current = ALERT_TARGET;
      }
    } finally {
      submitting.current = false;
      setBusy(false);
    }
  }

  function handleKeyDown(event: KeyboardEvent<HTMLFormElement>) {
    if (event.key === "Escape" && !busy) onCancel();
  }


  return (
    <form noValidate onSubmit={(e) => void submit(e)} onKeyDown={handleKeyDown} className="flex flex-col gap-3">
      <fieldset disabled={busy} className="flex min-w-0 flex-col gap-3 border-0 p-0">
        {hasPlanChoice ? (
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <label htmlFor={`${idPrefix}-project_type`} className="text-s font-medium">
                {fieldLabel("project_type")}
              </label>
              <select
                id={`${idPrefix}-project_type`}
                value={projectType}
                onChange={(e) => void chooseType(e.target.value, scale)}
                className={`${CONTROL} border-hair`}
              >
                {projectType === "" ? <option value="">—</option> : null}
                {PROJECT_TYPES.map((value) => (
                  <option key={value} value={value}>
                    {PROJECT_TYPE_LABELS[value]}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex flex-col gap-1.5">
              <label htmlFor={`${idPrefix}-scale`} className="text-s font-medium">
                {fieldLabel("scale")}
              </label>
              <select
                id={`${idPrefix}-scale`}
                value={scale}
                onChange={(e) => void chooseType(projectType, e.target.value)}
                className={`${CONTROL} border-hair`}
              >
                {scale === "" ? <option value="">—</option> : null}
                {SCALES.map((value) => (
                  <option key={value} value={value}>
                    {SCALE_LABELS[value]}
                  </option>
                ))}
              </select>
            </div>
          </div>
        ) : null}

        {editable.map(({ field }) => {
          const kind = fieldInputKind(field);
          const id = `${idPrefix}-${field}`;
          const error = fieldErrors[field];
          const common = {
            id,
            value: drafts[field],
            onChange: (e: { target: { value: string } }) => editField(field, e.target.value),
            "aria-invalid": error ? true : undefined,
            "aria-describedby": error ? `${id}-error` : undefined,
            className: `${CONTROL} ${error ? "border-bad" : "border-hair"}`,
          };
          return (
            <div key={field} className="flex flex-col gap-1.5">
              <label htmlFor={id} className="text-s font-medium">
                {fieldLabel(field)}
              </label>
              {kind === "textarea" ? (
                <textarea {...common} ref={(el) => void (controlRefs.current[field] = el)} rows={3} />
              ) : (
                <input {...common} ref={(el) => void (controlRefs.current[field] = el)} type={kind === "date" ? "date" : "text"} />
              )}
              {error ? (
                <p id={`${id}-error`} className="text-s text-bad">
                  {error}
                </p>
              ) : null}
            </div>
          );
        })}

        {planLoading ? <p className="text-s text-muted">Cargando plan…</p> : null}
        {waitNotice && planLoading ? (
          <p role="status" className="text-s text-muted">
            Espera a que termine de calcularse el plan
          </p>
        ) : null}
        {planError ? (
          <div role="alert" className={ALERT}>
            {planError}
          </div>
        ) : null}
        {weeks ? (
          <PlanRecalculation
            idPrefix={idPrefix}
            weeks={weeks}
            error={weekError}
            onChange={editWeek}
            inputRef={(index, el) => void (weekRefs.current[index] = el)}
          />
        ) : null}
      </fieldset>

      {alertText ? (
        <div ref={alertRef} role="alert" tabIndex={-1} className={ALERT}>
          {alertText}
        </div>
      ) : null}

      <div className="flex gap-3">
        {planChanged ? (
          weeks ? (
            <Button type="submit" variant="primary" disabled={busy}>
              {busy ? "Guardando…" : "Confirmar recálculo"}
            </Button>
          ) : null
        ) : (
          <Button type="submit" variant="primary" disabled={busy}>
            {busy ? "Guardando…" : "Guardar"}
          </Button>
        )}
        {planError ? (
          <Button onClick={() => void chooseType(projectType, scale)}>Reintentar</Button>
        ) : null}
        <Button disabled={busy} onClick={onCancel}>
          Cancelar
        </Button>
      </div>
    </form>
  );
}

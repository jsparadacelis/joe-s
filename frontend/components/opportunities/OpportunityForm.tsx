"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useId, useRef, useState, type ChangeEvent, type FormEvent, type ReactNode } from "react";
import { Button } from "@/components/ui/Button";
import { Notice } from "@/components/ui/Notice";
import { Panel } from "@/components/ui/Panel";
import { ApiError } from "@/lib/api";
import {
  EMPTY_DRAFT,
  OPPORTUNITY_FIELDS,
  REQUIRED_FIELDS,
  createOpportunity,
  toOpportunityPayload,
  validateOpportunity,
  type Opportunity,
  type OpportunityDraft,
  type OpportunityErrors,
  type OpportunityField,
  type OpportunityPayload,
} from "@/lib/opportunities";
import { PROJECT_TYPES, PROJECT_TYPE_LABELS } from "@/lib/plan-settings";

export interface OpportunityFormProps {
  /** Sends the payload to the API; replaceable in tests. */
  submitter?: (payload: OpportunityPayload) => Promise<Opportunity>;
  /** Called with the created opportunity; by default the form goes back to the portfolio. */
  onCreated?: (created: Opportunity) => void;
}

const UNEXPECTED_MESSAGE = "Ocurrió un error inesperado. Inténtalo de nuevo.";
const CONTROL = "w-full rounded-base border bg-surface px-3 py-2 text-m text-ink";

/** Label shown on screen; the API's messages use the label without the unit (see FIELD_LABELS). */
const SCREEN_LABELS: Record<OpportunityField, string> = {
  name: "Nombre",
  client: "Cliente",
  location: "Localización",
  project_type: "Tipología",
  owner: "Responsable",
  estimated_budget: "Presupuesto estimado (€)",
  deadline: "Plazo",
  source: "Fuente",
  decision_date: "Fecha de decisión",
};

const isOpportunityField = (value: string | undefined): value is OpportunityField =>
  value !== undefined && (OPPORTUNITY_FIELDS as readonly string[]).includes(value);

const defaultSubmitter = (payload: OpportunityPayload) => createOpportunity(payload);

export function OpportunityForm({ submitter = defaultSubmitter, onCreated }: OpportunityFormProps) {
  const router = useRouter();
  const idPrefix = useId();
  const [draft, setDraft] = useState<OpportunityDraft>(EMPTY_DRAFT);
  const [errors, setErrors] = useState<OpportunityErrors>({});
  const [generalError, setGeneralError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);
  const submitting = useRef(false);

  /** Controls are found by their `name` (the API field), so no ref is needed per control. */
  const focusField = (field: OpportunityField) => (formRef.current?.elements.namedItem(field) as HTMLElement | null)?.focus();

  const update = (field: OpportunityField) => (event: ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { value } = event.target;
    setDraft((current) => ({ ...current, [field]: value }));
    // The error belonged to the previous value: it is validated again on submit.
    setErrors((current) => (field in current ? { ...current, [field]: undefined } : current));
  };

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting.current) return;

    const found = validateOpportunity(draft);
    const firstInvalid = OPPORTUNITY_FIELDS.find((field) => found[field] !== undefined);
    setErrors(found);
    setGeneralError(null);
    if (firstInvalid) {
      focusField(firstInvalid);
      return;
    }

    submitting.current = true;
    setSaving(true);
    try {
      const created = await submitter(toOpportunityPayload(draft));
      // `saving` stays on: the form is left for the portfolio and must not be sent twice.
      if (onCreated) onCreated(created);
      else router.push("/portfolio");
    } catch (error) {
      const message = error instanceof ApiError ? error.message : UNEXPECTED_MESSAGE;
      if (error instanceof ApiError && isOpportunityField(error.field)) {
        setErrors({ [error.field]: message });
        focusField(error.field);
      } else {
        setGeneralError(message);
      }
      submitting.current = false;
      setSaving(false);
    }
  }

  const ids = (field: OpportunityField) => ({
    control: `${idPrefix}-${field}`,
    hint: `${idPrefix}-${field}-hint`,
    error: `${idPrefix}-${field}-error`,
  });

  /** Props shared by every control: label link, validity and description (hint and error). */
  function controlProps(field: OpportunityField) {
    const { control, hint, error } = ids(field);
    const optional = !REQUIRED_FIELDS.includes(field);
    const describedBy = [optional ? hint : null, errors[field] ? error : null].filter(Boolean).join(" ");
    return {
      id: control,
      name: field,
      value: draft[field],
      onChange: update(field),
      required: !optional,
      "aria-invalid": errors[field] ? (true as const) : undefined,
      "aria-describedby": describedBy || undefined,
      className: `${CONTROL} ${errors[field] ? "border-bad" : "border-hair"}`,
    };
  }

  /** A plain function, not a component: a component declared here would remount (and drop focus) on every keystroke. */
  function renderField(field: OpportunityField, children: ReactNode, wide = false) {
    const { control, hint, error } = ids(field);
    return (
      <div key={field} className={`flex flex-col gap-1.5 ${wide ? "md:col-span-2" : ""}`}>
        <label htmlFor={control} className="text-s font-medium">
          {SCREEN_LABELS[field]}
        </label>
        {children}
        {REQUIRED_FIELDS.includes(field) ? null : (
          <p id={hint} className="text-xs text-muted">
            Opcional
          </p>
        )}
        {errors[field] ? (
          <p id={error} className="text-s text-bad">
            {errors[field]}
          </p>
        ) : null}
      </div>
    );
  }

  return (
    <form
      ref={formRef}
      aria-label="Nueva oportunidad"
      aria-busy={saving}
      noValidate
      onSubmit={handleSubmit}
      className="flex flex-col gap-4"
    >
      <Panel title="Datos de la oportunidad" description="Los campos sin la indicación «Opcional» son obligatorios.">
        <div className="grid gap-4 md:grid-cols-2">
          {renderField("name", <input type="text" autoComplete="off" {...controlProps("name")} />, true)}
          {renderField("client", <input type="text" autoComplete="off" {...controlProps("client")} />)}
          {renderField("location", <input type="text" autoComplete="off" {...controlProps("location")} />)}
          {renderField(
            "project_type",
            <select {...controlProps("project_type")}>
              <option value="">Selecciona una tipología</option>
              {PROJECT_TYPES.map((type) => (
                <option key={type} value={type}>
                  {PROJECT_TYPE_LABELS[type]}
                </option>
              ))}
            </select>,
          )}
          {renderField("owner", <input type="text" autoComplete="off" {...controlProps("owner")} />)}
          {renderField(
            "estimated_budget",
            <input type="text" inputMode="decimal" autoComplete="off" {...controlProps("estimated_budget")} />,
          )}
          {renderField("deadline", <input type="date" {...controlProps("deadline")} />)}
          {renderField("source", <input type="text" autoComplete="off" {...controlProps("source")} />)}
          {renderField("decision_date", <input type="date" {...controlProps("decision_date")} />)}
        </div>
      </Panel>

      {generalError ? <Notice tone="bad">{generalError}</Notice> : null}

      <div className="flex items-center gap-3">
        <Button type="submit" variant="primary" disabled={saving}>
          {saving ? "Guardando…" : "Guardar oportunidad"}
        </Button>
        <Link href="/portfolio" className="rounded-base px-2 py-1 text-s text-muted underline">
          Cancelar
        </Link>
      </div>
    </form>
  );
}

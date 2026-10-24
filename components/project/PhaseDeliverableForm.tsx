"use client";

import { useId, type FormEvent } from "react";
import { Button } from "@/components/ui/Button";
import type { PhaseMode } from "@/lib/phases";
import type { Field, PhaseDeliverable } from "@/lib/projects";

export type PhaseDeliverableFormProps = {
  deliverable: PhaseDeliverable;
  mode: PhaseMode;
  /** La persistencia llega en tareas posteriores; por defecto no hace nada. */
  onSave?: () => void;
};

const CONTROL =
  "w-full rounded-base border border-hair bg-surface px-3 py-2 text-m text-ink read-only:bg-surface-2 disabled:bg-surface-2 disabled:text-muted";

function DeliverableField({ field, mode, baseId }: { field: Field; mode: PhaseMode; baseId: string }) {
  const id = `${baseId}-${field.id}`;
  const editable = mode === "edit";
  // Los campos de fecha no respetan readOnly en el navegador: se deshabilitan.
  const lock = editable
    ? {}
    : mode === "read-only" && field.type !== "date"
      ? { readOnly: true }
      : { disabled: true };

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-s font-medium">
        {field.label}
      </label>
      {field.type === "textarea" ? (
        <textarea id={id} name={field.id} rows={4} defaultValue={field.value} className={CONTROL} {...lock} />
      ) : (
        <input
          id={id}
          name={field.id}
          type={field.type === "date" ? "date" : "text"}
          defaultValue={field.value}
          className={CONTROL}
          {...lock}
        />
      )}
    </div>
  );
}

export function PhaseDeliverableForm({ deliverable, mode, onSave }: PhaseDeliverableFormProps) {
  const baseId = useId();

  function enviar(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (mode === "edit") onSave?.();
  }

  return (
    <form onSubmit={enviar} className="flex flex-col gap-4">
      {mode === "read-only" && deliverable.frozenVersion ? (
        <p className="text-s text-muted">Versión congelada: {deliverable.frozenVersion}</p>
      ) : null}
      {deliverable.fields.map((field) => (
        <DeliverableField key={field.id} field={field} mode={mode} baseId={baseId} />
      ))}
      {mode === "edit" ? (
        <div>
          <Button type="submit" variant="primary">
            Guardar
          </Button>
        </div>
      ) : null}
    </form>
  );
}

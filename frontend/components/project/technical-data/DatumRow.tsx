import { memo, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { StatusChip } from "@/components/ui/StatusChip";
import { isEdited, type TechnicalDatum, type DatumDefinition } from "@/lib/technical-data";

export type DatumRowProps = {
  definition: DatumDefinition;
  datum: TechnicalDatum;
  /** The whole screen (or the whole row) cannot be changed. */
  disabled: boolean;
  /** A request for this datum is pending. */
  saving: boolean;
  /** Server message for this datum (e.g. a 422). */
  error?: string;
  /** Resolves `true` when the server accepted the value. */
  onValueChange: (id: string, value: string) => Promise<boolean>;
  onVerify: (id: string) => void;
  onRestore: (id: string) => void;
  /** The person started editing again: the previous error no longer applies. */
  onEditStart: (id: string) => void;
};

const CONTROL =
  "w-full rounded-base border bg-surface px-2.5 py-1.5 text-s text-ink tabular-nums disabled:bg-surface-2 disabled:text-muted";

function DatumRowBase({ definition, datum, disabled, saving, error, onValueChange, onVerify, onRestore, onEditStart }: DatumRowProps) {
  const { id, label, origin, unit, type, options } = definition;
  const edited = isEdited(datum);
  const controlId = `datum-${id}`;
  const originId = `datum-${id}-origin`;
  const errorId = `datum-${id}-error`;
  const border = error ? "border-bad" : datum.verified ? "border-ok" : edited ? "border-warn" : "border-hair";
  const locked = disabled || saving;

  // What the person typed and the server has not accepted yet; null: the field shows the stored value.
  const [draft, setDraft] = useState<string | null>(null);
  // A screen that turned read-only (403/409) shows what is stored, not a draft that was never saved.
  const shown = disabled ? datum.value : (draft ?? datum.value);
  const controlRef = useRef<HTMLInputElement & HTMLSelectElement>(null);
  const rowRef = useRef<HTMLLIElement>(null);
  const refocus = useRef(false);

  /** Remembers whether the focus is in this row (control, checkbox or «Restaurar»), which will be disabled or removed. */
  const rememberFocus = () => {
    refocus.current = rowRef.current?.contains(document.activeElement) ?? false;
  };

  // The row is disabled while saving (and the checkbox or «Restaurar» may go away), which drops the focus: give it back
  // to the datum's control if it was in the row.
  useEffect(() => {
    if (!saving && refocus.current) {
      refocus.current = false;
      controlRef.current?.focus();
    }
  }, [saving]);

  async function save(value: string) {
    if (saving) return;
    rememberFocus();
    const accepted = await onValueChange(id, value);
    if (accepted) setDraft(null);
  }

  function commitDraft() {
    if (draft === null) return;
    if (draft === datum.value) setDraft(null);
    else void save(draft);
  }

  const describedBy = error ? `${originId} ${errorId}` : originId;
  const invalid = error ? true : undefined;

  return (
    <li ref={rowRef} className="grid grid-cols-[150px_minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1.5 border-b border-hair py-2.5">
      <div className="flex flex-col gap-0.5 text-s">
        <label htmlFor={controlId}>{label}</label>
        <span id={originId} className="text-xs text-muted">
          {origin}
        </span>
      </div>

      {type === "list" ? (
        <select
          id={controlId}
          ref={controlRef}
          aria-describedby={describedBy}
          aria-invalid={invalid}
          className={`${CONTROL} ${border}`}
          value={datum.value}
          disabled={locked}
          onChange={(e) => {
            onEditStart(id);
            void save(e.target.value);
          }}
        >
          <option value="">Sin dato</option>
          {options?.map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </select>
      ) : (
        <div className="flex items-center gap-1.5">
          <input
            id={controlId}
            ref={controlRef}
            type="text"
            inputMode={type === "number" ? "decimal" : "text"}
            aria-describedby={describedBy}
            aria-invalid={invalid}
            className={`${CONTROL} ${border}`}
            value={shown}
            disabled={locked}
            onChange={(e) => {
              onEditStart(id);
              setDraft(e.target.value);
            }}
            onBlur={commitDraft}
            onKeyDown={(e) => {
              if (e.key === "Enter") commitDraft();
            }}
          />
          {unit ? <span className="whitespace-nowrap text-xs text-muted">{unit}</span> : null}
        </div>
      )}

      <div className="flex flex-col items-end gap-1 text-xs">
        {saving ? <span className="text-muted">Guardando…</span> : null}
        {edited ? <StatusChip tone="warn">Editado</StatusChip> : null}
        <label className="flex cursor-pointer items-center gap-1.5 whitespace-nowrap text-muted">
          <input
            type="checkbox"
            className="accent-ok"
            checked={datum.verified}
            // The API cannot un-verify: a verified datum stays so until it is edited.
            disabled={locked || datum.verified}
            onChange={(e) => {
              if (e.target.checked) {
                rememberFocus();
                onVerify(id);
              }
            }}
          />
          Verificado<span className="sr-only"> {label}</span>
        </label>
      </div>

      {error ? (
        <p id={errorId} role="alert" className="col-span-2 col-start-2 text-xs text-bad">
          {error}
        </p>
      ) : null}

      {edited ? (
        <div className="col-span-2 col-start-2 flex items-center gap-2 text-xs text-muted">
          <span>
            Valor de {origin}: <b className="font-medium text-ink-2">{datum.original || "vacío"}</b>
          </span>
          <Button size="sm" disabled={locked} onClick={() => {
              rememberFocus();
              onRestore(id);
            }}>
            Restaurar<span className="sr-only"> {label}</span>
          </Button>
        </div>
      ) : null}
    </li>
  );
}

/** Memoized: when a datum is edited only its row is repainted. */
export const DatumRow = memo(DatumRowBase);

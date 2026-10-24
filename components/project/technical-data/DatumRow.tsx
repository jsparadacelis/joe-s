import { memo } from "react";
import { Button } from "@/components/ui/Button";
import { StatusChip } from "@/components/ui/StatusChip";
import { isEdited, type TechnicalDatum, type DatumDefinition } from "@/lib/technical-data";

export type DatumRowProps = {
  definition: DatumDefinition;
  datum: TechnicalDatum;
  disabled: boolean;
  onValueChange: (id: string, value: string) => void;
  onVerify: (id: string, verified: boolean) => void;
  onRestore: (id: string) => void;
};

const CONTROL =
  "w-full rounded-base border bg-surface px-2.5 py-1.5 text-s text-ink tabular-nums disabled:bg-surface-2 disabled:text-muted";

function DatumRowBase({ definition, datum, disabled, onValueChange, onVerify, onRestore }: DatumRowProps) {
  const { id, label, origin, unit, type, options } = definition;
  const edited = isEdited(datum);
  const controlId = `dato-${id}`;
  const originId = `dato-${id}-origen`;
  const border = datum.verified ? "border-ok" : edited ? "border-warn" : "border-hair";

  return (
    <li className="grid grid-cols-[150px_minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1.5 border-b border-hair py-2.5">
      <div className="flex flex-col gap-0.5 text-s">
        <label htmlFor={controlId}>{label}</label>
        <span id={originId} className="text-xs text-muted">
          {origin}
        </span>
      </div>

      {type === "list" ? (
        <select
          id={controlId}
          aria-describedby={originId}
          className={`${CONTROL} ${border}`}
          value={datum.value}
          disabled={disabled}
          onChange={(e) => onValueChange(id, e.target.value)}
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
            type="text"
            inputMode={type === "number" ? "decimal" : "text"}
            aria-describedby={originId}
            className={`${CONTROL} ${border}`}
            value={datum.value}
            disabled={disabled}
            onChange={(e) => onValueChange(id, e.target.value)}
          />
          {unit ? <span className="whitespace-nowrap text-xs text-muted">{unit}</span> : null}
        </div>
      )}

      <div className="flex flex-col items-end gap-1 text-xs">
        {edited ? <StatusChip tone="warn">Editado</StatusChip> : null}
        <label className="flex cursor-pointer items-center gap-1.5 whitespace-nowrap text-muted">
          <input
            type="checkbox"
            className="accent-ok"
            checked={datum.verified}
            disabled={disabled}
            onChange={(e) => onVerify(id, e.target.checked)}
          />
          Verificado<span className="sr-only"> {label}</span>
        </label>
      </div>

      {edited ? (
        <div className="col-span-2 col-start-2 flex items-center gap-2 text-xs text-muted">
          <span>
            Valor de {origin}: <b className="font-medium text-ink-2">{datum.original || "vacío"}</b>
          </span>
          <Button size="sm" disabled={disabled} onClick={() => onRestore(id)}>
            Restaurar<span className="sr-only"> {label}</span>
          </Button>
        </div>
      ) : null}
    </li>
  );
}

/** Memoizada: al editar un dato solo se vuelve a pintar su fila. */
export const DatumRow = memo(DatumRowBase);

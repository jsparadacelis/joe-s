import { isValidWeek, totalWeeks, validateWeeks } from "@/lib/start";
import { PHASES } from "@/lib/phases";

const WEEK_PHASES = PHASES.slice(1);
const toNumber = (draft: string) => (draft.trim() === "" ? NaN : Number(draft));

interface Props {
  idPrefix: string;
  weeks: string[];
  error: string | null;
  onChange: (index: number, value: string) => void;
  inputRef: (index: number, element: HTMLInputElement | null) => void;
}

/** Proposed plan after changing type or scale: explicit warning, seven editable weeks and their total. */
export function PlanRecalculation({ idPrefix, weeks, error, onChange, inputRef }: Props) {
  const numbers = weeks.map(toNumber);
  const total = validateWeeks(numbers) === null ? totalWeeks(numbers) : null;
  const errorId = `${idPrefix}-weeks-error`;
  return (
    <div className="flex flex-col gap-3 rounded-base bg-surface-2 p-3.5">
      <p className="text-s">
        Cambiar la tipología o la escala recalcula el plan: al confirmar, el plan de la ficha reemplaza el plan de trabajo
        vigente por estas semanas. La línea base se conserva en el histórico.
      </p>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {WEEK_PHASES.map((phase, index) => {
          const invalid = error !== null && !isValidWeek(numbers[index]);
          return (
            <div key={phase.id} className="flex flex-col gap-1.5">
              <label htmlFor={`${idPrefix}-week-${phase.id}`} className="text-s font-medium">
                {`Semanas de ${phase.name}`}
              </label>
              <input
                id={`${idPrefix}-week-${phase.id}`}
                ref={(el) => inputRef(index, el)}
                type="number"
                inputMode="numeric"
                value={weeks[index]}
                onChange={(e) => onChange(index, e.target.value)}
                aria-invalid={invalid ? true : undefined}
                aria-describedby={invalid ? errorId : undefined}
                className={`w-full rounded-base border bg-surface px-3 py-2 text-m text-ink ${invalid ? "border-bad" : "border-hair"}`}
              />
            </div>
          );
        })}
      </div>
      {error ? (
        <p id={errorId} role="alert" className="text-s text-bad">
          {error}
        </p>
      ) : null}
      <p className="text-m font-semibold tabular-nums">{total === null ? "Total: —" : `Total: ${total} semanas`}</p>
    </div>
  );
}

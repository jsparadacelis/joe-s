import type { FormEvent } from "react";
import { Button } from "@/components/ui/Button";
import type { Exaggeration, MaxSide, Margin } from "@/lib/relief";
import { EXAGGERATIONS, MAX_SIDES, MARGINS } from "@/lib/relief";

export type ReliefShortcut = { id: string; label: string; reference: string };

export type ReliefControlsProps = {
  reference: string;
  margin: Margin;
  maxSide: MaxSide;
  exaggeration: Exaggeration;
  atajos: readonly ReliefShortcut[];
  errorId?: string;
  onReference: (value: string) => void;
  onMargin: (value: Margin) => void;
  onMaxSide: (value: MaxSide) => void;
  onExaggeration: (value: Exaggeration) => void;
  onShortcut: (reference: string) => void;
  onView: () => void;
};

const CONTROL = "rounded-base border border-hair bg-surface px-2.5 py-1.5 text-s text-ink";

const marginLabel = (m: Margin) => (m === 0 ? "Solo la parcela" : `Parcela + ${m} m`);
const exaggerationLabel = (e: Exaggeration) => (e === 1 ? "×1 (real)" : `×${e}`);

export function ReliefControls({
  reference,
  margin,
  maxSide,
  exaggeration,
  atajos,
  errorId,
  onReference,
  onMargin,
  onMaxSide,
  onExaggeration,
  onShortcut,
  onView,
}: ReliefControlsProps) {
  const submit = (e: FormEvent) => {
    e.preventDefault();
    onView();
  };

  return (
    <form onSubmit={submit} className="flex flex-col gap-3">
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex min-w-[260px] flex-col gap-1">
          <label htmlFor="relief-reference" className="text-s font-medium">
            Referencia catastral
          </label>
          <input
            id="relief-reference"
            type="text"
            maxLength={20}
            autoComplete="off"
            spellCheck={false}
            aria-describedby={errorId}
            className={`${CONTROL} tabular-nums`}
            value={reference}
            onChange={(e) => onReference(e.target.value)}
          />
        </div>
        <Button type="submit" variant="primary">
          Ver relieve
        </Button>
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <div className="flex flex-col gap-1">
          <label htmlFor="relief-margin" className="text-s font-medium">
            Recorte
          </label>
          <select
            id="relief-margin"
            className={CONTROL}
            value={margin}
            onChange={(e) => onMargin(Number(e.target.value) as Margin)}
          >
            {MARGINS.map((m) => (
              <option key={m} value={m}>
                {marginLabel(m)}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="relief-max-side" className="text-s font-medium">
            Lado máximo de la vista
          </label>
          <select
            id="relief-max-side"
            className={CONTROL}
            value={maxSide}
            onChange={(e) => onMaxSide(Number(e.target.value) as MaxSide)}
          >
            {MAX_SIDES.map((l) => (
              <option key={l} value={l}>
                {l} m
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="relief-exaggeration" className="text-s font-medium">
            Exageración vertical
          </label>
          <select
            id="relief-exaggeration"
            className={CONTROL}
            value={exaggeration}
            onChange={(e) => onExaggeration(Number(e.target.value) as Exaggeration)}
          >
            {EXAGGERATIONS.map((x) => (
              <option key={x} value={x}>
                {exaggerationLabel(x)}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 text-s text-muted">
        <span>Probar con:</span>
        {atajos.map((a) => (
          <Button key={a.id} size="sm" disabled={a.reference === ""} onClick={() => onShortcut(a.reference)}>
            {a.label}
          </Button>
        ))}
      </div>
    </form>
  );
}

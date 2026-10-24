import type { FormEvent } from "react";
import { Button } from "@/components/ui/Button";
import type { Exageracion, MaxSide, Margin } from "@/lib/relief";
import { EXAGGERATIONS, MAX_SIDES, MARGINS } from "@/lib/relief";

export type ReliefShortcut = { id: string; label: string; reference: string };

export type ReliefControlsProps = {
  reference: string;
  margin: Margin;
  maxSide: MaxSide;
  exaggeration: Exageracion;
  atajos: readonly ReliefShortcut[];
  errorId?: string;
  onReference: (value: string) => void;
  onMargin: (value: Margin) => void;
  onMaxSide: (value: MaxSide) => void;
  onExaggeration: (value: Exageracion) => void;
  onShortcut: (reference: string) => void;
  onView: () => void;
};

const CONTROL = "rounded-base border border-hair bg-surface px-2.5 py-1.5 text-s text-ink";

const marginLabel = (m: Margin) => (m === 0 ? "Solo la parcela" : `Parcela + ${m} m`);
const exaggerationLabel = (e: Exageracion) => (e === 1 ? "×1 (real)" : `×${e}`);

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
  const enviar = (e: FormEvent) => {
    e.preventDefault();
    onView();
  };

  return (
    <form onSubmit={enviar} className="flex flex-col gap-3">
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex min-w-[260px] flex-col gap-1">
          <label htmlFor="relieve-referencia" className="text-s font-medium">
            Referencia catastral
          </label>
          <input
            id="relieve-referencia"
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
          <label htmlFor="relieve-recorte" className="text-s font-medium">
            Recorte
          </label>
          <select
            id="relieve-recorte"
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
          <label htmlFor="relieve-lado" className="text-s font-medium">
            Lado máximo de la vista
          </label>
          <select
            id="relieve-lado"
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
          <label htmlFor="relieve-exageracion" className="text-s font-medium">
            Exageración vertical
          </label>
          <select
            id="relieve-exageracion"
            className={CONTROL}
            value={exaggeration}
            onChange={(e) => onExaggeration(Number(e.target.value) as Exageracion)}
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

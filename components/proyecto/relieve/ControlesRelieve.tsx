import type { FormEvent } from "react";
import { Button } from "@/components/ui/Button";
import type { Exageracion, LadoMaximo, Margen } from "@/lib/relieve";
import { EXAGERACIONES, LADOS_MAXIMOS, MARGENES } from "@/lib/relieve";

export type AtajoRelieve = { id: string; etiqueta: string; referencia: string };

export type ControlesRelieveProps = {
  referencia: string;
  margen: Margen;
  ladoMaximo: LadoMaximo;
  exageracion: Exageracion;
  atajos: readonly AtajoRelieve[];
  idError?: string;
  onReferencia: (valor: string) => void;
  onMargen: (valor: Margen) => void;
  onLadoMaximo: (valor: LadoMaximo) => void;
  onExageracion: (valor: Exageracion) => void;
  onAtajo: (referencia: string) => void;
  onVer: () => void;
};

const CONTROL = "rounded-base border border-hair bg-surface px-2.5 py-1.5 text-s text-ink";

const etiquetaMargen = (m: Margen) => (m === 0 ? "Solo la parcela" : `Parcela + ${m} m`);
const etiquetaExageracion = (e: Exageracion) => (e === 1 ? "×1 (real)" : `×${e}`);

export function ControlesRelieve({
  referencia,
  margen,
  ladoMaximo,
  exageracion,
  atajos,
  idError,
  onReferencia,
  onMargen,
  onLadoMaximo,
  onExageracion,
  onAtajo,
  onVer,
}: ControlesRelieveProps) {
  const enviar = (e: FormEvent) => {
    e.preventDefault();
    onVer();
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
            aria-describedby={idError}
            className={`${CONTROL} tabular-nums`}
            value={referencia}
            onChange={(e) => onReferencia(e.target.value)}
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
            value={margen}
            onChange={(e) => onMargen(Number(e.target.value) as Margen)}
          >
            {MARGENES.map((m) => (
              <option key={m} value={m}>
                {etiquetaMargen(m)}
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
            value={ladoMaximo}
            onChange={(e) => onLadoMaximo(Number(e.target.value) as LadoMaximo)}
          >
            {LADOS_MAXIMOS.map((l) => (
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
            value={exageracion}
            onChange={(e) => onExageracion(Number(e.target.value) as Exageracion)}
          >
            {EXAGERACIONES.map((x) => (
              <option key={x} value={x}>
                {etiquetaExageracion(x)}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 text-s text-muted">
        <span>Probar con:</span>
        {atajos.map((a) => (
          <Button key={a.id} size="sm" disabled={a.referencia === ""} onClick={() => onAtajo(a.referencia)}>
            {a.etiqueta}
          </Button>
        ))}
      </div>
    </form>
  );
}

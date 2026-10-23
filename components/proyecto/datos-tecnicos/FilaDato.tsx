import { memo } from "react";
import { Button } from "@/components/ui/Button";
import { StatusChip } from "@/components/ui/StatusChip";
import { estaEditado, type DatoTecnico, type DefinicionDato } from "@/lib/datos-tecnicos";

export type FilaDatoProps = {
  definicion: DefinicionDato;
  dato: DatoTecnico;
  deshabilitado: boolean;
  onCambiar: (id: string, valor: string) => void;
  onVerificar: (id: string, verificado: boolean) => void;
  onRestaurar: (id: string) => void;
};

const CONTROL =
  "w-full rounded-base border bg-surface px-2.5 py-1.5 text-s text-ink tabular-nums disabled:bg-surface-2 disabled:text-muted";

function FilaDatoBase({ definicion, dato, deshabilitado, onCambiar, onVerificar, onRestaurar }: FilaDatoProps) {
  const { id, etiqueta, origen, unidad, tipo, opciones } = definicion;
  const editado = estaEditado(dato);
  const idControl = `dato-${id}`;
  const idOrigen = `dato-${id}-origen`;
  const borde = dato.verificado ? "border-ok" : editado ? "border-warn" : "border-hair";

  return (
    <li className="grid grid-cols-[150px_minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1.5 border-b border-hair py-2.5">
      <div className="flex flex-col gap-0.5 text-s">
        <label htmlFor={idControl}>{etiqueta}</label>
        <span id={idOrigen} className="text-xs text-muted">
          {origen}
        </span>
      </div>

      {tipo === "lista" ? (
        <select
          id={idControl}
          aria-describedby={idOrigen}
          className={`${CONTROL} ${borde}`}
          value={dato.valor}
          disabled={deshabilitado}
          onChange={(e) => onCambiar(id, e.target.value)}
        >
          <option value="">Sin dato</option>
          {opciones?.map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </select>
      ) : (
        <div className="flex items-center gap-1.5">
          <input
            id={idControl}
            type="text"
            inputMode={tipo === "numero" ? "decimal" : "text"}
            aria-describedby={idOrigen}
            className={`${CONTROL} ${borde}`}
            value={dato.valor}
            disabled={deshabilitado}
            onChange={(e) => onCambiar(id, e.target.value)}
          />
          {unidad ? <span className="whitespace-nowrap text-xs text-muted">{unidad}</span> : null}
        </div>
      )}

      <div className="flex flex-col items-end gap-1 text-xs">
        {editado ? <StatusChip tone="warn">Editado</StatusChip> : null}
        <label className="flex cursor-pointer items-center gap-1.5 whitespace-nowrap text-muted">
          <input
            type="checkbox"
            className="accent-ok"
            checked={dato.verificado}
            disabled={deshabilitado}
            onChange={(e) => onVerificar(id, e.target.checked)}
          />
          Verificado<span className="sr-only"> {etiqueta}</span>
        </label>
      </div>

      {editado ? (
        <div className="col-span-2 col-start-2 flex items-center gap-2 text-xs text-muted">
          <span>
            Valor de {origen}: <b className="font-medium text-ink-2">{dato.original || "vacío"}</b>
          </span>
          <Button size="sm" disabled={deshabilitado} onClick={() => onRestaurar(id)}>
            Restaurar<span className="sr-only"> {etiqueta}</span>
          </Button>
        </div>
      ) : null}
    </li>
  );
}

/** Memoizada: al editar un dato solo se vuelve a pintar su fila. */
export const FilaDato = memo(FilaDatoBase);

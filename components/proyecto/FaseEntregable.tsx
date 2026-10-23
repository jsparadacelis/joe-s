"use client";

import { useId, type FormEvent } from "react";
import { Button } from "@/components/ui/Button";
import type { ModoFase } from "@/lib/fases";
import type { Campo, EntregableFase } from "@/lib/proyectos";

export type FaseEntregableProps = {
  entregable: EntregableFase;
  modo: ModoFase;
  /** La persistencia llega en tareas posteriores; por defecto no hace nada. */
  onGuardar?: () => void;
};

const CONTROL =
  "w-full rounded-base border border-hair bg-surface px-3 py-2 text-m text-ink read-only:bg-surface-2 disabled:bg-surface-2 disabled:text-muted";

function CampoEntregable({ campo, modo, idBase }: { campo: Campo; modo: ModoFase; idBase: string }) {
  const id = `${idBase}-${campo.id}`;
  const editable = modo === "edicion";
  // Los campos de fecha no respetan readOnly en el navegador: se deshabilitan.
  const bloqueo = editable
    ? {}
    : modo === "solo-lectura" && campo.tipo !== "fecha"
      ? { readOnly: true }
      : { disabled: true };

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-s font-medium">
        {campo.etiqueta}
      </label>
      {campo.tipo === "area" ? (
        <textarea id={id} name={campo.id} rows={4} defaultValue={campo.valor} className={CONTROL} {...bloqueo} />
      ) : (
        <input
          id={id}
          name={campo.id}
          type={campo.tipo === "fecha" ? "date" : "text"}
          defaultValue={campo.valor}
          className={CONTROL}
          {...bloqueo}
        />
      )}
    </div>
  );
}

export function FaseEntregable({ entregable, modo, onGuardar }: FaseEntregableProps) {
  const idBase = useId();

  function enviar(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (modo === "edicion") onGuardar?.();
  }

  return (
    <form onSubmit={enviar} className="flex flex-col gap-4">
      {modo === "solo-lectura" && entregable.versionCongelada ? (
        <p className="text-s text-muted">Versión congelada: {entregable.versionCongelada}</p>
      ) : null}
      {entregable.campos.map((campo) => (
        <CampoEntregable key={campo.id} campo={campo} modo={modo} idBase={idBase} />
      ))}
      {modo === "edicion" ? (
        <div>
          <Button type="submit" variant="primary">
            Guardar
          </Button>
        </div>
      ) : null}
    </form>
  );
}

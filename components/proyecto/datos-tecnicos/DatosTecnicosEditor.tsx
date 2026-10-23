"use client";

import { useCallback, useId, useMemo, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Notice } from "@/components/ui/Notice";
import { Panel } from "@/components/ui/Panel";
import { calcularCapacidad } from "@/lib/capacidad";
import {
  DEFINICIONES,
  GRUPOS,
  contarEditados,
  contarPendientes,
  esReferenciaCatastralValida,
  marcarTodoVerificado,
  obtenerDatosTecnicos,
  reconsultar,
  restaurarDato,
  type DatoTecnico,
  type DatosTecnicos,
} from "@/lib/datos-tecnicos";
import type { ModoFase } from "@/lib/fases";
import { PanelCapacidad } from "./PanelCapacidad";
import { PanelGrupo } from "./PanelGrupo";
import { ResumenVerificacion } from "./ResumenVerificacion";

export type DatosTecnicosEditorProps = {
  referenciaCatastral: string;
  inicial: DatosTecnicos | null;
  modo: ModoFase;
  /** Por defecto, el contrato de `lib/datos-tecnicos` (la consulta real va por la API del servidor). */
  consultar?: (referenciaCatastral: string) => Promise<DatosTecnicos>;
};

const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
const AVISO_REFERENCIA = "La referencia catastral debe tener 20 caracteres.";
const AVISO_FALLO = "No se pudo consultar. Puedes introducir los datos manualmente.";

function fechaLegible(iso: string): string {
  const [a, m, d] = iso.split("-").map(Number);
  return `${d} ${MESES[m - 1]} ${a}`;
}

/** Plantilla vacía para la ruta manual: ningún dato tiene origen, así que nada se marca como editado. */
function datosVacios(): DatoTecnico[] {
  return DEFINICIONES.map((d) => ({ id: d.id, valor: "", original: null, verificado: false }));
}

const porGrupo = GRUPOS.map((grupo) => ({ grupo, definiciones: DEFINICIONES.filter((d) => d.grupo === grupo.id) }));

export function DatosTecnicosEditor({
  referenciaCatastral,
  inicial,
  modo,
  consultar = obtenerDatosTecnicos,
}: DatosTecnicosEditorProps) {
  const idReferencia = useId();
  const editable = modo === "edicion";
  const [referencia, setReferencia] = useState(referenciaCatastral || inicial?.referenciaCatastral || "");
  const [datos, setDatos] = useState<DatoTecnico[] | null>(inicial?.datos ?? null);
  const [consultadoEl, setConsultadoEl] = useState<string | null>(inicial?.consultadoEl ?? null);
  const [consultando, setConsultando] = useState(false);
  const [aviso, setAviso] = useState<"referencia" | "fallo" | null>(null);

  const actualizar = useCallback((id: string, cambio: (d: DatoTecnico) => DatoTecnico) => {
    setDatos((prev) => (prev ? prev.map((d) => (d.id === id ? cambio(d) : d)) : prev));
  }, []);
  const onCambiar = useCallback((id: string, valor: string) => actualizar(id, (d) => ({ ...d, valor })), [actualizar]);
  const onVerificar = useCallback(
    (id: string, verificado: boolean) => actualizar(id, (d) => ({ ...d, verificado })),
    [actualizar],
  );
  const onRestaurar = useCallback((id: string) => actualizar(id, restaurarDato), [actualizar]);
  const onMarcarTodo = useCallback(() => setDatos((prev) => (prev ? marcarTodoVerificado(prev) : prev)), []);

  async function pedirDatos() {
    if (!editable || consultando) return;
    if (!esReferenciaCatastralValida(referencia)) {
      setAviso("referencia");
      return;
    }
    setAviso(null);
    setConsultando(true);
    try {
      const resultado = await consultar(referencia.trim());
      setDatos((prev) => (prev ? reconsultar(prev, resultado.datos) : resultado.datos));
      setConsultadoEl(resultado.consultadoEl);
    } catch {
      setAviso("fallo");
    } finally {
      setConsultando(false);
    }
  }

  function entradaManual() {
    setDatos(datosVacios());
    setConsultadoEl(null);
    setAviso(null);
  }

  const porId = useMemo(() => (datos ? new Map(datos.map((d) => [d.id, d])) : null), [datos]);
  const capacidad = useMemo(() => (datos ? calcularCapacidad(datos) : null), [datos]);

  if (!datos && modo === "solo-lectura") {
    return (
      <Panel title="Datos técnicos del inmueble">
        <p className="text-s text-muted">Sin datos técnicos registrados.</p>
      </Panel>
    );
  }

  return (
    <Panel
      title="Datos técnicos del inmueble"
      description="Todos editables. Un dato cambiado conserva su valor de origen, y cada dato se puede marcar como verificado."
    >
      <div className="flex flex-wrap items-end gap-2">
        <div className="flex min-w-56 flex-1 flex-col gap-1.5">
          <label htmlFor={idReferencia} className="text-s font-medium">
            Referencia catastral (de la ficha)
          </label>
          <input
            id={idReferencia}
            type="text"
            maxLength={20}
            placeholder="20 caracteres"
            value={referencia}
            disabled={!editable}
            aria-invalid={aviso === "referencia"}
            onChange={(e) => {
              setReferencia(e.target.value);
              if (aviso === "referencia") setAviso(null);
            }}
            className="w-full rounded-base border border-hair bg-surface px-3 py-2 text-m tracking-wide text-ink tabular-nums uppercase disabled:bg-surface-2 disabled:text-muted"
          />
        </div>
        <Button variant="primary" disabled={!editable || consultando} onClick={pedirDatos}>
          {consultando ? "Consultando…" : datos ? "Volver a consultar" : "Obtener datos técnicos"}
        </Button>
      </div>

      <div aria-live="polite" className="flex flex-col gap-2">
        {aviso === "referencia" ? <Notice tone="warn">{AVISO_REFERENCIA}</Notice> : null}
        {aviso === "fallo" ? (
          <Notice tone="bad">
            <span className="flex flex-wrap items-center gap-3">
              {AVISO_FALLO}
              {!datos ? (
                <Button size="sm" onClick={entradaManual}>
                  Introducir datos manualmente
                </Button>
              ) : null}
            </span>
          </Notice>
        ) : null}
        {datos && consultadoEl ? (
          <p className="text-xs text-muted">
            Consultado el {fechaLegible(consultadoEl)} a través del servidor. Volver a consultar sustituye los datos de
            origen y conserva los manuales.
          </p>
        ) : null}
      </div>

      {datos && porId ? (
        <>
          <ResumenVerificacion
            pendientes={contarPendientes(datos)}
            editados={contarEditados(datos)}
            deshabilitado={!editable}
            onMarcarTodo={onMarcarTodo}
          />
          <div className="grid grid-cols-2 items-start gap-4">
            {porGrupo.map(({ grupo, definiciones }) => (
              <PanelGrupo
                key={grupo.id}
                grupo={grupo}
                definiciones={definiciones}
                datos={porId}
                deshabilitado={!editable}
                onCambiar={onCambiar}
                onVerificar={onVerificar}
                onRestaurar={onRestaurar}
              />
            ))}
            <PanelCapacidad capacidad={capacidad} />
          </div>
        </>
      ) : null}
    </Panel>
  );
}

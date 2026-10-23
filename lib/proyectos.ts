/**
 * Capa de datos de EJEMPLO (ficticios) de RGB-10.
 * Las firmas exportadas son el contrato con la API: cuando exista el backend
 * (RGB-9) se sustituye el bloque «DATOS DE EJEMPLO» por el cliente de la API
 * sin tocar los componentes.
 */
import { FASES, type FaseId } from "@/lib/fases";

export interface Proyecto {
  codigo: string;
  nombre: string;
  faseActual: FaseId;
}

export type TipoCampo = "texto" | "area" | "fecha";

export interface Campo {
  id: string;
  etiqueta: string;
  tipo: TipoCampo;
  valor: string;
}

export interface EntregableFase {
  fase: FaseId;
  versionCongelada: string | null;
  campos: Campo[];
}

// ---- DATOS DE EJEMPLO (sustituible por el cliente de la API) ----

const PROYECTOS: readonly Proyecto[] = [
  { codigo: "PRY-EJ-001", nombre: "Vivienda unifamiliar (ejemplo)", faseActual: 3 },
  { codigo: "PRY-EJ-002", nombre: "Reforma de local comercial (ejemplo)", faseActual: 0 },
  { codigo: "PRY-EJ-003", nombre: "Edificio de oficinas (ejemplo)", faseActual: 6 },
];

function camposDeEjemplo(fase: FaseId): Campo[] {
  const { nombre, entregable } = FASES[fase];
  return [
    { id: "titulo", etiqueta: `Título de «${entregable}»`, tipo: "texto", valor: `${entregable} de ejemplo` },
    { id: "resumen", etiqueta: `Resumen de la fase ${nombre}`, tipo: "area", valor: `Texto ficticio de la fase ${nombre.toLowerCase()}.` },
    { id: "fecha", etiqueta: "Fecha prevista de cierre", tipo: "fecha", valor: `2026-0${fase + 1}-15` },
  ];
}

// ---- Funciones públicas (mismas firmas que el cliente de la API) ----

export async function listarProyectos(): Promise<Proyecto[]> {
  return PROYECTOS.map((p) => ({ ...p }));
}

export async function obtenerProyecto(codigo: string): Promise<Proyecto | null> {
  const p = PROYECTOS.find((x) => x.codigo === codigo);
  return p ? { ...p } : null;
}

export async function obtenerEntregable(codigo: string, fase: FaseId): Promise<EntregableFase> {
  const proyecto = PROYECTOS.find((x) => x.codigo === codigo);
  if (!proyecto) return { fase, versionCongelada: null, campos: [] };
  return {
    fase,
    versionCongelada: fase < proyecto.faseActual ? "v1" : null,
    campos: camposDeEjemplo(fase),
  };
}

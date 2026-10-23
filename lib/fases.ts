export type FaseId = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7;

export interface Fase {
  id: FaseId;
  nombre: string;
  /** Entregable de salida con el que se cierra la fase. */
  entregable: string;
  /** Qué hace posible la promoción a la fase siguiente. */
  promueve: string;
}

export const FASES: readonly Fase[] = [
  { id: 0, nombre: "Oportunidad", entregable: "Ficha de oportunidad", promueve: "Decisión de aceptar el encargo" },
  { id: 1, nombre: "Inicio", entregable: "Encargo y datos de partida", promueve: "Encargo firmado y datos de partida completos" },
  { id: 2, nombre: "Briefing y concepto", entregable: "Briefing y concepto aprobados", promueve: "Concepto aprobado por el cliente" },
  { id: 3, nombre: "Anteproyecto", entregable: "Anteproyecto", promueve: "Anteproyecto aprobado por el cliente" },
  { id: 4, nombre: "Proyecto básico", entregable: "Proyecto básico", promueve: "Proyecto básico visado y aprobado" },
  { id: 5, nombre: "Proyecto de ejecución", entregable: "Proyecto de ejecución", promueve: "Proyecto de ejecución aprobado y licencia concedida" },
  { id: 6, nombre: "Obra", entregable: "Acta de recepción de obra", promueve: "Obra recibida sin reservas pendientes" },
  { id: 7, nombre: "Cierre", entregable: "Informe de cierre", promueve: "Cierre administrativo y económico completado" },
];

export type EstadoFase = "hecha" | "actual" | "vista";
export type ModoFase = "edicion" | "solo-lectura" | "vista-previa";

/** Única fuente de verdad del estado de una fase respecto a la actual. */
export function estadoFase(fase: FaseId, actual: FaseId): EstadoFase {
  if (fase < actual) return "hecha";
  return fase === actual ? "actual" : "vista";
}

const MODO_POR_ESTADO: Record<EstadoFase, ModoFase> = {
  hecha: "solo-lectura",
  actual: "edicion",
  vista: "vista-previa",
};

/** Única fuente de verdad del modo de pantalla de una fase. */
export function modoFase(fase: FaseId, actual: FaseId): ModoFase {
  return MODO_POR_ESTADO[estadoFase(fase, actual)];
}

/** Acepta solo "0".."7" exactos. */
export function parseFaseId(raw: string): FaseId | null {
  return /^[0-7]$/.test(raw) ? (Number(raw) as FaseId) : null;
}

export type PhaseId = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7;

export interface Phase {
  id: PhaseId;
  name: string;
  /** Entregable de salida con el que se cierra la fase. */
  deliverable: string;
  /** Rol con autoridad para promover a la fase siguiente (PRD). */
  promueve: string;
}

export const PHASES: readonly Phase[] = [
  { id: 0, name: "Oportunidad", deliverable: "Scoring (7 criterios de 1 a 5, nota sobre 100, umbral) + tipología y escala → plan de semanas", promueve: "Socio y director" },
  { id: 1, name: "Inicio", deliverable: "Ficha del proyecto completa (incluye referencia catastral, contrato, gobierno, repositorio)", promueve: "Socio y director" },
  { id: 2, name: "Briefing y concepto", deliverable: "Datos técnicos del inmueble verificados + brief manual (con topográfico y alineación) + aprobación del cliente registrada", promueve: "Director de proyecto" },
  { id: 3, name: "Anteproyecto", deliverable: "Paquete de anteproyecto aprobado y congelado; visor de relieve 3D como apoyo", promueve: "Director de proyecto" },
  { id: 4, name: "Proyecto básico", deliverable: "Básico emitido y licencia concedida con condiciones", promueve: "Firmante habilitado" },
  { id: 5, name: "Proyecto de ejecución", deliverable: "Ejecución coordinada, visada y emitida", promueve: "Firmante habilitado" },
  { id: 6, name: "Obra", deliverable: "Registro de obra completo y recepción", promueve: "Dirección facultativa" },
  { id: 7, name: "Cierre", deliverable: "Certificado final, Libro del Edificio y lecciones", promueve: "Sponsor" },
];

export type PhaseState = "done" | "current" | "upcoming";
export type PhaseMode = "edit" | "read-only" | "preview";

/** Única fuente de verdad del estado de una fase respecto a la actual. */
export function phaseState(phase: PhaseId, current: PhaseId): PhaseState {
  if (phase < current) return "done";
  return phase === current ? "current" : "upcoming";
}

const MODE_BY_STATE: Record<PhaseState, PhaseMode> = {
  done: "read-only",
  current: "edit",
  upcoming: "preview",
};

/** Única fuente de verdad del modo de pantalla de una fase. */
export function modoFase(phase: PhaseId, current: PhaseId): PhaseMode {
  return MODE_BY_STATE[phaseState(phase, current)];
}

/** Acepta solo "0".."7" exactos. */
export function parsePhaseId(raw: string): PhaseId | null {
  return /^[0-7]$/.test(raw) ? (Number(raw) as PhaseId) : null;
}

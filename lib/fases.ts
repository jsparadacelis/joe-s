export type FaseId = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7;

export interface Fase {
  id: FaseId;
  nombre: string;
  /** Entregable de salida con el que se cierra la fase. */
  entregable: string;
  /** Rol con autoridad para promover a la fase siguiente (PRD). */
  promueve: string;
}

export const FASES: readonly Fase[] = [
  { id: 0, nombre: "Oportunidad", entregable: "Scoring (7 criterios de 1 a 5, nota sobre 100, umbral) + tipología y escala → plan de semanas", promueve: "Socio y director" },
  { id: 1, nombre: "Inicio", entregable: "Ficha del proyecto completa (incluye referencia catastral, contrato, gobierno, repositorio)", promueve: "Socio y director" },
  { id: 2, nombre: "Briefing y concepto", entregable: "Datos técnicos del inmueble verificados + brief manual (con topográfico y alineación) + aprobación del cliente registrada", promueve: "Director de proyecto" },
  { id: 3, nombre: "Anteproyecto", entregable: "Paquete de anteproyecto aprobado y congelado; visor de relieve 3D como apoyo", promueve: "Director de proyecto" },
  { id: 4, nombre: "Proyecto básico", entregable: "Básico emitido y licencia concedida con condiciones", promueve: "Firmante habilitado" },
  { id: 5, nombre: "Proyecto de ejecución", entregable: "Ejecución coordinada, visada y emitida", promueve: "Firmante habilitado" },
  { id: 6, nombre: "Obra", entregable: "Registro de obra completo y recepción", promueve: "Dirección facultativa" },
  { id: 7, nombre: "Cierre", entregable: "Certificado final, Libro del Edificio y lecciones", promueve: "Sponsor" },
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

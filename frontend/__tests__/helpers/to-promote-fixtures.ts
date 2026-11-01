import type { ToPromote, ToPromoteProject } from "@/lib/to-promote";

/** Fictitious `GET /api/to-promote` payload (contract of RGB-12a), already in the server's order. */
export const API_TO_PROMOTE = {
  ready_count: 2,
  projects: [
    {
      code: "PRY-2026-001",
      name: "Vivienda unifamiliar Los Almendros (demo)",
      phase: 0,
      phase_name: "Oportunidad",
      deliverable: "Scoring (7 criterios de 1 a 5, nota sobre 100, umbral) + tipología y escala → plan de semanas",
      state: "ready",
      reason: null,
      promoter: "Socio o director",
      can_promote: true,
    },
    {
      code: "PRY-2026-002",
      name: "Nave logística Polígono Muestra (demo)",
      phase: 0,
      phase_name: "Oportunidad",
      deliverable: "Scoring (7 criterios de 1 a 5, nota sobre 100, umbral) + tipología y escala → plan de semanas",
      state: "ready",
      reason: null,
      promoter: "Socio o director",
      can_promote: false,
    },
    {
      code: "PRY-2026-003",
      name: "Rehabilitación Casa del Molino (demo)",
      phase: 1,
      phase_name: "Inicio",
      deliverable: "Ficha del proyecto completa (incluye referencia catastral, contrato, gobierno, repositorio)",
      state: "in_progress",
      reason: "Falta: Referencia catastral, Alcance incluido, Alcance excluido y 10 más.",
      promoter: "Socio o director",
      can_promote: true,
    },
    {
      code: "PRY-2026-004",
      name: "Edificio de 12 viviendas Calle Muestra (demo)",
      phase: 2,
      phase_name: "Briefing y concepto",
      deliverable: "Datos técnicos del inmueble verificados + brief manual + aprobación del cliente registrada",
      state: "blocked",
      reason: "En pausa; reanudación prevista el 21/11/2026.",
      promoter: "Director de proyecto",
      can_promote: false,
    },
  ],
};

export function makeProject(overrides: Partial<ToPromoteProject> = {}): ToPromoteProject {
  return {
    code: "PRY-2026-010",
    name: "Casa de prueba (demo)",
    phase: 1,
    phaseName: "Inicio",
    deliverable: "Ficha del proyecto completa",
    state: "in_progress",
    reason: "Falta: Referencia catastral.",
    promoter: "Socio o director",
    canPromote: false,
    ...overrides,
  };
}

/** The same payload as the front model (what `fetchToPromote` returns for `API_TO_PROMOTE`). */
export const TO_PROMOTE: ToPromote = {
  readyCount: 2,
  projects: [
    makeProject({
      code: "PRY-2026-001", name: "Vivienda unifamiliar Los Almendros (demo)", phase: 0, phaseName: "Oportunidad",
      deliverable: "Scoring completo", state: "ready", reason: null, promoter: "Socio o director", canPromote: true,
    }),
    makeProject({
      code: "PRY-2026-002", name: "Nave logística Polígono Muestra (demo)", phase: 0, phaseName: "Oportunidad",
      deliverable: "Scoring completo", state: "ready", reason: null, promoter: "Socio o director", canPromote: false,
    }),
    makeProject({
      code: "PRY-2026-003", name: "Rehabilitación Casa del Molino (demo)", phase: 1, phaseName: "Inicio",
      deliverable: "Ficha completa", state: "in_progress", reason: "Falta: Referencia catastral y 2 más.",
      promoter: "Socio o director", canPromote: true,
    }),
    makeProject({
      code: "PRY-2026-004", name: "Edificio de 12 viviendas Calle Muestra (demo)", phase: 2, phaseName: "Briefing y concepto",
      deliverable: "Brief aprobado", state: "blocked", reason: "En pausa; reanudación prevista el 21/11/2026.",
      promoter: "Director de proyecto", canPromote: false,
    }),
  ],
};

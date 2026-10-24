/**
 * SAMPLE (fictitious) data layer of RGB-10.
 * The exported signatures are the contract with the API: once the backend exists
 * (RGB-9) the "SAMPLE DATA" block is replaced by the API client
 * without touching the components.
 */
import { PHASES, type PhaseId } from "@/lib/phases";

export interface Project {
  code: string;
  name: string;
  currentPhase: PhaseId;
}

export type FieldType = "text" | "textarea" | "date";

export interface Field {
  id: string;
  label: string;
  type: FieldType;
  value: string;
}

export interface PhaseDeliverable {
  phase: PhaseId;
  frozenVersion: string | null;
  fields: Field[];
}

// ---- SAMPLE DATA (replaceable by the API client) ----

const PROJECTS: readonly Project[] = [
  { code: "PRY-EJ-001", name: "Vivienda unifamiliar (ejemplo)", currentPhase: 3 },
  { code: "PRY-EJ-002", name: "Reforma de local comercial (ejemplo)", currentPhase: 0 },
  { code: "PRY-EJ-003", name: "Edificio de oficinas (ejemplo)", currentPhase: 6 },
  { code: "PRY-EJ-004", name: "Local comercial (ejemplo)", currentPhase: 2 },
];

/** Cadastral reference (fictitious) from each project's sheet. */
const CADASTRAL_REFERENCES: Readonly<Record<string, string>> = {
  "PRY-EJ-001": "1234567DG3413S0001AB",
  "PRY-EJ-004": "1234567DG3413S0001AB",
};

function sampleFields(phase: PhaseId): Field[] {
  const { name } = PHASES[phase];
  return [
    { id: "title", label: `Título del entregable de ${name}`, type: "text", value: `${name} (texto de ejemplo)` },
    { id: "summary", label: `Resumen de la fase ${name}`, type: "textarea", value: `Texto ficticio de la fase ${name.toLowerCase()}.` },
    { id: "date", label: "Fecha prevista de cierre", type: "date", value: `2026-0${phase + 1}-15` },
  ];
}

// ---- Public functions (same signatures as the API client) ----

export async function listProjects(): Promise<Project[]> {
  return PROJECTS.map((p) => ({ ...p }));
}

export async function fetchProject(code: string): Promise<Project | null> {
  const p = PROJECTS.find((x) => x.code === code);
  return p ? { ...p } : null;
}

export async function fetchDeliverable(code: string, phase: PhaseId): Promise<PhaseDeliverable> {
  const project = PROJECTS.find((x) => x.code === code);
  if (!project) return { phase, frozenVersion: null, fields: [] };
  return {
    phase,
    frozenVersion: phase < project.currentPhase ? "v1" : null,
    fields: sampleFields(phase),
  };
}

/** Cadastral reference from the project sheet; empty string if it has none. */
export async function fetchCadastralReference(code: string): Promise<string> {
  return CADASTRAL_REFERENCES[code] ?? "";
}

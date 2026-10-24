/**
 * Projects. Two sources live together (RGB-13):
 * - REAL projects (code PRY-AAAA-NNN, created by «Alta de oportunidad») are read from the API:
 *   `GET /api/projects/{code}` and, for the list, `GET /api/portfolio`.
 * - SAMPLE projects (PRY-EJ-00N, fictitious, RGB-10) are still served locally: they back the screens whose
 *   API does not exist yet (deliverables, technical data, relief, plan and timing).
 * A code that matches a sample project never goes to the API; any other code does.
 * The deliverables and the cadastral reference are still sample-only: a real project gets empty ones.
 */
import { request as defaultRequest, ApiError, type ApiRequest } from "@/lib/api";
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
  { code: "PRY-EJ-005", name: "Rehabilitación de fachada (ejemplo)", currentPhase: 5 },
  { code: "PRY-EJ-006", name: "Nave logística (ejemplo)", currentPhase: 4 },
  { code: "PRY-EJ-007", name: "Residencia de mayores (ejemplo)", currentPhase: 0 },
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

// ---- Public functions ----

interface ApiProject {
  code: string;
  name: string;
  current_phase: PhaseId;
}

/** The real projects the study has, as the portfolio lists them (there is no dedicated list endpoint). */
async function listRealProjects(request: ApiRequest): Promise<Project[]> {
  const { projects } = await request<{ projects: { code: string; name: string; phase: PhaseId }[] }>("/api/portfolio");
  return projects.map((p) => ({ code: p.code, name: p.name, currentPhase: p.phase }));
}

/**
 * Real projects followed by the samples. If the API is unreachable only the samples are listed,
 * so the screens that depend on them keep working.
 */
export async function listProjects(request: ApiRequest = defaultRequest): Promise<Project[]> {
  let real: Project[] = [];
  try {
    real = await listRealProjects(request);
  } catch {
    real = [];
  }
  return [...real, ...PROJECTS.map((p) => ({ ...p }))];
}

/** `null` if the project does not exist (404). Other API failures are thrown, not disguised as «not found». */
export async function fetchProject(code: string, request: ApiRequest = defaultRequest): Promise<Project | null> {
  const sample = PROJECTS.find((x) => x.code === code);
  if (sample) return { ...sample };
  if (code === "") return null;
  try {
    const project = await request<ApiProject>(`/api/projects/${encodeURIComponent(code)}`);
    return { code: project.code, name: project.name, currentPhase: project.current_phase };
  } catch (error) {
    if (error instanceof ApiError && error.status === 404 && error.code === "project_not_found") return null;
    throw error;
  }
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

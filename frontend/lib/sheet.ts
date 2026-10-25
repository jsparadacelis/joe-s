/**
 * Project sheet (RGB-17a): read-only blocks and required fields of phase 1. The completeness is computed
 * by the API; this module only types the response, validates its shape and names things in Spanish.
 */
import { ApiError, request as defaultRequest, type ApiRequest } from "@/lib/api";
import { PHASES, type PhaseId } from "@/lib/phases";
import { PROJECT_TYPE_LABELS, SCALE_LABELS } from "@/lib/plan-settings";
import { TRAFFIC_LIGHT_LABEL } from "@/lib/timing";

export type SheetBlockId =
  | "identification"
  | "engagement"
  | "governance"
  | "client_contact"
  | "timing"
  | "risk"
  | "information"
  | "status";

export type SheetFieldId =
  | "code"
  | "name"
  | "client"
  | "location"
  | "cadastral_reference"
  | "project_type"
  | "scale"
  | "scope_included"
  | "scope_excluded"
  | "contract_signed_on"
  | "sponsor"
  | "project_director"
  | "technical_lead"
  | "team"
  | "external_collaborators"
  | "contact"
  | "confirmed_plan"
  | "next_milestone"
  | "next_milestone_on"
  | "main_risk"
  | "risk_owner"
  | "repository_path"
  | "traffic_light";

/** Confirmed plan in the wire shape: weeks keyed by phase number ("1".."7"). */
export interface PlanValue {
  weeks_by_phase: Record<string, number>;
  total: number;
}

export interface SheetField {
  field: SheetFieldId;
  required: boolean;
  value: string | PlanValue | null;
  /** `scoring`: preloaded from the opportunity, the plan or the scoring; `auto`: system; `manual`: typed by a person. */
  source: "scoring" | "auto" | "manual";
}

export interface SheetBlockData {
  block: SheetBlockId;
  filled: number;
  required: number;
  complete: boolean;
  fields: SheetField[];
}

export interface ProjectSheet {
  code: string;
  phase: number;
  completion: { filled: number; required: number; percent: number };
  blocks: SheetBlockData[];
}

export const BLOCK_LABELS: Record<SheetBlockId, string> = {
  identification: "Identificación",
  engagement: "Encargo",
  governance: "Gobierno",
  client_contact: "Cliente",
  timing: "Tiempo",
  risk: "Riesgo",
  information: "Información",
  status: "Estado",
};

export const FIELD_LABELS: Record<SheetFieldId, string> = {
  code: "Código",
  name: "Nombre",
  client: "Cliente",
  location: "Ubicación",
  cadastral_reference: "Referencia catastral",
  project_type: "Tipología",
  scale: "Escala",
  scope_included: "Alcance incluido",
  scope_excluded: "Alcance excluido",
  contract_signed_on: "Fecha de firma del contrato",
  sponsor: "Promotor",
  project_director: "Dirección del proyecto",
  technical_lead: "Responsable técnico",
  team: "Equipo",
  external_collaborators: "Colaboradores externos",
  contact: "Contacto del cliente",
  confirmed_plan: "Plan confirmado",
  next_milestone: "Próximo hito",
  next_milestone_on: "Fecha del próximo hito",
  main_risk: "Riesgo principal",
  risk_owner: "Responsable del riesgo",
  repository_path: "Ruta del repositorio",
  traffic_light: "Semáforo",
};

/** Spanish names; an unknown id (a newer API) comes back as given. */
export const blockLabel = (id: SheetBlockId): string => BLOCK_LABELS[id] ?? id;
export const fieldLabel = (id: SheetFieldId): string => FIELD_LABELS[id] ?? id;

export const weeksText = (weeks: number): string => `${weeks} ${weeks === 1 ? "semana" : "semanas"}`;

const ENUM_LABELS: Partial<Record<SheetFieldId, Record<string, string>>> = {
  project_type: PROJECT_TYPE_LABELS,
  scale: SCALE_LABELS,
  traffic_light: TRAFFIC_LIGHT_LABEL,
};

/** Spanish text of a field value; `null` when the field is empty. */
export function sheetValueText({ field, value }: SheetField): string | null {
  if (value === null) return null;
  if (typeof value === "object") return weeksText(value.total);
  return ENUM_LABELS[field]?.[value] ?? value;
}

/** The confirmed plan as seven rows in phase order. */
export function planBreakdown(plan: PlanValue): { phase: PhaseId; name: string; weeks: number }[] {
  return PHASES.filter((p) => p.id >= 1).map((p) => ({ phase: p.id, name: p.name, weeks: plan.weeks_by_phase[String(p.id)] }));
}

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

function isValidSheet(body: unknown): body is ProjectSheet {
  if (!isObject(body) || typeof body.code !== "string" || typeof body.phase !== "number") return false;
  const { completion, blocks } = body;
  if (!isObject(completion) || typeof completion.filled !== "number" || typeof completion.required !== "number" || typeof completion.percent !== "number") {
    return false;
  }
  return Array.isArray(blocks) && blocks.every((b) => isObject(b) && typeof b.block === "string" && Array.isArray(b.fields));
}

export async function fetchProjectSheet(code: string, request: ApiRequest = defaultRequest): Promise<ProjectSheet> {
  const body = await request<unknown>(`/api/projects/${encodeURIComponent(code)}/sheet`);
  if (!isValidSheet(body)) {
    throw new ApiError(200, "invalid_sheet_response", "La respuesta de la ficha no es válida. Inténtalo de nuevo.");
  }
  return body;
}

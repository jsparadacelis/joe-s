import { request as defaultRequest, type ApiRequest } from "@/lib/api";

export type ProjectType =
  | "single_family_house"
  | "rehabilitation"
  | "multi_family"
  | "facility"
  | "industrial"
  | "renovation_interiors";
export type Scale = "small" | "medium" | "large";

export const PROJECT_TYPES: readonly ProjectType[] = [
  "single_family_house",
  "rehabilitation",
  "multi_family",
  "facility",
  "industrial",
  "renovation_interiors",
];
export const SCALES: readonly Scale[] = ["small", "medium", "large"];

export const PROJECT_TYPE_LABELS: Record<ProjectType, string> = {
  single_family_house: "Vivienda unifamiliar",
  rehabilitation: "Rehabilitación",
  multi_family: "Plurifamiliar",
  facility: "Dotacional",
  industrial: "Industrial",
  renovation_interiors: "Reforma de interiores",
};
export const SCALE_LABELS: Record<Scale, string> = { small: "Pequeña", medium: "Media", large: "Grande" };

export interface PlanSettings {
  templates: Record<ProjectType, number[]>;
  scaleFactors: Record<Scale, number>;
}

const WEEKS_COUNT = 7;
export const MAX_WEEKS = 520;
export const MIN_FACTOR = 0.1;
export const MAX_FACTOR = 10;
const WEEKS_MESSAGE = `Cada plantilla necesita exactamente ${WEEKS_COUNT} valores de semanas, enteros y entre 1 y ${MAX_WEEKS}.`;
const FACTOR_MESSAGE = "El factor de escala debe ser un número entre 0,1 y 10.";

interface PlanSettingsResponse {
  templates: Record<ProjectType, number[]>;
  scale_factors: Record<Scale, number>;
}

export async function fetchPlanSettings(request: ApiRequest = defaultRequest): Promise<PlanSettings> {
  const { templates, scale_factors } = await request<PlanSettingsResponse>("/api/settings/plan");
  return { templates, scaleFactors: scale_factors };
}

export async function updateTemplate(
  type: ProjectType,
  weeks: number[],
  request: ApiRequest = defaultRequest,
): Promise<void> {
  await request(`/api/settings/plan/templates/${type}`, { method: "PUT", body: { weeks } });
}

export async function updateScaleFactor(
  scale: Scale,
  factor: number,
  request: ApiRequest = defaultRequest,
): Promise<void> {
  await request(`/api/settings/plan/scale-factors/${scale}`, { method: "PUT", body: { factor } });
}

/** Same rule as the API: seven integers, each between 1 and MAX_WEEKS. Returns the error message or null. */
export function validateWeeks(weeks: number[]): string | null {
  const valid = weeks.length === WEEKS_COUNT && weeks.every((w) => Number.isInteger(w) && w >= 1 && w <= MAX_WEEKS);
  return valid ? null : WEEKS_MESSAGE;
}

/** Same rule as the API: finite and between MIN_FACTOR and MAX_FACTOR. Returns the error message or null. */
export function validateFactor(factor: number): string | null {
  const valid = Number.isFinite(factor) && factor >= MIN_FACTOR && factor <= MAX_FACTOR;
  return valid ? null : FACTOR_MESSAGE;
}

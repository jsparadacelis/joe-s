/**
 * Brief (RGB-32b): client of `/api/projects/{code}/brief` (RGB-32a). The server decides permissions, completeness and
 * what is valid; this module types the contract, checks the shape of the answers, names things in Spanish and replicates
 * the server validation so the person sees the mistake next to the field before sending.
 */
import { ApiError, request as defaultRequest, type ApiRequest } from "@/lib/api";

export const BRIEF_FIELD_IDS = [
  "needs",
  "program",
  "constraints",
  "target_budget",
  "deadline",
  "topographic_survey",
  "alignment",
  "client_approval",
] as const;
export type BriefFieldId = (typeof BRIEF_FIELD_IDS)[number];

export const CLIENT_APPROVALS = ["pending", "email", "meeting", "signed"] as const;
export type ClientApproval = (typeof CLIENT_APPROVALS)[number];

export const BRIEF_FIELD_LABELS: Record<BriefFieldId, string> = {
  needs: "Necesidades",
  program: "Programa",
  constraints: "Condicionantes",
  target_budget: "Presupuesto objetivo",
  deadline: "Plazo",
  topographic_survey: "Levantamiento topográfico",
  alignment: "Alineación",
  client_approval: "Aprobación del cliente",
};

export const CLIENT_APPROVAL_LABELS: Record<ClientApproval, string> = {
  pending: "Pendiente",
  email: "Por correo",
  meeting: "En reunión",
  signed: "Con firma",
};

/** The first five fields are required to promote. */
export const REQUIRED_BRIEF_FIELDS: readonly BriefFieldId[] = BRIEF_FIELD_IDS.slice(0, 5);

/** Spanish names; an unknown id comes back as given. */
export const briefFieldLabel = (id: BriefFieldId): string => BRIEF_FIELD_LABELS[id] ?? id;
export const clientApprovalLabel = (value: ClientApproval): string => CLIENT_APPROVAL_LABELS[value] ?? value;

const SOURCE_LABELS: Record<string, string> = {
  catastro: "Catastro",
  inspire: "INSPIRE",
  open_meteo: "Open-Meteo",
  calculated: "Calculado",
  cte: "CTE",
  ncse: "NCSE-02",
  pvgis: "PVGIS",
  manual: "Manual",
};

/** Spanish name of the origin of a technical datum; an unknown source comes back as given. */
export const sourceLabel = (source: string): string => SOURCE_LABELS[source] ?? source;

export interface BriefFields {
  needs: string | null;
  program: string | null;
  constraints: string | null;
  target_budget: number | null;
  deadline: string | null;
  topographic_survey: string | null;
  alignment: string | null;
  client_approval: ClientApproval;
}

export interface BriefCompleteness {
  /** Spanish labels of the required fields still empty. */
  missing: string[];
  technical_data_obtained: boolean;
  technical_data_queried: boolean;
  client_approval_recorded: boolean;
  complete: boolean;
}

export interface BriefDatum {
  id: string;
  value: string;
  source: string;
  original: string | null;
  edited: boolean;
  verified: boolean;
}

export interface BriefTechnicalData {
  cadastral_reference: string | null;
  queried_at: string | null;
  unverified: string[];
  data: BriefDatum[];
}

export interface Brief {
  code: string;
  phase: number;
  /** `1` for the frozen version (phase > 2); `null` while it is a live draft. */
  frozen_version: number | null;
  fields: BriefFields;
  completeness: BriefCompleteness;
  technical_data: BriefTechnicalData;
  /** Computed by the server; the front does not know roles. */
  permissions: { can_edit: boolean; can_promote: boolean };
}

/** Body of `PUT /api/projects/{code}/brief`: only the fields that change; `null` clears one. */
export interface BriefUpdate {
  fields: {
    [K in BriefFieldId]?: K extends "client_approval" ? ClientApproval : BriefFields[K];
  };
}

export interface PromoteBriefResult {
  code: string;
  action: "promote";
  previous_phase: number;
  current_phase: number;
  frozen_version: number;
  brief: Brief;
}

const INVALID_MESSAGE = "La respuesta del brief no es válida. Inténtalo de nuevo.";
const invalidResponse = () => new ApiError(200, "invalid_brief_response", INVALID_MESSAGE);

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

function isValidBrief(body: unknown): body is Brief {
  if (!isObject(body) || typeof body.code !== "string" || typeof body.phase !== "number") return false;
  const { fields, completeness, permissions, technical_data, frozen_version } = body;
  if (frozen_version !== null && typeof frozen_version !== "number") return false;
  if (!isObject(fields) || !isObject(completeness) || !Array.isArray(completeness.missing)) return false;
  if (!isObject(permissions) || typeof permissions.can_edit !== "boolean" || typeof permissions.can_promote !== "boolean") return false;
  return isObject(technical_data) && Array.isArray(technical_data.data) && Array.isArray(technical_data.unverified);
}

function checkedBrief(body: unknown): Brief {
  if (!isValidBrief(body)) throw invalidResponse();
  return body;
}

const briefPath = (code: string) => `/api/projects/${encodeURIComponent(code)}/brief`;

export async function getBrief(code: string, request: ApiRequest = defaultRequest): Promise<Brief> {
  return checkedBrief(await request<unknown>(briefPath(code), { method: "GET" }));
}

/** Saves the changed fields and returns the whole brief, with the completeness and permissions recalculated. */
export async function saveBrief(code: string, update: BriefUpdate, request: ApiRequest = defaultRequest): Promise<Brief> {
  return checkedBrief(await request<unknown>(briefPath(code), { method: "PUT", body: update }));
}

/** Promotes to Anteproyecto and freezes the brief as version 1; 403, 404, 409 and 422 come as ApiError. */
export async function promoteBrief(code: string, request: ApiRequest = defaultRequest): Promise<PromoteBriefResult> {
  const body = await request<unknown>(`${briefPath(code)}/promote`, { method: "POST" });
  if (!isObject(body) || typeof body.current_phase !== "number" || typeof body.previous_phase !== "number") throw invalidResponse();
  return { ...(body as unknown as PromoteBriefResult), brief: checkedBrief(body.brief) };
}

// --- Client validation (mirrors the server; the server rules) ---

const BUDGET_MESSAGE = "El presupuesto objetivo debe ser un número mayor que 0, con punto decimal y hasta 2 decimales.";
const BUDGET_MAX_MESSAGE = "El presupuesto objetivo no puede superar 1.000.000.000 €.";
const DEADLINE_MESSAGE = "El plazo debe ser una fecha real con el formato AAAA-MM-DD, entre los años 2000 y 2100.";
const APPROVAL_MESSAGE = "La aprobación del cliente no es válida.";
const MAX_BUDGET = 1_000_000_000;
const MAX_TEXT = 2000;

function budgetProblem(trimmed: string): string | null {
  if (!/^\d+(\.\d{1,2})?$/.test(trimmed)) return BUDGET_MESSAGE;
  const value = Number(trimmed);
  if (value <= 0) return BUDGET_MESSAGE;
  return value > MAX_BUDGET ? BUDGET_MAX_MESSAGE : null;
}

function isRealDate(trimmed: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(trimmed);
  if (!match) return false;
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
  if (year < 2000 || year > 2100) return false;
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

/** `null` when the draft is valid; otherwise the Spanish message for the field. A blank draft clears the field. */
export function validateBriefField(id: BriefFieldId, draft: string): string | null {
  if (id === "client_approval") return (CLIENT_APPROVALS as readonly string[]).includes(draft) ? null : APPROVAL_MESSAGE;
  const trimmed = draft.trim();
  if (trimmed === "") return null;
  if (id === "target_budget") return budgetProblem(trimmed);
  if (id === "deadline") return isRealDate(trimmed) ? null : DEADLINE_MESSAGE;
  const label = BRIEF_FIELD_LABELS[id];
  if (Array.from(trimmed).length > MAX_TEXT) return `El campo «${label}» no puede superar ${MAX_TEXT} caracteres.`;
  // eslint-disable-next-line no-control-regex
  if (/\u0000|[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/.test(trimmed)) {
    return `El campo «${label}» contiene caracteres no válidos.`;
  }
  return null;
}

/** The number to send for a budget draft; `null` when blank or invalid. */
export function parseBudget(draft: string): number | null {
  const trimmed = draft.trim();
  if (trimmed === "" || budgetProblem(trimmed) !== null) return null;
  return Number(trimmed);
}

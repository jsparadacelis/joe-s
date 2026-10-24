/**
 * RGB-13 «Alta de oportunidad»: types, client-side validation and the API call.
 * The limits and the message format mirror `POST /api/opportunities` (docs/plans/RGB-13/contract.md),
 * so the user sees the same text whether the error is caught here or returned by the server.
 */
import { request as defaultRequest, type ApiRequest } from "@/lib/api";
import { PROJECT_TYPES, type ProjectType } from "@/lib/plan-settings";

/** Field names are the API's (snake_case) so a 422 `field` maps straight onto the form. */
export const OPPORTUNITY_FIELDS = [
  "name",
  "client",
  "location",
  "project_type",
  "owner",
  "estimated_budget",
  "deadline",
  "source",
  "decision_date",
] as const;
export type OpportunityField = (typeof OPPORTUNITY_FIELDS)[number];

/** Form state: every field is the text the person typed (or the selected option). */
export type OpportunityDraft = Record<OpportunityField, string>;
export type OpportunityErrors = Partial<Record<OpportunityField, string>>;

export const EMPTY_DRAFT: OpportunityDraft = Object.fromEntries(
  OPPORTUNITY_FIELDS.map((field) => [field, ""]),
) as OpportunityDraft;

/** Labels as the API uses them in its messages (the form shows «Presupuesto estimado (€)» on screen). */
export const FIELD_LABELS: Record<OpportunityField, string> = {
  name: "Nombre",
  client: "Cliente",
  location: "Localización",
  project_type: "Tipología",
  owner: "Responsable",
  estimated_budget: "Presupuesto estimado",
  deadline: "Plazo",
  source: "Fuente",
  decision_date: "Fecha de decisión",
};

export const REQUIRED_FIELDS: readonly OpportunityField[] = ["name", "client", "location", "project_type", "owner"];

const MAX_LENGTH: Partial<Record<OpportunityField, number>> = {
  name: 120,
  client: 120,
  location: 200,
  owner: 120,
  source: 120,
};
export const MAX_BUDGET = 1_000_000_000;

const required = (field: OpportunityField) => `El campo «${FIELD_LABELS[field]}» es obligatorio.`;
const invalid = (field: OpportunityField, reason: string) => `El campo «${FIELD_LABELS[field]}» no es válido: ${reason}.`;

const BUDGET_PATTERN = /^\d+(?:[.,]\d+)?$/;
const ISO_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

/** A budget typed as text (decimal comma or point) as a number, or the reason it is not valid. */
function parseBudget(text: string): { value: number } | { reason: string } {
  if (text.startsWith("-") && BUDGET_PATTERN.test(text.slice(1))) return { reason: "no puede ser negativo" };
  if (!BUDGET_PATTERN.test(text)) return { reason: "debe ser un número" };
  const normalized = text.replace(",", ".");
  const decimals = normalized.split(".")[1];
  const value = Number(normalized);
  // Same order as the server: the ceiling is checked before the decimals.
  if (value > MAX_BUDGET) return { reason: "no puede superar 1.000.000.000 €" };
  if (decimals !== undefined && decimals.length > 2) return { reason: "admite como máximo 2 decimales" };
  return { value };
}

/** The server rejects NUL and lone surrogates (Postgres text cannot hold them). */
function isStorable(text: string): boolean {
  return !text.includes("\u0000") && !/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/.test(text);
}

/** True for a real calendar date written as yyyy-mm-dd (2027-02-29 is not). */
function isIsoDate(text: string): boolean {
  const match = ISO_DATE_PATTERN.exec(text);
  if (!match) return false;
  const [, year, month, day] = match.map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

function validateField(field: OpportunityField, raw: string): string | undefined {
  const text = raw.trim();
  if (text === "") return REQUIRED_FIELDS.includes(field) ? required(field) : undefined;

  const max = MAX_LENGTH[field];
  if (max !== undefined || field === "project_type") {
    if (!isStorable(text)) return invalid(field, "contiene caracteres no permitidos");
  }
  // The server counts characters (code points), not UTF-16 units.
  if (max !== undefined && [...text].length > max) return invalid(field, `no puede superar los ${max} caracteres`);
  if (field === "project_type" && !(PROJECT_TYPES as readonly string[]).includes(text)) {
    return invalid(field, "no es una tipología admitida");
  }
  if (field === "estimated_budget") {
    const parsed = parseBudget(text);
    return "reason" in parsed ? invalid(field, parsed.reason) : undefined;
  }
  if (field === "deadline" || field === "decision_date") {
    if (!ISO_DATE_PATTERN.test(text)) return invalid(field, "debe ser una fecha con formato aaaa-mm-dd");
    if (!isIsoDate(text)) return invalid(field, "no es una fecha existente");
  }
  return undefined;
}

/** All the errors of a draft, keyed by field (the API reports only the first one). */
export function validateOpportunity(draft: OpportunityDraft): OpportunityErrors {
  const errors: OpportunityErrors = {};
  for (const field of OPPORTUNITY_FIELDS) {
    const message = validateField(field, draft[field]);
    if (message !== undefined) errors[field] = message;
  }
  return errors;
}

export interface OpportunityPayload {
  name: string;
  client: string;
  location: string;
  project_type: ProjectType;
  owner: string;
  estimated_budget: number | null;
  deadline: string | null;
  source: string | null;
  decision_date: string | null;
}

/** Body of `POST /api/opportunities`. Only call it with a draft that passed `validateOpportunity`. */
export function toOpportunityPayload(draft: OpportunityDraft): OpportunityPayload {
  const text = (field: OpportunityField) => draft[field].trim();
  const optional = (field: OpportunityField) => text(field) || null;
  const budget = text("estimated_budget");
  return {
    name: text("name"),
    client: text("client"),
    location: text("location"),
    project_type: text("project_type") as ProjectType,
    owner: text("owner"),
    estimated_budget: budget === "" ? null : Number(budget.replace(",", ".")),
    deadline: optional("deadline"),
    source: optional("source"),
    decision_date: optional("decision_date"),
  };
}

export interface Opportunity {
  code: string;
  name: string;
  /** Always 0 on creation. */
  phase: 0;
  status: "no-plan";
  client: string;
  location: string;
  projectType: ProjectType;
  owner: string;
  estimatedBudget: number | null;
  deadline: string | null;
  source: string | null;
  decisionDate: string | null;
}

interface OpportunityResponse {
  code: string;
  name: string;
  client: string;
  location: string;
  project_type: ProjectType;
  owner: string;
  estimated_budget: number | null;
  deadline: string | null;
  source: string | null;
  decision_date: string | null;
}

export async function createOpportunity(
  payload: OpportunityPayload,
  request: ApiRequest = defaultRequest,
): Promise<Opportunity> {
  const created = await request<OpportunityResponse>("/api/opportunities", { method: "POST", body: payload });
  return {
    code: created.code,
    name: created.name,
    phase: 0,
    status: "no-plan",
    client: created.client,
    location: created.location,
    projectType: created.project_type,
    owner: created.owner,
    estimatedBudget: created.estimated_budget,
    deadline: created.deadline,
    source: created.source,
    decisionDate: created.decision_date,
  };
}

/**
 * RGB-21 pauses: types, client-side validation and the API calls
 * (`GET /api/projects/{code}/pauses`, `POST .../pause`, `POST .../resume`; docs/plans/RGB-21/contract.md).
 * The API speaks snake_case with `client_wait`-style reasons; the front uses camelCase and the
 * `client-wait` vocabulary of `lib/timing.ts`.
 */
import { request as defaultRequest, type ApiRequest } from "@/lib/api";
import type { PlannedPhase, PauseReason } from "@/lib/timing";

export const PAUSE_REASONS: readonly PauseReason[] = ["client-wait", "authority-wait", "internal-decision", "other"];

/** A pause of a real project, open (`resumedOn` null) or closed. Dates are ISO yyyy-mm-dd (UTC). */
export interface ProjectPause {
  id: string;
  /** Phase of the project when the pause was opened (1 to 7). */
  phase: PlannedPhase;
  reason: PauseReason;
  startedOn: string;
  expectedResumption: string;
  resumedOn: string | null;
  overdue: boolean;
  daysOverdue: number;
}

export interface ProjectPauses {
  active: ProjectPause | null;
  /** Closed pauses, most recent first. */
  history: ProjectPause[];
}

/** The part of a pause the portfolio row carries (`pause` field of `GET /api/portfolio`). */
export interface PauseSummary {
  reason: PauseReason;
  expectedResumption: string;
  overdue: boolean;
  daysOverdue: number;
}

export interface ApiPauseSummary {
  reason: string;
  expected_resumption: string;
  overdue: boolean;
  days_overdue: number;
}

interface ApiPause extends ApiPauseSummary {
  id: string;
  phase: PlannedPhase;
  started_on: string;
  resumed_on: string | null;
}

/** An unknown reason from the API is shown as «Otra» rather than breaking the screen. */
export function reasonFromApi(value: string): PauseReason {
  const reason = value.replace(/_/g, "-");
  return (PAUSE_REASONS as readonly string[]).includes(reason) ? (reason as PauseReason) : "other";
}

const reasonToApi = (reason: PauseReason) => reason.replace(/-/g, "_");

export function pauseSummaryFromApi(pause: ApiPauseSummary): PauseSummary {
  return {
    reason: reasonFromApi(pause.reason),
    expectedResumption: pause.expected_resumption,
    overdue: pause.overdue,
    daysOverdue: pause.days_overdue,
  };
}

function toPause(pause: ApiPause): ProjectPause {
  return {
    id: pause.id,
    phase: pause.phase,
    startedOn: pause.started_on,
    resumedOn: pause.resumed_on,
    ...pauseSummaryFromApi(pause),
  };
}

const projectPath = (code: string) => `/api/projects/${encodeURIComponent(code)}`;

export async function fetchPauses(code: string, request: ApiRequest = defaultRequest): Promise<ProjectPauses> {
  const { active, history } = await request<{ active: ApiPause | null; history: ApiPause[] }>(
    `${projectPath(code)}/pauses`,
  );
  return { active: active && toPause(active), history: history.map(toPause) };
}

export async function pauseProject(
  code: string,
  reason: PauseReason,
  expectedResumption: string,
  request: ApiRequest = defaultRequest,
): Promise<ProjectPause> {
  const created = await request<ApiPause>(`${projectPath(code)}/pause`, {
    method: "POST",
    body: { reason: reasonToApi(reason), expected_resumption: expectedResumption },
  });
  return toPause(created);
}

export async function resumeProject(code: string, request: ApiRequest = defaultRequest): Promise<ProjectPause> {
  return toPause(await request<ApiPause>(`${projectPath(code)}/resume`, { method: "POST" }));
}

// ---- Validation (same messages as the API, so the text does not change with its origin) ----

export type PauseField = "reason" | "expectedResumption";
export const PAUSE_FIELDS: readonly PauseField[] = ["reason", "expectedResumption"];
export type PauseDraft = Record<PauseField, string>;
export type PauseErrors = Partial<Record<PauseField, string>>;

/** Maps the `field` of an API error onto the form field. */
export const PAUSE_FIELD_FROM_API: Readonly<Record<string, PauseField>> = {
  reason: "reason",
  expected_resumption: "expectedResumption",
};

export const PAUSE_FIELD_LABELS: Record<PauseField, string> = {
  reason: "Motivo",
  expectedResumption: "Fecha prevista de reanudación",
};

const ISO_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

function isIsoDate(text: string): boolean {
  const match = ISO_DATE_PATTERN.exec(text);
  if (!match) return false;
  const [, year, month, day] = match.map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

const required = (field: PauseField) => `El campo «${PAUSE_FIELD_LABELS[field]}» es obligatorio.`;
const invalid = (field: PauseField, why: string) => `El campo «${PAUSE_FIELD_LABELS[field]}» no es válido: ${why}.`;

/** `today` is an ISO date (UTC); the expected date may be today but not earlier. */
export function validatePause(draft: PauseDraft, today: string): PauseErrors {
  const errors: PauseErrors = {};
  const reason = draft.reason.trim();
  if (reason === "") errors.reason = required("reason");
  else if (!(PAUSE_REASONS as readonly string[]).includes(reason)) errors.reason = invalid("reason", "no es un motivo admitido");

  const date = draft.expectedResumption.trim();
  if (date === "") errors.expectedResumption = required("expectedResumption");
  else if (!ISO_DATE_PATTERN.test(date)) errors.expectedResumption = invalid("expectedResumption", "debe ser una fecha con formato aaaa-mm-dd");
  else if (!isIsoDate(date)) errors.expectedResumption = invalid("expectedResumption", "no es una fecha existente");
  else if (date < today) errors.expectedResumption = invalid("expectedResumption", "no puede ser anterior a hoy");
  return errors;
}

/** Today in UTC as yyyy-mm-dd (the API works in UTC). */
export function todayUtc(): string {
  return new Date().toISOString().slice(0, 10);
}

/** «Vencida hace N día(s)»: text, so the state does not depend on colour alone. */
export function overdueText(days: number): string {
  return `Vencida hace ${days} ${days === 1 ? "día" : "días"}`;
}

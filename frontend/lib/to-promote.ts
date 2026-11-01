/**
 * «Por promover» (RGB-12b) read from the API (RGB-12a): `fetchToPromote` calls `GET /api/to-promote`,
 * validates the shape and maps snake_case to the front model. The server's order is kept.
 */
import { ApiError, request as defaultRequest, type ApiRequest } from "@/lib/api";
import type { PhaseId } from "@/lib/phases";

/** Known states are `ready`, `in_progress` and `blocked`; any other value is kept and shown as unknown. */
export type ToPromoteState = string;

export interface ToPromoteProject {
  code: string;
  name: string;
  phase: PhaseId;
  phaseName: string;
  deliverable: string;
  state: ToPromoteState;
  reason: string | null;
  promoter: string;
  canPromote: boolean;
}

export interface ToPromote {
  readyCount: number;
  projects: ToPromoteProject[];
}

const STATE_LABEL: Record<string, string> = {
  ready: "Listo para promover",
  in_progress: "En curso",
  blocked: "Bloqueado",
};
const UNKNOWN_STATE_LABEL = "Estado desconocido";

export function toPromoteStateLabel(state: string): string {
  return Object.hasOwn(STATE_LABEL, state) ? STATE_LABEL[state] : UNKNOWN_STATE_LABEL;
}

const INVALID_RESPONSE = "La respuesta del servidor no es válida. Inténtalo de nuevo.";
const invalidResponse = () => new ApiError(502, "invalid_to_promote_response", INVALID_RESPONSE);

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

function toProject(value: unknown): ToPromoteProject {
  if (!isRecord(value)) throw invalidResponse();
  const { code, name, phase, phase_name, deliverable, state, reason, promoter, can_promote } = value;
  if (
    typeof code !== "string" ||
    typeof name !== "string" ||
    typeof phase !== "number" ||
    typeof phase_name !== "string" ||
    typeof deliverable !== "string" ||
    typeof state !== "string" ||
    !(reason === null || typeof reason === "string") ||
    typeof promoter !== "string" ||
    typeof can_promote !== "boolean"
  ) {
    throw invalidResponse();
  }
  return { code, name, phase: phase as PhaseId, phaseName: phase_name, deliverable, state, reason, promoter, canPromote: can_promote };
}

export async function fetchToPromote(request: ApiRequest = defaultRequest): Promise<ToPromote> {
  const body = await request<unknown>("/api/to-promote");
  if (!isRecord(body) || typeof body.ready_count !== "number" || !Array.isArray(body.projects)) throw invalidResponse();
  return { readyCount: body.ready_count, projects: body.projects.map(toProject) };
}

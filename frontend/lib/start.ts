/**
 * Start of a project (RGB-16): the proposed plan of weeks, the promotion 0 → 1 that confirms it,
 * the confirmed plan and the «do not pursue» decision. All calls go through the API.
 */
import { ApiError, request as defaultRequest, type ApiRequest } from "@/lib/api";
import { MAX_WEEKS, validateWeeks, type ProjectType, type Scale } from "@/lib/plan-settings";
import type { PhaseId } from "@/lib/phases";

// The limits and the message are the ones of the plan settings: one single source.
export { MAX_WEEKS, validateWeeks };

export interface ProposedPlan {
  projectType: ProjectType;
  scale: Scale;
  /** Weeks of phases 1..7, in order. */
  weeksByPhase: number[];
  total: number;
}

export interface ConfirmedPlan extends ProposedPlan {
  confirmedAt: string;
  confirmedBy: string;
}

export interface Transition {
  code: string;
  action: string;
  previousPhase: PhaseId;
  currentPhase: PhaseId;
  frozenVersion: number;
}

export interface StartResult extends Transition {
  plan: ProposedPlan;
}

interface ApiPlan {
  project_type: ProjectType;
  scale: Scale;
  /** Object keyed by phase number ("1".."7"), as the API serialises it. */
  weeks_by_phase: Record<string, number>;
  total: number;
}

interface ApiTransition {
  code: string;
  action: string;
  previous_phase: PhaseId;
  current_phase: PhaseId;
  frozen_version: number;
}

const PLAN_PHASES = [1, 2, 3, 4, 5, 6, 7];

/** Turns the API object into the ordered array of seven weeks; anything else is a broken response. */
function weeksFromObject(value: unknown): number[] {
  const source = typeof value === "object" && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
  const weeks = PLAN_PHASES.map((phase) => source?.[String(phase)]);
  if (!weeks.every((w): w is number => typeof w === "number" && Number.isInteger(w))) {
    throw new ApiError(200, "invalid_plan_response", "La respuesta del plan no es válida. Inténtalo de nuevo.");
  }
  return weeks;
}

const toPlan = (p: ApiPlan): ProposedPlan => ({
  projectType: p.project_type,
  scale: p.scale,
  weeksByPhase: weeksFromObject(p.weeks_by_phase),
  total: p.total,
});

const toTransition = (t: ApiTransition): Transition => ({
  code: t.code,
  action: t.action,
  previousPhase: t.previous_phase,
  currentPhase: t.current_phase,
  frozenVersion: t.frozen_version,
});

/** True for one week value the API accepts: an integer between 1 and MAX_WEEKS. */
export function isValidWeek(weeks: number): boolean {
  return Number.isInteger(weeks) && weeks >= 1 && weeks <= MAX_WEEKS;
}

export function totalWeeks(weeks: number[]): number {
  return weeks.reduce((sum, w) => sum + w, 0);
}

export async function fetchProposedPlan(
  projectType: ProjectType,
  scale: Scale,
  request: ApiRequest = defaultRequest,
): Promise<ProposedPlan> {
  const query = new URLSearchParams({ project_type: projectType, scale });
  return toPlan(await request<ApiPlan>(`/api/plan?${query.toString()}`));
}

export async function startProject(
  code: string,
  scale: Scale,
  weeks: number[],
  request: ApiRequest = defaultRequest,
): Promise<StartResult> {
  const result = await request<ApiTransition & { plan: ApiPlan }>(`/api/projects/${encodeURIComponent(code)}/start`, {
    method: "POST",
    body: { scale, weeks },
  });
  return { ...toTransition(result), plan: toPlan(result.plan) };
}

/** `null` while the project has no confirmed plan (404 `plan_not_found`); any other failure is thrown. */
export async function fetchProjectPlan(code: string, request: ApiRequest = defaultRequest): Promise<ConfirmedPlan | null> {
  try {
    const plan = await request<ApiPlan & { confirmed_at: string; confirmed_by: string }>(
      `/api/projects/${encodeURIComponent(code)}/plan`,
    );
    return { ...toPlan(plan), confirmedAt: plan.confirmed_at, confirmedBy: plan.confirmed_by };
  } catch (error) {
    if (error instanceof ApiError && error.status === 404 && error.code === "plan_not_found") return null;
    throw error;
  }
}

export async function doNotPursue(code: string, reason: string, request: ApiRequest = defaultRequest): Promise<Transition> {
  return toTransition(
    await request<ApiTransition>(`/api/projects/${encodeURIComponent(code)}/do-not-pursue`, {
      method: "POST",
      body: { reason },
    }),
  );
}

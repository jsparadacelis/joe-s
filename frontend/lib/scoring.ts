/**
 * RGB-14 «Scoring de 7 criterios»: types, the score formula and the API calls
 * (`/api/settings/scoring` and `/api/projects/{code}/scoring`; docs/plans/RGB-14/contract.md).
 * The live score of the form uses the same formula as the server, but what counts is what the API returns on save.
 */
import { request as defaultRequest, ApiError, type ApiRequest } from "@/lib/api";

export const CRITERIA = ["client_fit", "location", "typology", "budget", "timeline", "source", "probability"] as const;
export type Criterion = (typeof CRITERIA)[number];

export const CRITERION_LABELS: Record<Criterion, string> = {
  client_fit: "Encaje del cliente",
  location: "Localización",
  typology: "Tipología",
  budget: "Presupuesto",
  timeline: "Plazo",
  source: "Fuente",
  probability: "Probabilidad",
};

export type Ratings = Record<Criterion, number>;
export type Weights = Record<Criterion, number>;
export type Recommendation = "pursue" | "do_not_pursue";

export const RECOMMENDATION_LABELS: Record<Recommendation, string> = {
  pursue: "perseguir",
  do_not_pursue: "no perseguir",
};

export const MIN_RATING = 1;
export const MAX_RATING = 5;
export const MAX_WEIGHT = 10;
export const MIN_THRESHOLD = 1;
export const MAX_THRESHOLD = 100;

export interface ScoringSettings {
  weights: Weights;
  threshold: number;
}

/** One saved scoring (insert-only on the server: ratings, weights and threshold are those used at that moment). */
export interface ScoringRecord {
  projectCode: string;
  version: number;
  ratings: Ratings;
  weights: Weights;
  threshold: number;
  score: number;
  recommendation: Recommendation;
  scoredBy: string;
  /** ISO timestamp (UTC). */
  scoredAt: string;
}

export interface ScoringHistoryEntry {
  version: number;
  score: number;
  recommendation: Recommendation;
  scoredAt: string;
}

/** The latest scoring plus the history of versions, newest first. */
export interface Scoring extends ScoringRecord {
  history: ScoringHistoryEntry[];
}

/**
 * `100·Σ(weight·rating) / (5·Σweight)`, rounded to one decimal, half up, like the server.
 * Weights have at most 2 decimals, so the arithmetic is done on integer hundredths: no float
 * error can turn an exact tie (56,25) into the wrong side.
 */
export function computeScore(ratings: Ratings, weights: Weights): number {
  let weighted = 0;
  let total = 0;
  for (const criterion of CRITERIA) {
    const hundredths = Math.round(weights[criterion] * 100);
    weighted += hundredths * ratings[criterion];
    total += hundredths;
  }
  // tenths = 100·weighted·10 / (MAX_RATING·total), rounded half up; the division is exact for MAX_RATING = 5.
  const numerator = (1000 * weighted) / MAX_RATING;
  return Math.floor((2 * numerator + total) / (2 * total)) / 10;
}

/** «Perseguir» when the score reaches the threshold. It is a recommendation: the decision is the person's. */
export function recommend(score: number, threshold: number): Recommendation {
  return score >= threshold ? "pursue" : "do_not_pursue";
}

/** One decimal with the Spanish comma: 60 -> «60,0». */
export function formatScore(score: number): string {
  return score.toFixed(1).replace(".", ",");
}

/** «dd/mm/yyyy hh:mm» in UTC, so the text does not depend on the machine's time zone. */
export function formatScoredAt(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getUTCDate())}/${p(d.getUTCMonth() + 1)}/${d.getUTCFullYear()} ${p(d.getUTCHours())}:${p(d.getUTCMinutes())}`;
}

export const WEIGHT_MESSAGE = "Los 7 pesos son obligatorios y deben ser números mayores que 0 y de hasta 10, con un máximo de 2 decimales.";
export const THRESHOLD_MESSAGE = "El umbral debe ser un número entero entre 1 y 100.";

export interface ScoringSettingsErrors {
  weights?: string;
  /** First criterion with an invalid weight. */
  weightsField?: Criterion;
  threshold?: string;
}

const isValidWeight = (w: number) => Number.isFinite(w) && w > 0 && w <= MAX_WEIGHT && Math.abs(w * 100 - Math.round(w * 100)) < 1e-6;
const isValidThreshold = (t: number) => Number.isInteger(t) && t >= MIN_THRESHOLD && t <= MAX_THRESHOLD;

/** Same limits as the API (weights in (0, 10] with up to 2 decimals, integer threshold 1-100). */
export function validateScoringSettings(settings: ScoringSettings): ScoringSettingsErrors {
  const errors: ScoringSettingsErrors = {};
  const badWeight = CRITERIA.find((c) => !isValidWeight(settings.weights[c]));
  if (badWeight) {
    errors.weights = WEIGHT_MESSAGE;
    errors.weightsField = badWeight;
  }
  if (!isValidThreshold(settings.threshold)) errors.threshold = THRESHOLD_MESSAGE;
  return errors;
}

interface ApiRecord {
  project_code: string;
  version: number;
  ratings: Ratings;
  weights: Weights;
  threshold: number;
  score: number;
  recommendation: Recommendation;
  scored_by: string;
  scored_at: string;
}

interface ApiScoring extends ApiRecord {
  history: { version: number; score: number; recommendation: Recommendation; scored_at: string }[];
}

function toRecord(r: ApiRecord): ScoringRecord {
  return {
    projectCode: r.project_code,
    version: r.version,
    ratings: r.ratings,
    weights: r.weights,
    threshold: r.threshold,
    score: r.score,
    recommendation: r.recommendation,
    scoredBy: r.scored_by,
    scoredAt: r.scored_at,
  };
}

export async function fetchScoringSettings(request: ApiRequest = defaultRequest): Promise<ScoringSettings> {
  const { weights, threshold } = await request<ScoringSettings>("/api/settings/scoring");
  return { weights, threshold };
}

export async function saveScoringSettings(settings: ScoringSettings, request: ApiRequest = defaultRequest): Promise<void> {
  await request("/api/settings/scoring", { method: "PUT", body: { weights: settings.weights, threshold: settings.threshold } });
}

export async function saveScoring(code: string, ratings: Ratings, request: ApiRequest = defaultRequest): Promise<ScoringRecord> {
  const saved = await request<ApiRecord>(`/api/projects/${encodeURIComponent(code)}/scoring`, { method: "POST", body: { ratings } });
  return toRecord(saved);
}

/** The latest scoring with its history, or `null` when the opportunity has none yet. Other failures are thrown. */
export async function fetchScoring(code: string, request: ApiRequest = defaultRequest): Promise<Scoring | null> {
  try {
    const found = await request<ApiScoring>(`/api/projects/${encodeURIComponent(code)}/scoring`);
    return {
      ...toRecord(found),
      history: found.history.map((h) => ({
        version: h.version,
        score: h.score,
        recommendation: h.recommendation,
        scoredAt: h.scored_at,
      })),
    };
  } catch (error) {
    if (error instanceof ApiError && error.status === 404 && error.code === "scoring_not_found") return null;
    throw error;
  }
}

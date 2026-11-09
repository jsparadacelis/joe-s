/**
 * Buildable capacity client (RGB-30 on the server, RGB-51b here): `GET /api/projects/{code}/capacity`.
 * Maps the server's snake_case figures to the camelCase `Capacity` and validates the JSON strictly.
 */
import { ApiError, request as defaultRequest, type ApiRequest } from "@/lib/api";
import type { Capacity } from "@/lib/capacity";

export interface CapacityAnswer {
  capacity: Capacity | null;
  /** Ids of the technical data that stop the capacity from being calculated. */
  missing: string[];
}

const invalidResponse = () =>
  new ApiError(502, "invalid_capacity_response", "La respuesta del servidor no es válida. Inténtalo de nuevo.");

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const isNumber = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);

function requiredNumber(value: unknown): number {
  if (!isNumber(value)) throw invalidResponse();
  return value;
}

function optionalNumber(value: unknown): number | null {
  if (value === null) return null;
  return requiredNumber(value);
}

function mapCapacity(raw: unknown): Capacity {
  if (!isRecord(raw)) throw invalidResponse();
  const { limited_by: limitedBy, meets_min_plot: meetsMinPlot } = raw;
  if (limitedBy !== "buildability" && limitedBy !== "occupancy-floors") throw invalidResponse();
  if (meetsMinPlot !== null && typeof meetsMinPlot !== "boolean") throw invalidResponse();
  return {
    surface: requiredNumber(raw.surface),
    buildableArea: requiredNumber(raw.buildable_area),
    footprint: requiredNumber(raw.footprint),
    byFloors: requiredNumber(raw.by_floors),
    maximum: requiredNumber(raw.maximum),
    limitedBy,
    existing: optionalNumber(raw.existing),
    minPlot: optionalNumber(raw.min_plot),
    meetsMinPlot,
  };
}

export async function fetchCapacity(code: string, request: ApiRequest = defaultRequest): Promise<CapacityAnswer> {
  const raw = await request(`/api/projects/${encodeURIComponent(code)}/capacity`, { method: "GET" });
  if (!isRecord(raw) || !("capacity" in raw) || !Array.isArray(raw.missing)) throw invalidResponse();
  if (!raw.missing.every((id): id is string => typeof id === "string")) throw invalidResponse();
  return { capacity: raw.capacity === null ? null : mapCapacity(raw.capacity), missing: raw.missing };
}

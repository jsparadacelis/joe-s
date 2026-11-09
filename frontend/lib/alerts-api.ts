/**
 * Cross-data alerts client (RGB-31 on the server, RGB-51b here): `GET /api/projects/{code}/alerts`.
 * Alerts only inform. The JSON is validated strictly: anything off the contract is a 502 contract error.
 */
import { ApiError, request as defaultRequest, type ApiRequest } from "@/lib/api";

export type AlertSeverity = "warning" | "info";

export interface Alert {
  code: string;
  severity: AlertSeverity;
  message: string;
  suggestion: string;
  /** Ids of the technical data the alert is about. */
  fields: string[];
}

const invalidResponse = () =>
  new ApiError(502, "invalid_alerts_response", "La respuesta del servidor no es válida. Inténtalo de nuevo.");

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

function mapAlert(raw: unknown): Alert {
  if (!isRecord(raw)) throw invalidResponse();
  const { code, severity, message, suggestion, fields } = raw;
  if (typeof code !== "string" || typeof message !== "string" || typeof suggestion !== "string") throw invalidResponse();
  if (severity !== "warning" && severity !== "info") throw invalidResponse();
  if (!Array.isArray(fields) || !fields.every((f): f is string => typeof f === "string")) throw invalidResponse();
  return { code, severity, message, suggestion, fields };
}

export async function fetchAlerts(code: string, request: ApiRequest = defaultRequest): Promise<Alert[]> {
  const raw = await request(`/api/projects/${encodeURIComponent(code)}/alerts`, { method: "GET" });
  if (!isRecord(raw) || !Array.isArray(raw.alerts)) throw invalidResponse();
  return raw.alerts.map(mapAlert);
}

/**
 * Technical data API client (RGB-51): `/api/projects/{code}/technical-data` (RGB-28 and RGB-24).
 * The server decides permissions, phase and what a query replaces; the client only maps snake_case to the front model
 * and lets the `ApiError` through. The fictitious `PRY-EJ-00N` projects do not exist on the server: they use an
 * in-memory API that follows the same rules.
 */
import { ApiError, request as defaultRequest, type ApiRequest } from "@/lib/api";
import { isSampleProject } from "@/lib/projects";
import {
  DEFINITIONS,
  fetchSavedTechnicalData,
  fetchTechnicalData,
  markAllVerified,
  requery,
  type TechnicalData,
  type TechnicalDatum,
} from "@/lib/technical-data";

export type RefreshResult = TechnicalData & { unmapped: string[] };

export interface TechnicalDataApi {
  load(code: string): Promise<TechnicalData>;
  edit(code: string, fieldId: string, value: string): Promise<TechnicalDatum>;
  restore(code: string, fieldId: string): Promise<TechnicalDatum>;
  verify(code: string, fieldId: string): Promise<TechnicalDatum>;
  verifyAll(code: string): Promise<TechnicalData>;
  refresh(code: string, cadastralReference: string): Promise<RefreshResult>;
}

const INVALID_RESPONSE = "La respuesta del servidor no es válida. Inténtalo de nuevo.";

function invalidResponse(): ApiError {
  return new ApiError(502, "invalid_technical_data_response", INVALID_RESPONSE);
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

function mapDatum(raw: unknown): TechnicalDatum {
  if (!isRecord(raw) || typeof raw.id !== "string") throw invalidResponse();
  return {
    id: raw.id,
    value: typeof raw.value === "string" ? raw.value : "",
    original: typeof raw.original === "string" ? raw.original : null,
    verified: raw.verified === true,
    edited: raw.edited === true,
    source: typeof raw.source === "string" ? raw.source : "manual",
  };
}

function mapSheet(raw: unknown): TechnicalData {
  if (!isRecord(raw) || !Array.isArray(raw.data)) throw invalidResponse();
  return {
    cadastralReference: typeof raw.cadastral_reference === "string" ? raw.cadastral_reference : "",
    queriedOn: typeof raw.queried_on === "string" ? raw.queried_on : null,
    data: raw.data.map(mapDatum),
  };
}

const basePath = (code: string) => `/api/projects/${encodeURIComponent(code)}/technical-data`;
const datumPath = (code: string, fieldId: string) => `${basePath(code)}/${encodeURIComponent(fieldId)}`;

export async function fetchProjectTechnicalData(code: string, request: ApiRequest = defaultRequest): Promise<TechnicalData> {
  return mapSheet(await request(basePath(code), { method: "GET" }));
}

export async function editDatum(
  code: string,
  fieldId: string,
  value: string,
  request: ApiRequest = defaultRequest,
): Promise<TechnicalDatum> {
  return mapDatum(await request(datumPath(code, fieldId), { method: "PUT", body: { value } }));
}

export async function restoreDatum(code: string, fieldId: string, request: ApiRequest = defaultRequest): Promise<TechnicalDatum> {
  return mapDatum(await request(`${datumPath(code, fieldId)}/restore`, { method: "POST" }));
}

export async function verifyDatum(code: string, fieldId: string, request: ApiRequest = defaultRequest): Promise<TechnicalDatum> {
  return mapDatum(await request(`${datumPath(code, fieldId)}/verify`, { method: "POST" }));
}

export async function verifyAll(code: string, request: ApiRequest = defaultRequest): Promise<TechnicalData> {
  return mapSheet(await request(`${basePath(code)}/verify-all`, { method: "POST" }));
}

export async function refreshFromCadastre(
  code: string,
  cadastralReference: string,
  request: ApiRequest = defaultRequest,
): Promise<RefreshResult> {
  const raw = await request(`${basePath(code)}/refresh`, { method: "POST", body: { cadastral_reference: cadastralReference } });
  const unmapped = isRecord(raw) && Array.isArray(raw.unmapped) ? raw.unmapped.filter((id): id is string => typeof id === "string") : [];
  return { ...mapSheet(raw), unmapped };
}

export function createTechnicalDataApi(request: ApiRequest = defaultRequest): TechnicalDataApi {
  return {
    load: (code) => fetchProjectTechnicalData(code, request),
    edit: (code, fieldId, value) => editDatum(code, fieldId, value, request),
    restore: (code, fieldId) => restoreDatum(code, fieldId, request),
    verify: (code, fieldId) => verifyDatum(code, fieldId, request),
    verifyAll: (code) => verifyAll(code, request),
    refresh: (code, cadastralReference) => refreshFromCadastre(code, cadastralReference, request),
  };
}

// ---- Sample projects (fictitious data, in memory) ----

function emptySheet(): TechnicalData {
  return {
    cadastralReference: "",
    queriedOn: null,
    data: DEFINITIONS.map((d) => ({ id: d.id, value: "", original: d.group === "planning" ? null : "", verified: false, edited: false })),
  };
}

const withEdited = (d: TechnicalDatum): TechnicalDatum => ({
  ...d,
  edited: d.original !== null && d.value !== d.original,
});

const copyOf = (sheet: TechnicalData): TechnicalData => ({ ...sheet, data: sheet.data.map((d) => ({ ...d })) });

/** Same rules as the server: an edit keeps the original and clears `verified`; a refresh keeps the manual data. */
export function createSampleTechnicalDataApi(): TechnicalDataApi {
  const sheets = new Map<string, TechnicalData>();

  async function sheetOf(code: string): Promise<TechnicalData> {
    let sheet = sheets.get(code);
    if (!sheet) {
      const saved = await fetchSavedTechnicalData(code);
      sheet = saved ? { ...saved, data: saved.data.map(withEdited) } : emptySheet();
      sheets.set(code, sheet);
    }
    return sheet;
  }

  async function change(code: string, fieldId: string, fn: (d: TechnicalDatum) => TechnicalDatum): Promise<TechnicalDatum> {
    const sheet = await sheetOf(code);
    if (!sheet.data.some((d) => d.id === fieldId)) throw new ApiError(404, "unknown_technical_datum", "No existe ese dato técnico.");
    const data = sheet.data.map((d) => (d.id === fieldId ? withEdited(fn(d)) : d));
    sheets.set(code, { ...sheet, data });
    return { ...data.find((d) => d.id === fieldId)! };
  }

  return {
    load: async (code) => copyOf(await sheetOf(code)),
    edit: (code, fieldId, value) => change(code, fieldId, (d) => ({ ...d, value, verified: false })),
    restore: (code, fieldId) =>
      change(code, fieldId, (d) => (d.original === null ? d : { ...d, value: d.original, verified: false })),
    verify: (code, fieldId) => change(code, fieldId, (d) => ({ ...d, verified: true })),
    verifyAll: async (code) => {
      const sheet = await sheetOf(code);
      const next = { ...sheet, data: markAllVerified(sheet.data) };
      sheets.set(code, next);
      return copyOf(next);
    },
    refresh: async (code, cadastralReference) => {
      const sheet = await sheetOf(code);
      const incoming = await fetchTechnicalData(cadastralReference);
      const next: TechnicalData = {
        cadastralReference: incoming.cadastralReference,
        queriedOn: incoming.queriedOn,
        data: requery(sheet.data, incoming.data).map(withEdited),
      };
      sheets.set(code, next);
      return { ...copyOf(next), unmapped: [] };
    },
  };
}

/** The sample API for a `PRY-EJ-00N` project, the real one otherwise. */
export function technicalDataApiFor(code: string): TechnicalDataApi {
  return isSampleProject(code) ? createSampleTechnicalDataApi() : createTechnicalDataApi();
}

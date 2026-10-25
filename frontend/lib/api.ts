const UNEXPECTED_MESSAGE = "Ocurrió un error inesperado. Inténtalo de nuevo.";
const NETWORK_MESSAGE = "No se pudo conectar con el servidor. Comprueba tu conexión e inténtalo de nuevo.";
const DEFAULT_BASE_URL = "http://localhost:8000";

export class ApiError extends Error {
  /** HTTP status; 0 means the request never got a response (network failure or CORS). */
  readonly status: number;
  readonly code: string;
  /** Offending field of a validation error (`detail.field`); `undefined` when the API did not name one. */
  readonly field?: string;
  /** Spanish labels of what is missing (`detail.missing`, 422 `incomplete_deliverable`); `undefined` when absent. */
  readonly missing?: string[];

  constructor(status: number, code: string, message: string, field?: string, missing?: string[]) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.field = field;
    this.missing = missing;
  }
}

export type ApiRequestInit = { method?: string; body?: unknown };
export type ApiRequest = <T = unknown>(path: string, init?: ApiRequestInit) => Promise<T>;

/** The only parts of a fetch Response the client relies on. */
export interface ResponseLike {
  ok: boolean;
  status: number;
  text(): Promise<string>;
}

export interface ApiClientOptions {
  baseUrl?: string;
  fetch?: (input: string, init?: RequestInit) => Promise<ResponseLike>;
}

function parseJson(text: string): unknown {
  if (text === "") return undefined;
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

/** Builds an ApiError from a non-2xx response; only `{ detail: { code, message } }` bodies are trusted. */
function errorFromBody(status: number, text: string): ApiError {
  const body = parseJson(text);
  const detail = typeof body === "object" && body !== null ? (body as { detail?: unknown }).detail : undefined;
  if (typeof detail === "object" && detail !== null && !Array.isArray(detail)) {
    const { code, message, field, missing } = detail as { code?: unknown; message?: unknown; field?: unknown; missing?: unknown };
    if (typeof code === "string" && typeof message === "string") {
      const labels = Array.isArray(missing) && missing.every((m) => typeof m === "string") ? (missing as string[]) : undefined;
      return new ApiError(status, code, message, typeof field === "string" ? field : undefined, labels);
    }
  }
  return new ApiError(status, "unexpected_error", UNEXPECTED_MESSAGE);
}

export function createApiClient(options: ApiClientOptions = {}): { request: ApiRequest } {
  const baseUrl = (options.baseUrl ?? process.env.NEXT_PUBLIC_API_URL ?? DEFAULT_BASE_URL).replace(/\/+$/, "");

  const request: ApiRequest = async <T = unknown>(path: string, init: ApiRequestInit = {}): Promise<T> => {
    const doFetch = options.fetch ?? ((input: string, requestInit?: RequestInit) => globalThis.fetch(input, requestInit));
    const requestInit: RequestInit = { method: init.method ?? "GET" };
    if (init.body !== undefined) {
      requestInit.body = JSON.stringify(init.body);
      requestInit.headers = { "Content-Type": "application/json" };
    }

    let response: ResponseLike;
    try {
      response = await doFetch(`${baseUrl}${path}`, requestInit);
    } catch {
      throw new ApiError(0, "network_error", NETWORK_MESSAGE);
    }

    if (!response.ok) throw errorFromBody(response.status, await response.text());
    if (response.status === 204) return undefined as T;
    return parseJson(await response.text()) as T;
  };

  return { request };
}

export const { request } = createApiClient();

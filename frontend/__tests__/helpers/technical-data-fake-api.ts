/**
 * RGB-51 · stateful in-memory stand-in for the technical data API (`TechnicalDataApi` from
 * `@/lib/technical-data-api`). It follows the server rules the editor relies on: an edit keeps the original and
 * clears `verified`; restore goes back to the original (and clears `verified`); a refresh keeps the manual
 * (planning) data. Every method is a jest mock, so tests can assert calls and override a single method.
 */
import { DEFINITIONS, requery, type TechnicalData, type TechnicalDatum } from "@/lib/technical-data";
import type { TechnicalDataApi } from "@/lib/technical-data-api";

type Mocked = { [K in keyof TechnicalDataApi]: jest.Mock<ReturnType<TechnicalDataApi[K]>, Parameters<TechnicalDataApi[K]>> };

export function emptyCatalog(): TechnicalDatum[] {
  return DEFINITIONS.map((d) => ({ id: d.id, value: "", original: null, verified: false, edited: false }));
}

const withEdited = (d: TechnicalDatum): TechnicalDatum => ({
  ...d,
  edited: d.original !== null && d.value !== d.original,
});

export function fakeTechnicalDataApi(
  options: { initial?: TechnicalData | null; query?: (cadastralReference: string) => Promise<TechnicalData> } = {},
): Mocked {
  let current: TechnicalData | null = options.initial ? { ...options.initial, data: options.initial.data.map((d) => ({ ...d })) } : null;
  const sheet = (): TechnicalData => current ?? { cadastralReference: "", queriedOn: null, data: emptyCatalog() };
  const change = (id: string, fn: (d: TechnicalDatum) => TechnicalDatum): TechnicalDatum => {
    const base = sheet();
    const data = base.data.map((d) => (d.id === id ? withEdited(fn(d)) : d));
    current = { ...base, data };
    return data.find((d) => d.id === id)!;
  };

  return {
    load: jest.fn(async () => structuredClone(sheet())),
    edit: jest.fn(async (_code: string, id: string, value: string) => change(id, (d) => ({ ...d, value, verified: false }))),
    restore: jest.fn(async (_code: string, id: string) =>
      change(id, (d) => (d.original === null ? d : { ...d, value: d.original, verified: false })),
    ),
    verify: jest.fn(async (_code: string, id: string) => change(id, (d) => ({ ...d, verified: true }))),
    verifyAll: jest.fn(async () => {
      const base = sheet();
      current = { ...base, data: base.data.map((d) => ({ ...d, verified: true })) };
      return structuredClone(current);
    }),
    refresh: jest.fn(async (_code: string, cadastralReference: string) => {
      if (!options.query) throw new Error("fake api: no `query` given");
      const incoming = await options.query(cadastralReference);
      const data = (current ? requery(current.data, incoming.data) : incoming.data).map(withEdited);
      current = { cadastralReference: incoming.cadastralReference, queriedOn: incoming.queriedOn, data };
      return { ...structuredClone(current), unmapped: [] };
    }),
  } as unknown as Mocked;
}

/** `Response`-like reply for a stubbed `globalThis.fetch`. */
export const reply = (status: number, body: unknown) => ({ ok: status < 300, status, text: async () => JSON.stringify(body) });

/** API JSON (snake_case) of the whole catalog, with overrides by field id. */
export function apiSheetJson(
  overrides: Record<string, Partial<{ value: string; original: string | null; verified: boolean; edited: boolean }>> = {},
  extra: { cadastral_reference?: string | null; queried_on?: string | null } = {},
) {
  return {
    cadastral_reference: extra.cadastral_reference === undefined ? "1234567DG3413S0001AB" : extra.cadastral_reference,
    queried_on: extra.queried_on === undefined ? "2026-10-18" : extra.queried_on,
    data: DEFINITIONS.map((d) => ({
      id: d.id,
      value: "",
      original: d.group === "planning" ? null : "",
      verified: false,
      edited: false,
      source: d.group === "planning" ? "manual" : "catastro",
      ...overrides[d.id],
    })),
  };
}

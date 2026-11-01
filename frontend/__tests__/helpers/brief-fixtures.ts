/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * RGB-32b · API JSON (snake_case) of a brief, as `GET /api/projects/{code}/brief` returns it.
 * Fictitious data only. Each constant is a fresh-looking, independent object (use `brief({...})` to derive more).
 */
type Json = Record<string, unknown>;

export const TECHNICAL_DATA = {
  cadastral_reference: "0000000AA0000A0000AA",
  queried_at: "2026-11-01T09:00:00Z",
  unverified: ["year"],
  data: [
    { id: "address", value: "Calle Ejemplo 1", source: "catastro", original: "Calle Ejemplo 1", edited: false, verified: true },
    { id: "use", value: "Comercial", source: "catastro", original: "Residencial", edited: true, verified: true },
    { id: "year", value: "1990", source: "manual", original: null, edited: false, verified: false },
    { id: "altitude", value: "", source: "manual", original: null, edited: false, verified: false },
  ],
};

const FIELDS_FILLED = {
  needs: "Vivienda unifamiliar para una familia de cuatro personas",
  program: "4 dormitorios, estudio y garaje",
  constraints: "Retranqueo de 3 m a lindero",
  target_budget: 250000,
  deadline: "2027-06-30",
  topographic_survey: null,
  alignment: null,
  client_approval: "email",
};

const COMPLETE = { missing: [], technical_data_obtained: true, technical_data_queried: true, client_approval_recorded: true, complete: true };

/** Builds a brief; `fields`, `completeness`, `permissions` and `technical_data` are merged over the complete editable one. */
export function brief(overrides: { fields?: Json; completeness?: Json; permissions?: Json; technical_data?: Json } & Json = {}): any {
  const { fields, completeness, permissions, technical_data, ...rest } = overrides;
  return {
    code: "PRY-2026-001",
    phase: 2,
    frozen_version: null,
    ...rest,
    fields: { ...FIELDS_FILLED, ...fields },
    completeness: { ...COMPLETE, ...completeness },
    technical_data: { ...TECHNICAL_DATA, ...technical_data },
    permissions: { can_edit: true, can_promote: true, ...permissions },
  };
}

/** Phase 2, the project director, ready to promote. */
export const API_BRIEF_COMPLETE = brief();

/** Phase 2, the project director, three required fields and the approval missing. */
export const API_BRIEF_INCOMPLETE = brief({
  fields: { program: null, constraints: null, target_budget: null, client_approval: "pending" },
  completeness: {
    missing: ["Programa", "Condicionantes", "Presupuesto objetivo"],
    client_approval_recorded: false,
    complete: false,
  },
  permissions: { can_promote: false },
});

/** Phase 2, nobody but the director edits: a person without authority sees the complete brief read-only. */
export const API_BRIEF_READ_ONLY = brief({ permissions: { can_edit: false, can_promote: false } });

/** Complete brief but no technical data at all and no approval. */
export const API_BRIEF_NO_TECHNICAL_DATA = brief({
  completeness: {
    missing: [],
    technical_data_obtained: false,
    technical_data_queried: false,
    client_approval_recorded: false,
    complete: false,
  },
  fields: { client_approval: "pending" },
  permissions: { can_promote: false },
  technical_data: { cadastral_reference: null, queried_at: null, unverified: [], data: [] },
});

/** Phase 3: the frozen version 1, read-only. */
export const API_BRIEF_FROZEN = brief({
  phase: 3,
  frozen_version: 1,
  permissions: { can_edit: false, can_promote: false },
});

export const API_PROMOTE_RESULT = {
  code: "PRY-2026-001",
  action: "promote",
  previous_phase: 2,
  current_phase: 3,
  frozen_version: 1,
  brief: API_BRIEF_FROZEN,
};

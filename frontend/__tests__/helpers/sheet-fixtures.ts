/** Confirmed plan as the API serialises it: weeks_by_phase keyed "1".."7". Total 65. */
export const API_PLAN_VALUE = { weeks_by_phase: { "1": 5, "2": 8, "3": 10, "4": 12, "5": 15, "6": 10, "7": 5 }, total: 65 };

/**
 * Fictitious project sheet in the literal wire shape of `GET /api/projects/{code}/sheet` (RGB-17a plan). */
export const API_SHEET = {
  code: "PRY-2026-001",
  phase: 1,
  completion: { filled: 7, required: 20, percent: 35 },
  blocks: [
    {
      block: "identification",
      filled: 6, required: 7, complete: false,
      fields: [
        { field: "code", required: true, value: "PRY-2026-001", source: "auto" },
        { field: "name", required: true, value: "Casa de prueba", source: "auto" },
        { field: "client", required: true, value: "Cliente de prueba", source: "scoring" },
        { field: "location", required: true, value: "Calle Ficticia 1, Ciudad de prueba", source: "scoring" },
        { field: "cadastral_reference", required: true, value: null, source: "manual" },
        { field: "project_type", required: true, value: "single_family_house", source: "scoring" },
        { field: "scale", required: true, value: "medium", source: "scoring" },
      ],
    },
    {
      block: "engagement",
      filled: 0, required: 3, complete: false,
      fields: [
        { field: "scope_included", required: true, value: null, source: "manual" },
        { field: "scope_excluded", required: true, value: null, source: "manual" },
        { field: "contract_signed_on", required: true, value: null, source: "manual" },
      ],
    },
    {
      block: "governance",
      filled: 0, required: 3, complete: false,
      fields: [
        { field: "sponsor", required: true, value: null, source: "manual" },
        { field: "project_director", required: true, value: null, source: "manual" },
        { field: "technical_lead", required: true, value: null, source: "manual" },
        { field: "team", required: false, value: null, source: "manual" },
        { field: "external_collaborators", required: false, value: null, source: "manual" },
      ],
    },
    {
      block: "client_contact",
      filled: 0, required: 1, complete: false,
      fields: [{ field: "contact", required: true, value: null, source: "manual" }],
    },
    {
      block: "timing",
      filled: 1, required: 3, complete: false,
      fields: [
        { field: "confirmed_plan", required: true, value: API_PLAN_VALUE, source: "scoring" },
        { field: "next_milestone", required: true, value: null, source: "manual" },
        { field: "next_milestone_on", required: true, value: null, source: "manual" },
      ],
    },
    {
      block: "risk",
      filled: 0, required: 2, complete: false,
      fields: [
        { field: "main_risk", required: true, value: null, source: "manual" },
        { field: "risk_owner", required: true, value: null, source: "manual" },
      ],
    },
    {
      block: "information",
      filled: 0, required: 1, complete: false,
      fields: [{ field: "repository_path", required: true, value: null, source: "manual" }],
    },
    {
      block: "status",
      filled: 0, required: 0, complete: true,
      fields: [{ field: "traffic_light", required: false, value: "green", source: "auto" }],
    },
  ],
};

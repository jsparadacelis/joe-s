import type { ApiRequest } from "@/lib/api";

/** RGB-2b · who is signed in, as the API sees it (`GET /api/me`). */

export type Me = { role: string; qualifications: string[] };

const ROLE_LABELS: Record<string, string> = {
  partner: "Socio",
  director: "Director",
  project_director: "Director de proyecto",
  technical_lead: "Líder técnico",
  architect: "Arquitecto",
  site_collaborator: "Colaborador de obra",
  administration: "Administración",
};

const QUALIFICATION_LABELS: Record<string, string> = {
  licensed_signatory: "Firmante habilitado",
  site_management: "Dirección facultativa",
  sponsor: "Sponsor",
};

export function roleLabel(role: string | null | undefined): string {
  return role != null && Object.hasOwn(ROLE_LABELS, role) ? ROLE_LABELS[role] : "Sin rol";
}

export function qualificationLabel(code: string): string {
  return Object.hasOwn(QUALIFICATION_LABELS, code) ? QUALIFICATION_LABELS[code] : "Otra cualificación";
}

export function fetchMe(client: { request: ApiRequest }): Promise<Me> {
  return client.request<Me>("/api/me");
}

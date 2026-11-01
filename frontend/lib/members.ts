import { request as defaultRequest, type ApiRequest } from "@/lib/api";

/** RGB-48 · study team: list, invite and revoke (`/api/members`, RGB-2a). */

export type MemberStatus = "invited" | "active" | "revoked";

export type Member = {
  id: string;
  email: string;
  role: string;
  qualifications: string[];
  status: MemberStatus;
};

export type MemberInvitation = { email: string; role: string; qualifications: string[] };

export const MEMBER_ROLES: string[] = [
  "partner",
  "director",
  "project_director",
  "technical_lead",
  "architect",
  "site_collaborator",
  "administration",
];

export const MEMBER_QUALIFICATIONS: string[] = ["licensed_signatory", "site_management", "sponsor"];

const STATUS_LABELS: Record<MemberStatus, string> = {
  invited: "Invitada",
  active: "Activa",
  revoked: "Acceso retirado",
};

export function statusLabel(status: MemberStatus): string {
  return Object.hasOwn(STATUS_LABELS, status) ? STATUS_LABELS[status] : "Estado desconocido";
}

/** Same shape rule as the API: one «@», something before it and a domain with a dot. The API has the last word. */
export function isValidEmail(email: string): boolean {
  const parts = email.trim().split("@");
  if (parts.length !== 2) return false;
  const [local, domain] = parts;
  return /^\S+$/.test(local) && /^[^\s.]+(\.[^\s.]+)+$/.test(domain);
}

export async function fetchMembers(request: ApiRequest = defaultRequest): Promise<Member[]> {
  const { members } = await request<{ members: Member[] }>("/api/members", { method: "GET" });
  return members;
}

export function inviteMember(invitation: MemberInvitation, request: ApiRequest = defaultRequest): Promise<Member> {
  return request<Member>("/api/members/invitations", { method: "POST", body: invitation });
}

export function revokeMember(id: string, request: ApiRequest = defaultRequest): Promise<Member> {
  return request<Member>(`/api/members/${encodeURIComponent(id)}/revoke`, { method: "POST" });
}

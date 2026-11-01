import { request as defaultRequest, type ApiRequest } from "@/lib/api";
import { qualificationLabel, roleLabel } from "@/lib/me";
import type { Member } from "@/lib/members";

/** RGB-49 · project team: list, assign and remove project functions (`/api/projects/{code}/members`, RGB-4). */

export type ProjectAssignment = { id: string; member_id: string; role: string };

export type TeamRow = { id: string; memberId: string; email: string; role: string; roleLabel: string };

export const PROJECT_ROLES: string[] = [
  "project_director",
  "technical_lead",
  "architect",
  "site_collaborator",
  "licensed_signatory",
  "site_management",
  "sponsor",
];

/** Functions of signature: the API demands the matching qualification of the person. */
export const SIGNING_ROLES: string[] = ["licensed_signatory", "site_management", "sponsor"];

export const UNKNOWN_PERSON = "Persona desconocida";

export function projectRoleLabel(role: string): string {
  if (SIGNING_ROLES.includes(role)) return qualificationLabel(role);
  return PROJECT_ROLES.includes(role) ? roleLabel(role) : "Otra función";
}

export function requiredQualificationLabel(role: string): string | null {
  return SIGNING_ROLES.includes(role) ? qualificationLabel(role) : null;
}

const membersPath = (code: string) => `/api/projects/${encodeURIComponent(code)}/members`;

export async function fetchProjectTeam(code: string, request: ApiRequest = defaultRequest): Promise<ProjectAssignment[]> {
  const { members } = await request<{ members: ProjectAssignment[] }>(membersPath(code), { method: "GET" });
  return members;
}

export function assignProjectRole(
  code: string,
  memberId: string,
  role: string,
  request: ApiRequest = defaultRequest,
): Promise<ProjectAssignment> {
  return request<ProjectAssignment>(membersPath(code), { method: "POST", body: { member_id: memberId, role } });
}

export function unassignProjectRole(code: string, assignmentId: string, request: ApiRequest = defaultRequest): Promise<ProjectAssignment> {
  return request<ProjectAssignment>(`${membersPath(code)}/${encodeURIComponent(assignmentId)}`, { method: "DELETE" });
}

export function buildTeamRows(assignments: ProjectAssignment[], members: Member[]): TeamRow[] {
  const emails = new Map(members.map((m) => [m.id, m.email]));
  return assignments.map((a) => ({
    id: a.id,
    memberId: a.member_id,
    email: emails.get(a.member_id) ?? UNKNOWN_PERSON,
    role: a.role,
    roleLabel: projectRoleLabel(a.role),
  }));
}

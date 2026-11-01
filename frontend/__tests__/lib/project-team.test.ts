/**
 * RGB-49 · contract for `@/lib/project-team` (every request function takes the api `request` as LAST argument,
 * defaulting to `@/lib/api`'s, exactly like lib/members.ts):
 *   type ProjectAssignment = { id: string; member_id: string; role: string }
 *   type TeamRow = { id: string; memberId: string; email: string; role: string; roleLabel: string }
 *   PROJECT_ROLES: string[]  (project_director, technical_lead, architect, site_collaborator, licensed_signatory, site_management, sponsor)
 *   SIGNING_ROLES: string[]  (licensed_signatory, site_management, sponsor)
 *   projectRoleLabel(role): string          UNKNOWN_PERSON = "Persona desconocida"
 *   requiredQualificationLabel(role): string | null   (signing role -> label of the qualification it demands)
 *   fetchProjectTeam(code, request?): Promise<ProjectAssignment[]>   GET  /api/projects/{code}/members
 *   assignProjectRole(code, memberId, role, request?): Promise<ProjectAssignment>   POST body {member_id, role}
 *   unassignProjectRole(code, assignmentId, request?): Promise<ProjectAssignment>   DELETE .../members/{id}
 *   buildTeamRows(assignments, members): TeamRow[]   (members: Member[] from @/lib/members, RGB-48; order of assignments kept)
 */
import {
  PROJECT_ROLES,
  SIGNING_ROLES,
  UNKNOWN_PERSON,
  assignProjectRole,
  buildTeamRows,
  fetchProjectTeam,
  projectRoleLabel,
  requiredQualificationLabel,
  unassignProjectRole,
} from "@/lib/project-team";
import type { Member } from "@/lib/members";

const ASSIGNMENT = { id: "a-1", member_id: "m-1", role: "architect" };

describe("fetchProjectTeam", () => {
  it("GETs the project members and unwraps the list", async () => {
    const request = jest.fn().mockResolvedValue({ members: [ASSIGNMENT] });
    await expect(fetchProjectTeam("PRY-2026-001", request)).resolves.toEqual([ASSIGNMENT]);
    expect(request).toHaveBeenCalledWith("/api/projects/PRY-2026-001/members", expect.objectContaining({ method: "GET" }));
  });

  it("encodes the project code in the path", async () => {
    const request = jest.fn().mockResolvedValue({ members: [] });
    await fetchProjectTeam("PRY 1/../x?", request);
    expect(request.mock.calls[0][0]).toBe(`/api/projects/${encodeURIComponent("PRY 1/../x?")}/members`);
  });

  it("propagates the API error", async () => {
    const boom = new Error("boom");
    await expect(fetchProjectTeam("PRY-1", jest.fn().mockRejectedValue(boom))).rejects.toBe(boom);
  });
});

describe("assignProjectRole", () => {
  it("POSTs member_id and role and returns the new assignment", async () => {
    const request = jest.fn().mockResolvedValue(ASSIGNMENT);
    await expect(assignProjectRole("PRY-2026-001", "m-1", "architect", request)).resolves.toEqual(ASSIGNMENT);
    expect(request).toHaveBeenCalledWith("/api/projects/PRY-2026-001/members", {
      method: "POST",
      body: { member_id: "m-1", role: "architect" },
    });
  });

  it("encodes the project code", async () => {
    const request = jest.fn().mockResolvedValue(ASSIGNMENT);
    await assignProjectRole("a/b", "m-1", "architect", request);
    expect(request.mock.calls[0][0]).toBe(`/api/projects/${encodeURIComponent("a/b")}/members`);
  });

  it("propagates the API error", async () => {
    const boom = new Error("boom");
    await expect(assignProjectRole("P", "m", "architect", jest.fn().mockRejectedValue(boom))).rejects.toBe(boom);
  });
});

describe("unassignProjectRole", () => {
  it("DELETEs the assignment and returns it", async () => {
    const request = jest.fn().mockResolvedValue(ASSIGNMENT);
    await expect(unassignProjectRole("PRY-2026-001", "a-1", request)).resolves.toEqual(ASSIGNMENT);
    expect(request).toHaveBeenCalledWith("/api/projects/PRY-2026-001/members/a-1", { method: "DELETE" });
  });

  it("encodes both the project code and the assignment id", async () => {
    const request = jest.fn().mockResolvedValue(ASSIGNMENT);
    await unassignProjectRole("a/b", "x/../y", request);
    expect(request.mock.calls[0][0]).toBe(`/api/projects/${encodeURIComponent("a/b")}/members/${encodeURIComponent("x/../y")}`);
  });

  it("propagates the API error", async () => {
    const boom = new Error("boom");
    await expect(unassignProjectRole("P", "a", jest.fn().mockRejectedValue(boom))).rejects.toBe(boom);
  });
});

describe("function labels", () => {
  it("lists the seven project functions, three of them of signature", () => {
    expect(PROJECT_ROLES).toEqual([
      "project_director",
      "technical_lead",
      "architect",
      "site_collaborator",
      "licensed_signatory",
      "site_management",
      "sponsor",
    ]);
    expect(SIGNING_ROLES).toEqual(["licensed_signatory", "site_management", "sponsor"]);
  });

  it.each([
    ["project_director", "Director de proyecto"],
    ["technical_lead", "Líder técnico"],
    ["architect", "Arquitecto"],
    ["site_collaborator", "Colaborador de obra"],
    ["licensed_signatory", "Firmante habilitado"],
    ["site_management", "Dirección facultativa"],
    ["sponsor", "Sponsor"],
  ])("labels %s as «%s»", (role, label) => {
    expect(projectRoleLabel(role)).toBe(label);
  });

  it("never leaks an unknown code, and survives prototype keys", () => {
    for (const role of ["wizard", "constructor", "__proto__", ""]) {
      expect(projectRoleLabel(role)).toBe("Otra función");
    }
  });

  it("names the qualification each signing function demands, and none for the others", () => {
    expect(requiredQualificationLabel("licensed_signatory")).toBe("Firmante habilitado");
    expect(requiredQualificationLabel("site_management")).toBe("Dirección facultativa");
    expect(requiredQualificationLabel("sponsor")).toBe("Sponsor");
    expect(requiredQualificationLabel("architect")).toBeNull();
    expect(requiredQualificationLabel("constructor")).toBeNull();
  });
});

describe("buildTeamRows", () => {
  const MEMBERS: Member[] = [
    { id: "m-1", email: "ana@example.com", role: "architect", qualifications: [], status: "active" },
    { id: "m-2", email: "luis@example.com", role: "director", qualifications: ["sponsor"], status: "revoked" },
  ];

  it("crosses each assignment with its person by member_id, keeping the order", () => {
    const rows = buildTeamRows(
      [
        { id: "a-2", member_id: "m-2", role: "sponsor" },
        { id: "a-1", member_id: "m-1", role: "architect" },
      ],
      MEMBERS,
    );
    expect(rows).toEqual([
      { id: "a-2", memberId: "m-2", email: "luis@example.com", role: "sponsor", roleLabel: "Sponsor" },
      { id: "a-1", memberId: "m-1", email: "ana@example.com", role: "architect", roleLabel: "Arquitecto" },
    ]);
  });

  it("shows «Persona desconocida» for a member that is not in the study list, without throwing", () => {
    expect(UNKNOWN_PERSON).toBe("Persona desconocida");
    const rows = buildTeamRows([{ id: "a-9", member_id: "ghost", role: "architect" }], MEMBERS);
    expect(rows).toEqual([{ id: "a-9", memberId: "ghost", email: "Persona desconocida", role: "architect", roleLabel: "Arquitecto" }]);
  });

  it("returns an empty list for no assignments", () => {
    expect(buildTeamRows([], MEMBERS)).toEqual([]);
    expect(buildTeamRows([], [])).toEqual([]);
  });

  it("keeps two functions of the same person as two rows", () => {
    const rows = buildTeamRows(
      [
        { id: "a-1", member_id: "m-1", role: "architect" },
        { id: "a-3", member_id: "m-1", role: "technical_lead" },
      ],
      MEMBERS,
    );
    expect(rows.map((r) => [r.id, r.email])).toEqual([
      ["a-1", "ana@example.com"],
      ["a-3", "ana@example.com"],
    ]);
  });
});

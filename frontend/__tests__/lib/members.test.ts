/**
 * RGB-48 · contract for `@/lib/members`:
 *   type MemberStatus = "invited" | "active" | "revoked"
 *   type Member = { id: string; email: string; role: string; qualifications: string[]; status: MemberStatus }
 *   type MemberInvitation = { email: string; role: string; qualifications: string[] }
 *   MEMBER_ROLES: string[]           (contract order: partner, director, project_director, technical_lead, architect, site_collaborator, administration)
 *   MEMBER_QUALIFICATIONS: string[]  (licensed_signatory, site_management, sponsor)
 *   statusLabel(status): "Invitada" | "Activa" | "Acceso retirado"; unknown -> "Estado desconocido" (the code is not echoed)
 *   isValidEmail(email: string): boolean   (not empty, exactly one «@», domain with a dot; the API has the last word)
 *   fetchMembers(request?): Promise<Member[]>            GET  /api/members (unwraps `{members}`)
 *   inviteMember(invitation, request?): Promise<Member>  POST /api/members/invitations
 *   revokeMember(id, request?): Promise<Member>          POST /api/members/{id}/revoke
 */
import { ApiError, createApiClient, type ResponseLike } from "@/lib/api";
import {
  MEMBER_QUALIFICATIONS,
  MEMBER_ROLES,
  fetchMembers,
  inviteMember,
  isValidEmail,
  revokeMember,
  statusLabel,
  type Member,
} from "@/lib/members";

function json(status: number, body?: unknown): ResponseLike {
  return { ok: status >= 200 && status < 300, status, text: async () => (body === undefined ? "" : JSON.stringify(body)) };
}
function clientWith(response: ResponseLike) {
  const fetch = jest.fn().mockResolvedValue(response);
  return { request: createApiClient({ baseUrl: "http://api", fetch }).request, fetch };
}

const MEMBER: Member = { id: "m-1", email: "ana@example.com", role: "architect", qualifications: ["sponsor"], status: "invited" };

describe("statusLabel", () => {
  it.each([
    ["invited", "Invitada"],
    ["active", "Activa"],
    ["revoked", "Acceso retirado"],
  ])("labels %s as %s", (status, label) => {
    expect(statusLabel(status as Member["status"])).toBe(label);
  });

  it("does not leak an unknown status code", () => {
    expect(statusLabel("suspended" as Member["status"])).toBe("Estado desconocido");
  });
});

describe("roles and qualifications", () => {
  it("lists the roles and qualifications of the contract", () => {
    expect(MEMBER_ROLES).toEqual([
      "partner",
      "director",
      "project_director",
      "technical_lead",
      "architect",
      "site_collaborator",
      "administration",
    ]);
    expect(MEMBER_QUALIFICATIONS).toEqual(["licensed_signatory", "site_management", "sponsor"]);
  });
});

describe("isValidEmail (same rule as the API)", () => {
  it.each(["ana@example.com", "ana.perez+rgb@studio.example.com"])("accepts «%s»", (email) => {
    expect(isValidEmail(email)).toBe(true);
  });

  it.each(["", "   ", "ana", "ana@example", "ana@@example.com", "ana@b@example.com"])("rejects «%s»", (email) => {
    expect(isValidEmail(email)).toBe(false);
  });
});

describe("fetchMembers", () => {
  it("reads GET /api/members and unwraps the list", async () => {
    const { request, fetch } = clientWith(json(200, { members: [MEMBER] }));
    await expect(fetchMembers(request)).resolves.toEqual([MEMBER]);
    expect(fetch).toHaveBeenCalledWith("http://api/api/members", { method: "GET" });
  });

  it("returns an empty list", async () => {
    const { request } = clientWith(json(200, { members: [] }));
    await expect(fetchMembers(request)).resolves.toEqual([]);
  });

  it("rejects with the ApiError of a 403", async () => {
    const { request } = clientWith(json(403, { detail: { code: "no_authority", message: "Solo los socios y directores pueden ver el equipo." } }));
    await expect(fetchMembers(request)).rejects.toMatchObject({ status: 403, code: "no_authority", message: "Solo los socios y directores pueden ver el equipo." });
  });
});

describe("inviteMember", () => {
  const invitation = { email: "ana@example.com", role: "architect", qualifications: ["sponsor"] };

  it("POSTs the invitation JSON to /api/members/invitations and returns the member", async () => {
    const { request, fetch } = clientWith(json(201, MEMBER));
    await expect(inviteMember(invitation, request)).resolves.toEqual(MEMBER);
    const [url, init] = fetch.mock.calls[0];
    expect(url).toBe("http://api/api/members/invitations");
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body)).toEqual(invitation);
  });

  it.each([
    [409, "member_already_exists", "Esa persona ya está en el equipo."],
    [422, "invalid_email", "El correo no es válido."],
    [403, "no_authority", "No tienes autoridad para invitar a ese rol."],
  ])("rejects with the ApiError of a %i", async (status, code, message) => {
    const { request } = clientWith(json(status, { detail: { code, message } }));
    const error = await inviteMember(invitation, request).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ status, code, message });
  });
});

describe("revokeMember", () => {
  it("POSTs to /api/members/{id}/revoke with the id encoded and returns the member", async () => {
    const revoked = { ...MEMBER, status: "revoked" };
    const { request, fetch } = clientWith(json(200, revoked));
    await expect(revokeMember("m/1", request)).resolves.toEqual(revoked);
    const [url, init] = fetch.mock.calls[0];
    expect(url).toBe("http://api/api/members/m%2F1/revoke");
    expect(init.method).toBe("POST");
  });

  it.each([
    [409, "last_partner", "No se puede retirar al último socio."],
    [403, "no_authority", "No tienes autoridad para retirar a esa persona."],
    [404, "member_not_found", "No existe esa persona."],
  ])("rejects with the ApiError of a %i", async (status, code, message) => {
    const { request } = clientWith(json(status, { detail: { code, message } }));
    await expect(revokeMember("m-1", request)).rejects.toMatchObject({ status, code, message });
  });
});

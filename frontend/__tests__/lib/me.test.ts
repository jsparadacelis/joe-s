/**
 * RGB-2b · contract for `@/lib/me`:
 *   fetchMe(client: { request: ApiRequest }): Promise<{ role: string; qualifications: string[] }>
 *     - GET /api/me through the injected client (so the Bearer token travels with it).
 *   roleLabel(role: string | null | undefined): string   (Spanish label; unknown -> "Sin rol")
 *   qualificationLabel(code: string): string              (Spanish label; unknown -> the code is NOT echoed: "Otra cualificación")
 */
import { fetchMe, qualificationLabel, roleLabel } from "@/lib/me";

describe("roleLabel", () => {
  it.each([
    ["partner", "Socio"],
    ["director", "Director"],
    ["project_director", "Director de proyecto"],
    ["technical_lead", "Líder técnico"],
    ["architect", "Arquitecto"],
    ["site_collaborator", "Colaborador de obra"],
    ["administration", "Administración"],
  ])("labels %s as %s", (role, label) => {
    expect(roleLabel(role)).toBe(label);
  });

  it("does not leak an unknown role code", () => {
    expect(roleLabel("intern")).toBe("Sin rol");
    expect(roleLabel(null)).toBe("Sin rol");
    expect(roleLabel(undefined)).toBe("Sin rol");
  });
});

describe("qualificationLabel", () => {
  it.each([
    ["licensed_signatory", "Firmante habilitado"],
    ["site_management", "Dirección facultativa"],
    ["sponsor", "Sponsor"],
  ])("labels %s as %s", (code, label) => {
    expect(qualificationLabel(code)).toBe(label);
  });

  it("does not leak an unknown code", () => {
    expect(qualificationLabel("secret_thing")).toBe("Otra cualificación");
  });
});

describe("fetchMe", () => {
  it("reads GET /api/me through the client", async () => {
    const request = jest.fn().mockResolvedValue({ role: "director", qualifications: ["sponsor"] });
    const me = await fetchMe({ request });
    expect(request).toHaveBeenCalledWith("/api/me");
    expect(me).toEqual({ role: "director", qualifications: ["sponsor"] });
  });

  it("propagates the ApiError so the caller can redirect", async () => {
    const error = Object.assign(new Error("x"), { status: 401, code: "unauthenticated" });
    const request = jest.fn().mockRejectedValue(error);
    await expect(fetchMe({ request })).rejects.toBe(error);
  });
});

/**
 * RGB-49 · contract for `@/components/project/ProjectTeamEditor` (client component, named export):
 *   props: code: string; all the rest optional and defaulting to lib/project-team + lib/members:
 *     teamFetcher(code): Promise<ProjectAssignment[]>, membersFetcher(): Promise<Member[]> (default fetchMembers from @/lib/members, RGB-48),
 *     assigner(code, memberId, role): Promise<ProjectAssignment>, unassigner(code, assignmentId): Promise<ProjectAssignment>
 *   Panel h2 «Equipo del proyecto»; loading «Cargando el equipo…»; table «Equipo del proyecto» (Persona, Función, Acciones);
 *   empty «Todavía no hay equipo asignado» (no table, form still there); unknown person «Persona desconocida».
 *   Form «Asignar una función»: select «Persona» (placeholder option «Elige una persona», only status=active, option text = email),
 *   select «Función» (placeholder «Elige una función» + the seven labels), button «Asignar».
 *   Picking a signing function shows a note «Esta función exige la cualificación «<etiqueta>».» tied to the select by aria-describedby.
 *   Client checks: «Elige una persona.» / «Elige una función.» (role=alert, aria-invalid, focus on the first invalid field, no call).
 *   Assign ok: status «Se asignó la función «<función>» a <correo>.», form reset, team reloaded, focus on «Persona».
 *   Assign error: API message in a role=alert that takes focus; the form keeps its values.
 *   Row button «Quitar a <correo> como <función>» -> inline «Confirmar quitar a <correo> como <función>» + «Cancelar» (Escape too, focus back on Quitar).
 *   Remove ok: status «Se quitó la función «<función>» a <correo>.», team reloaded, focus on the status. Error: API message in a role=alert with focus.
 */
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { axe } from "jest-axe";
import { ProjectTeamEditor } from "@/components/project/ProjectTeamEditor";
import { ApiError } from "@/lib/api";
import type { Member } from "@/lib/members";

const CODE = "PRY-2026-001";
const MEMBERS: Member[] = [
  { id: "m-1", email: "ana@example.com", role: "architect", qualifications: [], status: "active" },
  { id: "m-2", email: "luis@example.com", role: "director", qualifications: ["sponsor"], status: "active" },
  { id: "m-3", email: "invitada@example.com", role: "architect", qualifications: [], status: "invited" },
  { id: "m-4", email: "retirado@example.com", role: "architect", qualifications: [], status: "revoked" },
];
const ARCHITECT = { id: "a-1", member_id: "m-1", role: "architect" };
const SPONSOR = { id: "a-2", member_id: "m-2", role: "sponsor" };
const GHOST = { id: "a-3", member_id: "gone", role: "technical_lead" };
const TEAM = [ARCHITECT, SPONSOR, GHOST];
const UNEXPECTED = "Ocurrió un error inesperado. Inténtalo de nuevo.";

function setup(overrides: { teamFetcher?: jest.Mock; membersFetcher?: jest.Mock; assigner?: jest.Mock; unassigner?: jest.Mock } = {}) {
  const teamFetcher = overrides.teamFetcher ?? jest.fn().mockResolvedValue(TEAM);
  const membersFetcher = overrides.membersFetcher ?? jest.fn().mockResolvedValue(MEMBERS);
  const assigner = overrides.assigner ?? jest.fn().mockResolvedValue({ id: "a-9", member_id: "m-2", role: "architect" });
  const unassigner = overrides.unassigner ?? jest.fn().mockResolvedValue(ARCHITECT);
  const user = userEvent.setup();
  const view = render(
    <ProjectTeamEditor code={CODE} teamFetcher={teamFetcher} membersFetcher={membersFetcher} assigner={assigner} unassigner={unassigner} />,
  );
  return { teamFetcher, membersFetcher, assigner, unassigner, user, ...view };
}
async function loaded(rest = setup()) {
  await screen.findByRole("table", { name: "Equipo del proyecto" });
  return rest;
}

const personField = () => screen.getByLabelText("Persona") as HTMLSelectElement;
const roleField = () => screen.getByLabelText("Función") as HTMLSelectElement;
const assignButton = () => screen.getByRole("button", { name: "Asignar" });
const removeButton = (email: string, role: string) => screen.getByRole("button", { name: `Quitar a ${email} como ${role}` });
const apiError = (status: number, code: string, message: string) => new ApiError(status, code, message);

describe("ProjectTeamEditor loading", () => {
  it("shows a loading message, then the title and the table, asking for this project", async () => {
    const { teamFetcher, membersFetcher } = setup();
    expect(screen.getByText("Cargando el equipo…")).toBeInTheDocument();
    await screen.findByRole("heading", { level: 2, name: "Equipo del proyecto" });
    await screen.findByRole("table", { name: "Equipo del proyecto" });
    expect(teamFetcher).toHaveBeenCalledWith(CODE);
    expect(membersFetcher).toHaveBeenCalledTimes(1);
  });

  it("shows the empty state and still offers the assignment form", async () => {
    setup({ teamFetcher: jest.fn().mockResolvedValue([]) });
    expect(await screen.findByText("Todavía no hay equipo asignado")).toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
    expect(assignButton()).toBeInTheDocument();
  });

  it("shows the error with a retry button when the team cannot be loaded", async () => {
    const teamFetcher = jest
      .fn()
      .mockRejectedValueOnce(apiError(0, "network_error", "No se pudo conectar con el servidor. Comprueba tu conexión e inténtalo de nuevo."))
      .mockResolvedValue(TEAM);
    const { user, membersFetcher } = setup({ teamFetcher });
    expect(await screen.findByRole("alert")).toHaveTextContent("No se pudo conectar con el servidor");
    await user.click(screen.getByRole("button", { name: "Reintentar" }));
    await screen.findByRole("table", { name: "Equipo del proyecto" });
    expect(teamFetcher).toHaveBeenCalledTimes(2);
    expect(membersFetcher.mock.calls.length).toBeGreaterThanOrEqual(1);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("shows the message of the API when listing the people fails (403)", async () => {
    setup({ membersFetcher: jest.fn().mockRejectedValue(apiError(403, "no_authority", "Solo los socios y directores pueden ver el equipo.")) });
    expect(await screen.findByRole("alert")).toHaveTextContent("Solo los socios y directores pueden ver el equipo.");
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });

  it("shows a generic Spanish alert for a non-API failure", async () => {
    setup({ teamFetcher: jest.fn().mockRejectedValue(new Error("boom")) });
    expect(await screen.findByRole("alert")).toHaveTextContent(UNEXPECTED);
  });
});

describe("ProjectTeamEditor table", () => {
  it("has the three column headers", async () => {
    await loaded();
    expect(screen.getAllByRole("columnheader").map((h) => h.textContent)).toEqual(["Persona", "Función", "Acciones"]);
  });

  it("shows the email and the function in Spanish for each assignment", async () => {
    await loaded();
    const rows = screen.getAllByRole("row").slice(1);
    expect(rows).toHaveLength(3);
    expect(within(rows[0]).getByText("ana@example.com")).toBeInTheDocument();
    expect(within(rows[0]).getByText("Arquitecto")).toBeInTheDocument();
    expect(within(rows[1]).getByText("luis@example.com")).toBeInTheDocument();
    expect(within(rows[1]).getByText("Sponsor")).toBeInTheDocument();
  });

  it("shows «Persona desconocida» for an assignment whose person is not in the list, and can still remove it", async () => {
    await loaded();
    const row = screen.getAllByRole("row")[3];
    expect(within(row).getByText("Persona desconocida")).toBeInTheDocument();
    expect(within(row).getByText("Líder técnico")).toBeInTheDocument();
    expect(removeButton("Persona desconocida", "Líder técnico")).toBeInTheDocument();
  });

  it("does not leak raw function codes", async () => {
    const { container } = await loaded();
    for (const code of ["architect", "sponsor", "technical_lead", "member_id"]) expect(container).not.toHaveTextContent(code);
  });

  it("gives every Quitar button the email and the function in its accessible name", async () => {
    await loaded();
    expect(removeButton("ana@example.com", "Arquitecto")).toBeInTheDocument();
    expect(removeButton("luis@example.com", "Sponsor")).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: /^Quitar a / })).toHaveLength(3);
  });
});

describe("ProjectTeamEditor assignment form", () => {
  it("has a labelled form with Persona, Función and Asignar", async () => {
    await loaded();
    expect(screen.getByRole("form", { name: "Asignar una función" })).toBeInTheDocument();
    expect(personField().tagName).toBe("SELECT");
    expect(roleField().tagName).toBe("SELECT");
  });

  it("offers only active people in the selector", async () => {
    await loaded();
    const options = within(personField()).getAllByRole("option").map((o) => o.textContent);
    expect(options).toEqual(["Elige una persona", "ana@example.com", "luis@example.com"]);
  });

  it("offers the seven functions", async () => {
    await loaded();
    expect(within(roleField()).getAllByRole("option").map((o) => o.textContent)).toEqual([
      "Elige una función",
      "Director de proyecto",
      "Líder técnico",
      "Arquitecto",
      "Colaborador de obra",
      "Firmante habilitado",
      "Dirección facultativa",
      "Sponsor",
    ]);
  });

  it.each([
    ["licensed_signatory", "Firmante habilitado"],
    ["site_management", "Dirección facultativa"],
    ["sponsor", "Sponsor"],
  ])("warns that %s demands the qualification «%s», tied to the select", async (role, label) => {
    const { user } = await loaded();
    await user.selectOptions(roleField(), role);
    const note = screen.getByText(/exige la cualificación/i);
    expect(note).toHaveTextContent(label);
    expect(roleField().getAttribute("aria-describedby")?.split(" ")).toContain(note.id);
  });

  it("shows no qualification note for the other functions, and removes it when switching", async () => {
    const { user } = await loaded();
    await user.selectOptions(roleField(), "architect");
    expect(screen.queryByText(/exige la cualificación/i)).not.toBeInTheDocument();
    await user.selectOptions(roleField(), "sponsor");
    expect(screen.getByText(/exige la cualificación/i)).toBeInTheDocument();
    await user.selectOptions(roleField(), "technical_lead");
    expect(screen.queryByText(/exige la cualificación/i)).not.toBeInTheDocument();
  });

  it("asks for a person before calling the API, with focus and aria-invalid on the field", async () => {
    const { user, assigner } = await loaded();
    await user.selectOptions(roleField(), "architect");
    await user.click(assignButton());
    expect(assigner).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toHaveTextContent("Elige una persona.");
    expect(personField()).toHaveAttribute("aria-invalid", "true");
    expect(personField()).toHaveFocus();
  });

  it("asks for a function before calling the API", async () => {
    const { user, assigner } = await loaded();
    await user.selectOptions(personField(), "m-1");
    await user.click(assignButton());
    expect(assigner).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toHaveTextContent("Elige una función.");
    expect(roleField()).toHaveAttribute("aria-invalid", "true");
    expect(roleField()).toHaveFocus();
  });

  it("assigns: sends project, person and function, announces it, reloads the team and returns focus to Persona", async () => {
    const teamFetcher = jest.fn().mockResolvedValueOnce(TEAM).mockResolvedValue([...TEAM, { id: "a-9", member_id: "m-2", role: "architect" }]);
    const { user, assigner } = await loaded(setup({ teamFetcher }));
    await user.selectOptions(personField(), "m-2");
    await user.selectOptions(roleField(), "architect");
    await user.click(assignButton());
    await waitFor(() => expect(assigner).toHaveBeenCalledWith(CODE, "m-2", "architect"));
    expect(await screen.findByRole("status")).toHaveTextContent("Se asignó la función «Arquitecto» a luis@example.com.");
    await waitFor(() => expect(teamFetcher).toHaveBeenCalledTimes(2));
    expect(removeButton("luis@example.com", "Arquitecto")).toBeInTheDocument();
    expect(personField()).toHaveValue("");
    expect(roleField()).toHaveValue("");
    expect(personField()).toHaveFocus();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("disables Asignar while the request is in flight", async () => {
    let resolve: (v: unknown) => void = () => undefined;
    const assigner = jest.fn().mockReturnValue(new Promise((r) => (resolve = r)));
    const { user } = await loaded(setup({ assigner }));
    await user.selectOptions(personField(), "m-1");
    await user.selectOptions(roleField(), "architect");
    await user.click(assignButton());
    expect(assignButton()).toBeDisabled();
    resolve({ id: "a-9", member_id: "m-1", role: "architect" });
    await waitFor(() => expect(assignButton()).toBeEnabled());
  });

  it.each([
    [403, "no_authority", "Solo los socios y directores pueden asignar funciones."],
    [404, "project_not_found", "No existe el proyecto PRY-2026-001."],
    [404, "member_not_found", "No existe esa persona en el estudio."],
    [409, "member_not_active", "La persona no está activa en el estudio."],
    [409, "assignment_already_exists", "La persona ya tiene esa función en el proyecto."],
    [422, "missing_qualification", "La persona no tiene la cualificación que exige esta función."],
    [422, "signing_function_restricted", "Las funciones de firma solo las asigna un socio o director."],
  ])("shows the API message for %s %s in an alert that takes focus, keeping the values", async (status, code, message) => {
    const assigner = jest.fn().mockRejectedValue(apiError(status, code, message));
    const { user, teamFetcher } = await loaded(setup({ assigner }));
    await user.selectOptions(personField(), "m-1");
    await user.selectOptions(roleField(), "sponsor");
    await user.click(assignButton());
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(message);
    expect(alert).toHaveFocus();
    expect(personField()).toHaveValue("m-1");
    expect(roleField()).toHaveValue("sponsor");
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    expect(teamFetcher).toHaveBeenCalledTimes(1);
    expect(assignButton()).toBeEnabled();
  });

  it("shows a generic Spanish alert when assigning fails with a non-API error", async () => {
    const { user } = await loaded(setup({ assigner: jest.fn().mockRejectedValue(new Error("boom")) }));
    await user.selectOptions(personField(), "m-1");
    await user.selectOptions(roleField(), "architect");
    await user.click(assignButton());
    expect(await screen.findByRole("alert")).toHaveTextContent(UNEXPECTED);
  });

  it("clears a previous error when the next attempt succeeds", async () => {
    const assigner = jest
      .fn()
      .mockRejectedValueOnce(apiError(409, "assignment_already_exists", "La persona ya tiene esa función en el proyecto."))
      .mockResolvedValue({ id: "a-9", member_id: "m-1", role: "architect" });
    const { user } = await loaded(setup({ assigner }));
    await user.selectOptions(personField(), "m-1");
    await user.selectOptions(roleField(), "architect");
    await user.click(assignButton());
    await screen.findByRole("alert");
    await user.click(assignButton());
    await screen.findByRole("status");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});

describe("ProjectTeamEditor removal", () => {
  it("asks for an inline confirmation naming the person and the function, without calling the API yet", async () => {
    const { user, unassigner } = await loaded();
    await user.click(removeButton("ana@example.com", "Arquitecto"));
    expect(screen.getByRole("button", { name: "Confirmar quitar a ana@example.com como Arquitecto" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Cancelar" })).toBeInTheDocument();
    expect(unassigner).not.toHaveBeenCalled();
  });

  it("Cancelar closes the confirmation and returns focus to Quitar", async () => {
    const { user, unassigner } = await loaded();
    await user.click(removeButton("ana@example.com", "Arquitecto"));
    await user.click(screen.getByRole("button", { name: "Cancelar" }));
    expect(screen.queryByRole("button", { name: /^Confirmar quitar/ })).not.toBeInTheDocument();
    expect(removeButton("ana@example.com", "Arquitecto")).toHaveFocus();
    expect(unassigner).not.toHaveBeenCalled();
  });

  it("Escape closes the confirmation and returns focus to Quitar", async () => {
    const { user, unassigner } = await loaded();
    await user.click(removeButton("luis@example.com", "Sponsor"));
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("button", { name: /^Confirmar quitar/ })).not.toBeInTheDocument();
    expect(removeButton("luis@example.com", "Sponsor")).toHaveFocus();
    expect(unassigner).not.toHaveBeenCalled();
  });

  it("confirming removes that assignment, announces it, reloads and moves focus to the status", async () => {
    const teamFetcher = jest.fn().mockResolvedValueOnce(TEAM).mockResolvedValue([SPONSOR, GHOST]);
    const { user, unassigner } = await loaded(setup({ teamFetcher }));
    await user.click(removeButton("ana@example.com", "Arquitecto"));
    await user.click(screen.getByRole("button", { name: "Confirmar quitar a ana@example.com como Arquitecto" }));
    await waitFor(() => expect(unassigner).toHaveBeenCalledWith(CODE, "a-1"));
    const status = await screen.findByRole("status");
    expect(status).toHaveTextContent("Se quitó la función «Arquitecto» a ana@example.com.");
    await waitFor(() => expect(teamFetcher).toHaveBeenCalledTimes(2));
    expect(screen.queryByRole("button", { name: /Quitar a ana@example\.com/ })).not.toBeInTheDocument();
    expect(status).toHaveFocus();
  });

  it("removing the last assignment shows the empty state", async () => {
    const teamFetcher = jest.fn().mockResolvedValueOnce([ARCHITECT]).mockResolvedValue([]);
    const { user } = await loaded(setup({ teamFetcher }));
    await user.click(removeButton("ana@example.com", "Arquitecto"));
    await user.click(screen.getByRole("button", { name: /^Confirmar quitar/ }));
    expect(await screen.findByText("Todavía no hay equipo asignado")).toBeInTheDocument();
  });

  it.each([
    [403, "no_authority", "Solo los socios y directores pueden quitar funciones."],
    [404, "assignment_not_found", "La asignación ya no existe."],
  ])("shows the API message for %s %s in an alert that takes focus", async (status, code, message) => {
    const unassigner = jest.fn().mockRejectedValue(apiError(status, code, message));
    const { user } = await loaded(setup({ unassigner }));
    await user.click(removeButton("ana@example.com", "Arquitecto"));
    await user.click(screen.getByRole("button", { name: /^Confirmar quitar/ }));
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(message);
    expect(alert).toHaveFocus();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Confirmar quitar/ })).not.toBeInTheDocument();
  });

  it("shows a generic Spanish alert when removing fails with a non-API error", async () => {
    const { user } = await loaded(setup({ unassigner: jest.fn().mockRejectedValue(new Error("boom")) }));
    await user.click(removeButton("ana@example.com", "Arquitecto"));
    await user.click(screen.getByRole("button", { name: /^Confirmar quitar/ }));
    expect(await screen.findByRole("alert")).toHaveTextContent(UNEXPECTED);
  });
});

describe("ProjectTeamEditor accessibility", () => {
  it("has no violations while loading", async () => {
    const { container } = setup({ teamFetcher: jest.fn().mockReturnValue(new Promise(() => undefined)) });
    expect(await axe(container)).toHaveNoViolations();
  });

  it("has no violations with the table", async () => {
    const { container } = await loaded();
    expect(await axe(container)).toHaveNoViolations();
  });

  it("has no violations in the empty state", async () => {
    const { container } = setup({ teamFetcher: jest.fn().mockResolvedValue([]) });
    await screen.findByText("Todavía no hay equipo asignado");
    expect(await axe(container)).toHaveNoViolations();
  });

  it("has no violations with the load error", async () => {
    const { container } = setup({ teamFetcher: jest.fn().mockRejectedValue(apiError(500, "boom", "Falló la carga.")) });
    await screen.findByRole("alert");
    expect(await axe(container)).toHaveNoViolations();
  });

  it("has no violations with the signing-function note and the inline confirmation", async () => {
    const { user, container } = await loaded();
    await user.selectOptions(roleField(), "licensed_signatory");
    await user.click(removeButton("ana@example.com", "Arquitecto"));
    expect(await axe(container)).toHaveNoViolations();
  });

  it("has no violations with a validation error and with an API error", async () => {
    const { user, container } = await loaded(setup({ assigner: jest.fn().mockRejectedValue(apiError(409, "member_not_active", "La persona no está activa.")) }));
    await user.click(assignButton());
    expect(await axe(container)).toHaveNoViolations();
    await user.selectOptions(personField(), "m-1");
    await user.selectOptions(roleField(), "architect");
    await user.click(assignButton());
    await screen.findByText("La persona no está activa.");
    expect(await axe(container)).toHaveNoViolations();
  });
});

/**
 * RGB-48 · contract for `@/components/settings/TeamEditor` (client component, named export):
 *   props (all optional, default to lib/members): fetcher(): Promise<Member[]>,
 *     inviter(invitation: {email, role, qualifications}): Promise<Member>, revoker(id: string): Promise<Member>
 *   Panel h2 «Equipo del estudio»; table «Equipo del estudio» (Correo, Rol, Cualificaciones, Estado, Acciones);
 *   form «Invitar a una persona» (Correo electrónico, Rol, group Cualificaciones, button Invitar);
 *   per row button «Retirar acceso de <correo>» -> inline confirmation «Confirmar retiro de <correo>» / «Cancelar».
 */
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { axe } from "jest-axe";
import { TeamEditor } from "@/components/settings/TeamEditor";
import { ApiError } from "@/lib/api";
import type { Member } from "@/lib/members";

const PARTNER: Member = { id: "m-1", email: "socia@example.com", role: "partner", qualifications: ["licensed_signatory", "sponsor"], status: "active" };
const INVITED: Member = { id: "m-2", email: "ana@example.com", role: "architect", qualifications: [], status: "invited" };
const REVOKED: Member = { id: "m-3", email: "luis@example.com", role: "administration", qualifications: ["site_management"], status: "revoked" };
const MEMBERS = [PARTNER, INVITED, REVOKED];
const NEW_MEMBER: Member = { id: "m-4", email: "nuevo@example.com", role: "director", qualifications: ["sponsor"], status: "invited" };
const SUCCESS = "Invitación creada. La persona se activa al entrar con Google con este correo.";
const EMAIL_MESSAGE = "Escribe un correo electrónico válido.";
const ROLE_MESSAGE = "Elige un rol.";
const UNEXPECTED = "Ocurrió un error inesperado. Inténtalo de nuevo.";

function setup(overrides: { fetcher?: jest.Mock; inviter?: jest.Mock; revoker?: jest.Mock } = {}) {
  const fetcher = overrides.fetcher ?? jest.fn().mockResolvedValue(MEMBERS);
  const inviter = overrides.inviter ?? jest.fn().mockResolvedValue(NEW_MEMBER);
  const revoker = overrides.revoker ?? jest.fn().mockResolvedValue({ ...INVITED, status: "revoked" });
  const user = userEvent.setup();
  const view = render(<TeamEditor fetcher={fetcher} inviter={inviter} revoker={revoker} />);
  return { fetcher, inviter, revoker, user, ...view };
}
async function loaded(rest = setup()) {
  await screen.findByRole("table", { name: "Equipo del estudio" });
  return rest;
}

const emailField = () => screen.getByLabelText("Correo electrónico") as HTMLInputElement;
const roleField = () => screen.getByLabelText("Rol") as HTMLSelectElement;
const inviteButton = () => screen.getByRole("button", { name: "Invitar" });
const rowOf = (email: string) => screen.getByRole("row", { name: new RegExp(email.replace(".", "\\.")) });
const revokeButton = (email: string) => screen.getByRole("button", { name: `Retirar acceso de ${email}` });

async function fillInvitation(user: ReturnType<typeof userEvent.setup>, email: string, role: string, qualifications: string[] = []) {
  await user.clear(emailField());
  if (email !== "") await user.type(emailField(), email);
  if (role !== "") await user.selectOptions(roleField(), role);
  for (const q of qualifications) await user.click(screen.getByRole("checkbox", { name: q }));
}

describe("TeamEditor loading", () => {
  it("shows a loading message, then the title and the table", async () => {
    const { fetcher } = setup();
    expect(screen.getByText("Cargando el equipo…")).toBeInTheDocument();
    await screen.findByRole("heading", { level: 2, name: "Equipo del estudio" });
    await screen.findByRole("table", { name: "Equipo del estudio" });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("explains that an invited person activates by signing in with Google", async () => {
    await loaded();
    expect(screen.getByText(/entrar con Google/i)).toBeInTheDocument();
  });

  it("shows an empty state, and still offers the invitation form", async () => {
    setup({ fetcher: jest.fn().mockResolvedValue([]) });
    expect(await screen.findByText("Todavía no hay personas en el equipo.")).toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
    expect(inviteButton()).toBeInTheDocument();
  });

  it("shows the error with a retry button when loading fails", async () => {
    const fetcher = jest
      .fn()
      .mockRejectedValueOnce(new ApiError(0, "network_error", "No se pudo conectar con el servidor. Comprueba tu conexión e inténtalo de nuevo."))
      .mockResolvedValue(MEMBERS);
    const { user } = setup({ fetcher });
    expect(await screen.findByRole("alert")).toHaveTextContent("No se pudo conectar con el servidor");
    await user.click(screen.getByRole("button", { name: "Reintentar" }));
    await screen.findByRole("table", { name: "Equipo del estudio" });
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("shows the message of the API when listing is forbidden (403)", async () => {
    const fetcher = jest.fn().mockRejectedValue(new ApiError(403, "no_authority", "Solo los socios y directores pueden ver el equipo."));
    setup({ fetcher });
    expect(await screen.findByRole("alert")).toHaveTextContent("Solo los socios y directores pueden ver el equipo.");
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });

  it("shows a generic Spanish alert for a non-API failure", async () => {
    setup({ fetcher: jest.fn().mockRejectedValue(new Error("boom")) });
    expect(await screen.findByRole("alert")).toHaveTextContent(UNEXPECTED);
  });
});

describe("TeamEditor table", () => {
  it("has the five column headers", async () => {
    await loaded();
    const headers = screen.getAllByRole("columnheader").map((h) => h.textContent);
    expect(headers).toEqual(["Correo", "Rol", "Cualificaciones", "Estado", "Acciones"]);
  });

  it("shows email, role, qualifications and status in Spanish for each person", async () => {
    await loaded();
    const partner = within(rowOf("socia@example.com"));
    expect(partner.getByText("Socio")).toBeInTheDocument();
    expect(partner.getByText(/Firmante habilitado/)).toBeInTheDocument();
    expect(partner.getByText(/Sponsor/)).toBeInTheDocument();
    expect(partner.getByText("Activa")).toBeInTheDocument();
    const invited = within(rowOf("ana@example.com"));
    expect(invited.getByText("Arquitecto")).toBeInTheDocument();
    expect(invited.getByText("Invitada")).toBeInTheDocument();
    const revoked = within(rowOf("luis@example.com"));
    expect(revoked.getByText("Administración")).toBeInTheDocument();
    expect(revoked.getByText("Dirección facultativa")).toBeInTheDocument();
    expect(revoked.getByText("Acceso retirado")).toBeInTheDocument();
  });

  it("does not leak raw role, status or qualification codes", async () => {
    const { container } = await loaded();
    for (const code of ["partner", "architect", "invited", "revoked", "licensed_signatory", "site_management"]) {
      expect(container).not.toHaveTextContent(code);
    }
  });

  it("offers Retirar acceso with the email in its accessible name, except to people already revoked", async () => {
    await loaded();
    expect(revokeButton("socia@example.com")).toBeInTheDocument();
    expect(revokeButton("ana@example.com")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /luis@example\.com/ })).not.toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: /^Retirar acceso de / })).toHaveLength(2);
  });
});

describe("TeamEditor invitation form", () => {
  it("has labelled fields: email, role select with the seven roles, qualifications as checkboxes", async () => {
    await loaded();
    expect(screen.getByRole("form", { name: "Invitar a una persona" })).toBeInTheDocument();
    expect(emailField()).toHaveAttribute("type", "email");
    const options = within(roleField()).getAllByRole("option").map((o) => o.textContent);
    expect(options).toEqual(expect.arrayContaining(["Socio", "Director", "Director de proyecto", "Líder técnico", "Arquitecto", "Colaborador de obra", "Administración"]));
    const group = screen.getByRole("group", { name: "Cualificaciones" });
    expect(within(group).getAllByRole("checkbox").map((c) => c.getAttribute("aria-label") ?? c.closest("label")?.textContent)).toEqual([
      "Firmante habilitado",
      "Dirección facultativa",
      "Sponsor",
    ]);
  });

  it.each(["", "ana", "ana@example", "ana@@example.com"])("rejects the email «%s» next to the field without calling the API", async (bad) => {
    const { user, inviter } = await loaded();
    await fillInvitation(user, bad, "architect");
    await user.click(inviteButton());
    const message = await screen.findByText(EMAIL_MESSAGE);
    expect(message).toHaveAttribute("role", "alert");
    expect(emailField()).toHaveAttribute("aria-invalid", "true");
    expect(emailField()).toHaveAccessibleDescription(EMAIL_MESSAGE);
    expect(emailField()).toHaveFocus();
    expect(inviter).not.toHaveBeenCalled();
  });

  it("requires a role", async () => {
    const { user, inviter } = await loaded();
    await fillInvitation(user, "nuevo@example.com", "");
    await user.click(inviteButton());
    expect(await screen.findByText(ROLE_MESSAGE)).toHaveAttribute("role", "alert");
    expect(roleField()).toHaveAttribute("aria-invalid", "true");
    expect(roleField()).toHaveAccessibleDescription(ROLE_MESSAGE);
    expect(roleField()).toHaveFocus();
    expect(inviter).not.toHaveBeenCalled();
  });

  it("removes a field error as soon as the field is edited", async () => {
    const { user } = await loaded();
    await fillInvitation(user, "ana", "architect");
    await user.click(inviteButton());
    await screen.findByText(EMAIL_MESSAGE);
    await user.type(emailField(), "@example.com");
    expect(screen.queryByText(EMAIL_MESSAGE)).not.toBeInTheDocument();
  });

  it("sends email, role and the checked qualifications", async () => {
    const { user, inviter } = await loaded();
    await fillInvitation(user, "nuevo@example.com", "director", ["Sponsor", "Firmante habilitado"]);
    await user.click(inviteButton());
    expect(inviter).toHaveBeenCalledTimes(1);
    expect(inviter).toHaveBeenCalledWith({
      email: "nuevo@example.com",
      role: "director",
      qualifications: expect.arrayContaining(["sponsor", "licensed_signatory"]),
    });
    expect(inviter.mock.calls[0][0].qualifications).toHaveLength(2);
  });

  it("sends an empty qualifications list when none is checked", async () => {
    const { user, inviter } = await loaded();
    await fillInvitation(user, "nuevo@example.com", "architect");
    await user.click(inviteButton());
    expect(inviter).toHaveBeenCalledWith({ email: "nuevo@example.com", role: "architect", qualifications: [] });
  });

  it("on success: announces politely, reloads the list, clears the form and focuses the email field", async () => {
    const fetcher = jest.fn().mockResolvedValueOnce(MEMBERS).mockResolvedValue([...MEMBERS, NEW_MEMBER]);
    const { user } = await loaded(setup({ fetcher }));
    await fillInvitation(user, "nuevo@example.com", "director", ["Sponsor"]);
    await user.click(inviteButton());
    const status = await screen.findByText(SUCCESS);
    expect(status.closest("[role='status']")).not.toBeNull();
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(await screen.findByRole("row", { name: /nuevo@example\.com/ })).toBeInTheDocument();
    expect(emailField()).toHaveValue("");
    expect(roleField()).toHaveValue("");
    expect(screen.getByRole("checkbox", { name: "Sponsor" })).not.toBeChecked();
    expect(emailField()).toHaveFocus();
  });

  it("clears the success notice when editing again", async () => {
    const { user } = await loaded();
    await fillInvitation(user, "nuevo@example.com", "director");
    await user.click(inviteButton());
    await screen.findByText(SUCCESS);
    await user.type(emailField(), "x");
    expect(screen.queryByText(SUCCESS)).not.toBeInTheDocument();
  });

  it("disables Invitar while the request is in flight, so it cannot be sent twice", async () => {
    let resolve: (m: Member) => void = () => undefined;
    const inviter = jest.fn().mockReturnValue(new Promise<Member>((r) => (resolve = r)));
    const { user } = await loaded(setup({ inviter }));
    await fillInvitation(user, "nuevo@example.com", "director");
    await user.click(inviteButton());
    expect(inviteButton()).toBeDisabled();
    resolve(NEW_MEMBER);
    await screen.findByText(SUCCESS);
    expect(inviter).toHaveBeenCalledTimes(1);
  });

  it("422 invalid_email: the server message next to the email, focus on it, nothing reloaded", async () => {
    const inviter = jest.fn().mockRejectedValue(new ApiError(422, "invalid_email", "El correo no es válido."));
    const { user, fetcher } = await loaded(setup({ inviter }));
    await fillInvitation(user, "raro@example.com", "architect");
    await user.click(inviteButton());
    expect(await screen.findByText("El correo no es válido.")).toHaveAttribute("role", "alert");
    expect(emailField()).toHaveAttribute("aria-invalid", "true");
    expect(emailField()).toHaveAccessibleDescription("El correo no es válido.");
    expect(emailField()).toHaveFocus();
    expect(emailField()).toHaveValue("raro@example.com");
    expect(screen.queryByText(SUCCESS)).not.toBeInTheDocument();
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("409 member_already_exists: the server message next to the email, draft kept", async () => {
    const inviter = jest.fn().mockRejectedValue(new ApiError(409, "member_already_exists", "Esa persona ya forma parte del equipo."));
    const { user } = await loaded(setup({ inviter }));
    await fillInvitation(user, "ana@example.com", "architect");
    await user.click(inviteButton());
    expect(await screen.findByText("Esa persona ya forma parte del equipo.")).toHaveAttribute("role", "alert");
    expect(emailField()).toHaveAttribute("aria-invalid", "true");
    expect(emailField()).toHaveFocus();
    expect(roleField()).toHaveValue("architect");
    expect(inviteButton()).toBeEnabled();
  });

  it("403 no_authority: an alert with the server message that receives focus, draft kept", async () => {
    const inviter = jest.fn().mockRejectedValue(new ApiError(403, "no_authority", "Solo un socio puede invitar a ese rol."));
    const { user } = await loaded(setup({ inviter }));
    await fillInvitation(user, "nuevo@example.com", "partner");
    await user.click(inviteButton());
    const alert = await screen.findByText("Solo un socio puede invitar a ese rol.");
    expect(alert.closest("[role='alert']")).toHaveFocus();
    expect(emailField()).toHaveValue("nuevo@example.com");
    expect(roleField()).toHaveValue("partner");
    expect(inviteButton()).toBeEnabled();
  });

  it("other failures show a generic Spanish alert and keep the draft", async () => {
    const inviter = jest.fn().mockRejectedValue(new Error("boom"));
    const { user } = await loaded(setup({ inviter }));
    await fillInvitation(user, "nuevo@example.com", "architect");
    await user.click(inviteButton());
    expect(await screen.findByText(UNEXPECTED)).toBeInTheDocument();
    expect(emailField()).toHaveValue("nuevo@example.com");
  });
});

describe("TeamEditor revoking access", () => {
  it("asks for confirmation first and does not revoke yet", async () => {
    const { user, revoker } = await loaded();
    await user.click(revokeButton("ana@example.com"));
    expect(revoker).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Confirmar retiro de ana@example.com" })).toHaveFocus();
    expect(screen.getByRole("button", { name: "Cancelar" })).toBeInTheDocument();
  });

  it("cancelling closes the confirmation, returns focus to Retirar acceso and revokes nothing", async () => {
    const { user, revoker } = await loaded();
    await user.click(revokeButton("ana@example.com"));
    await user.click(screen.getByRole("button", { name: "Cancelar" }));
    expect(screen.queryByRole("button", { name: /Confirmar retiro/ })).not.toBeInTheDocument();
    expect(revokeButton("ana@example.com")).toHaveFocus();
    expect(revoker).not.toHaveBeenCalled();
  });

  it("Escape also cancels the confirmation", async () => {
    const { user, revoker } = await loaded();
    await user.click(revokeButton("ana@example.com"));
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("button", { name: /Confirmar retiro/ })).not.toBeInTheDocument();
    expect(revoker).not.toHaveBeenCalled();
  });

  it("confirming revokes that person by id, announces it and reloads the list", async () => {
    const fetcher = jest
      .fn()
      .mockResolvedValueOnce(MEMBERS)
      .mockResolvedValue([PARTNER, { ...INVITED, status: "revoked" }, REVOKED]);
    const { user, revoker } = await loaded(setup({ fetcher }));
    await user.click(revokeButton("ana@example.com"));
    await user.click(screen.getByRole("button", { name: "Confirmar retiro de ana@example.com" }));
    expect(revoker).toHaveBeenCalledWith("m-2");
    const status = await screen.findByText("Acceso retirado a ana@example.com.");
    expect(status.closest("[role='status']")).not.toBeNull();
    expect(fetcher).toHaveBeenCalledTimes(2);
    await waitFor(() => expect(within(rowOf("ana@example.com")).getByText("Acceso retirado")).toBeInTheDocument());
    expect(screen.queryByRole("button", { name: "Retirar acceso de ana@example.com" })).not.toBeInTheDocument();
  });

  it("keeps focus inside the table after revoking (not lost to the body)", async () => {
    const { user } = await loaded();
    await user.click(revokeButton("ana@example.com"));
    await user.click(screen.getByRole("button", { name: "Confirmar retiro de ana@example.com" }));
    await screen.findByText("Acceso retirado a ana@example.com.");
    expect(document.body).not.toHaveFocus();
  });

  it("409 last_partner: the server message in an alert that receives focus, access not marked as retired", async () => {
    const revoker = jest.fn().mockRejectedValue(new ApiError(409, "last_partner", "No se puede retirar al último socio."));
    const { user, fetcher } = await loaded(setup({ revoker }));
    await user.click(revokeButton("socia@example.com"));
    await user.click(screen.getByRole("button", { name: "Confirmar retiro de socia@example.com" }));
    const alert = (await screen.findByText("No se puede retirar al último socio.")).closest("[role='alert']");
    expect(alert).not.toBeNull();
    expect(alert).toHaveFocus();
    expect(screen.queryByText(/^Acceso retirado a /)).not.toBeInTheDocument();
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(revokeButton("socia@example.com")).toBeInTheDocument();
  });

  it("403 no_authority: the server message in an alert", async () => {
    const revoker = jest.fn().mockRejectedValue(new ApiError(403, "no_authority", "Solo un socio puede retirar a esa persona."));
    const { user } = await loaded(setup({ revoker }));
    await user.click(revokeButton("socia@example.com"));
    await user.click(screen.getByRole("button", { name: "Confirmar retiro de socia@example.com" }));
    expect((await screen.findByText("Solo un socio puede retirar a esa persona.")).closest("[role='alert']")).not.toBeNull();
  });

  it("other failures show a generic Spanish alert", async () => {
    const revoker = jest.fn().mockRejectedValue(new Error("boom"));
    const { user } = await loaded(setup({ revoker }));
    await user.click(revokeButton("ana@example.com"));
    await user.click(screen.getByRole("button", { name: "Confirmar retiro de ana@example.com" }));
    expect(await screen.findByText(UNEXPECTED)).toBeInTheDocument();
  });
});

describe("TeamEditor accessibility", () => {
  it("has no axe violations: loaded, with field errors, with a confirmation open and empty", async () => {
    const { user, container } = await loaded();
    expect(await axe(container)).toHaveNoViolations();
    await fillInvitation(user, "ana", "architect");
    await user.click(inviteButton());
    await screen.findByText(EMAIL_MESSAGE);
    expect(await axe(container)).toHaveNoViolations();
    await user.click(revokeButton("ana@example.com"));
    expect(await axe(container)).toHaveNoViolations();
  });

  it("has no axe violations in the empty and error states", async () => {
    const empty = setup({ fetcher: jest.fn().mockResolvedValue([]) });
    await screen.findByText("Todavía no hay personas en el equipo.");
    expect(await axe(empty.container)).toHaveNoViolations();
    empty.unmount();
    const failing = setup({ fetcher: jest.fn().mockRejectedValue(new ApiError(403, "no_authority", "Solo los socios y directores pueden ver el equipo.")) });
    await screen.findByRole("alert");
    expect(await axe(failing.container)).toHaveNoViolations();
  });
});

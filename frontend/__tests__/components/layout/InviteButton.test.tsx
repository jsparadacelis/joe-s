/**
 * RGB-53b · contract for `@/components/layout/InviteButton` (client component, named export):
 *   props (optional, real defaults): inviter(invitation: {email, role, qualifications}): Promise<Member>,
 *     clipboard: { writeText(text: string): Promise<void> }
 *   Button «Invitar a alguien» opens a modal dialog (role dialog, aria-modal, named «Invitar a alguien») with
 *   «Correo electrónico», «Rol» (preselected «Arquitecto»), <details> «Más opciones» with qualification checkboxes,
 *   «Invitar» (submit) and «Cancelar». Success step (role status): «Invitación creada para {email}.», a read-only
 *   textbox «Mensaje para copiar», «Copiar mensaje», «Invitar a otra persona», «Cerrar».
 */
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { axe } from "jest-axe";
import { InviteButton } from "@/components/layout/InviteButton";
import { ApiError } from "@/lib/api";
import type { Member } from "@/lib/members";

const CREATED: Member = { id: "m-9", email: "nuevo@example.com", role: "architect", qualifications: [], status: "invited" };
const EMAIL_MESSAGE = "Escribe un correo electrónico válido.";

function setup(overrides: { inviter?: jest.Mock; clipboard?: { writeText: jest.Mock } } = {}) {
  const inviter = overrides.inviter ?? jest.fn().mockResolvedValue(CREATED);
  const clipboard = overrides.clipboard ?? { writeText: jest.fn().mockResolvedValue(undefined) };
  const user = userEvent.setup();
  const view = render(<InviteButton inviter={inviter} clipboard={clipboard} />);
  return { inviter, clipboard, user, ...view };
}

const trigger = () => screen.getByRole("button", { name: "Invitar a alguien" });
const dialog = () => screen.getByRole("dialog", { name: "Invitar a alguien" });
const emailField = () => within(dialog()).getByLabelText("Correo electrónico") as HTMLInputElement;
const roleField = () => within(dialog()).getByLabelText("Rol") as HTMLSelectElement;
const submit = () => within(dialog()).getByRole("button", { name: "Invitar" });

async function open(rest = setup()) {
  await rest.user.click(trigger());
  return rest;
}
async function sendInvitation(rest: ReturnType<typeof setup>, email = "nuevo@example.com") {
  await rest.user.type(emailField(), email);
  await rest.user.click(submit());
}

describe("InviteButton dialog", () => {
  it("renders the button and no dialog until it is clicked", () => {
    setup();
    expect(trigger()).toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("opens a modal dialog labelled by its title, with focus on the email", async () => {
    await open();
    expect(dialog()).toHaveAttribute("aria-modal", "true");
    expect(dialog()).toHaveAccessibleName("Invitar a alguien");
    expect(emailField()).toHaveFocus();
  });

  it("closes with Escape and returns the focus to the button", async () => {
    const { user } = await open();
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(trigger()).toHaveFocus();
  });

  it("closes with Cancelar and returns the focus to the button", async () => {
    const { user } = await open();
    await user.click(within(dialog()).getByRole("button", { name: "Cancelar" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(trigger()).toHaveFocus();
  });

  it("keeps the focus trapped inside while tabbing forwards and backwards", async () => {
    const { user } = await open();
    for (let i = 0; i < 12; i += 1) {
      await user.tab();
      expect(dialog()).toContainElement(document.activeElement as HTMLElement);
    }
    for (let i = 0; i < 12; i += 1) {
      await user.tab({ shift: true });
      expect(dialog()).toContainElement(document.activeElement as HTMLElement);
    }
  });

  it("starts empty with the role «Arquitecto» preselected", async () => {
    await open();
    expect(emailField()).toHaveValue("");
    expect(roleField()).toHaveValue("architect");
    expect(within(roleField()).getByRole("option", { name: "Arquitecto" })).toBeInTheDocument();
    expect(within(roleField()).getAllByRole("option")).toHaveLength(7);
  });

  it("hides the qualifications under «Más opciones» and lists the three of them", async () => {
    const { user } = await open();
    const summary = within(dialog()).getByText("Más opciones");
    expect(summary.closest("details")).not.toHaveAttribute("open");
    await user.click(summary);
    for (const name of ["Firmante habilitado", "Dirección facultativa", "Sponsor"]) {
      expect(within(dialog()).getByRole("checkbox", { name })).not.toBeChecked();
    }
  });
});

describe("InviteButton validation and submit", () => {
  it.each(["", "sin-arroba", "a@b", "a b@example.com"])("rejects the email %p without calling the inviter", async (email) => {
    const rest = await open();
    if (email !== "") await rest.user.type(emailField(), email);
    await rest.user.click(submit());
    expect(await screen.findByText(EMAIL_MESSAGE)).toBeInTheDocument();
    expect(rest.inviter).not.toHaveBeenCalled();
    expect(emailField()).toHaveAttribute("aria-invalid", "true");
  });

  it("sends the email, the default role and no qualifications", async () => {
    const rest = await open();
    await sendInvitation(rest, "  nuevo@example.com ");
    await waitFor(() => expect(rest.inviter).toHaveBeenCalledTimes(1));
    expect(rest.inviter).toHaveBeenCalledWith({ email: "nuevo@example.com", role: "architect", qualifications: [] });
  });

  it("sends the chosen role and qualifications", async () => {
    const rest = await open();
    await rest.user.selectOptions(roleField(), "director");
    await rest.user.click(within(dialog()).getByText("Más opciones"));
    await rest.user.click(within(dialog()).getByRole("checkbox", { name: "Sponsor" }));
    await rest.user.click(within(dialog()).getByRole("checkbox", { name: "Firmante habilitado" }));
    await sendInvitation(rest);
    await waitFor(() => expect(rest.inviter).toHaveBeenCalledTimes(1));
    const sent = rest.inviter.mock.calls[0][0];
    expect(sent.role).toBe("director");
    expect([...sent.qualifications].sort()).toEqual(["licensed_signatory", "sponsor"]);
  });

  it("ignores a second submit while the first is pending", async () => {
    let resolve: (m: Member) => void = () => undefined;
    const inviter = jest.fn().mockReturnValue(new Promise<Member>((r) => (resolve = r)));
    const rest = await open(setup({ inviter }));
    await rest.user.type(emailField(), "nuevo@example.com");
    await rest.user.click(submit());
    await rest.user.click(submit());
    await rest.user.keyboard("{Enter}");
    expect(inviter).toHaveBeenCalledTimes(1);
    resolve(CREATED);
    expect(await screen.findByRole("status")).toBeInTheDocument();
  });

  it("422 invalid_email: the server message next to the email, dialog and draft kept", async () => {
    const inviter = jest.fn().mockRejectedValue(new ApiError(422, "invalid_email", "El correo no es válido."));
    const rest = await open(setup({ inviter }));
    await sendInvitation(rest, "raro@example.com");
    expect(await screen.findByText("El correo no es válido.")).toBeInTheDocument();
    expect(emailField()).toHaveAttribute("aria-invalid", "true");
    expect(emailField()).toHaveValue("raro@example.com");
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("409 member_already_exists: the server message next to the email", async () => {
    const inviter = jest.fn().mockRejectedValue(new ApiError(409, "member_already_exists", "Esa persona ya forma parte del equipo."));
    const rest = await open(setup({ inviter }));
    await sendInvitation(rest, "ana@example.com");
    expect(await screen.findByText("Esa persona ya forma parte del equipo.")).toBeInTheDocument();
    expect(emailField()).toHaveAttribute("aria-invalid", "true");
  });

  it("403: the server message in an alert inside the dialog, not tied to the email", async () => {
    const inviter = jest.fn().mockRejectedValue(new ApiError(403, "no_authority", "Solo los socios y directores pueden invitar."));
    const rest = await open(setup({ inviter }));
    await sendInvitation(rest);
    const alert = await within(dialog()).findByRole("alert");
    expect(alert).toHaveTextContent("Solo los socios y directores pueden invitar.");
    expect(emailField()).not.toHaveAttribute("aria-invalid", "true");
    expect(emailField()).toHaveValue("nuevo@example.com");
  });
});

describe("InviteButton success step", () => {
  const MESSAGE = () => `Hola, te he invitado a RGB Proyectos. Entra con Google con este correo (nuevo@example.com): ${window.location.origin}`;

  async function succeed(rest = setup()) {
    await open(rest);
    await sendInvitation(rest);
    await screen.findByRole("status");
    return rest;
  }

  it("confirms the invitation and shows the copyable message with email and origin", async () => {
    await succeed();
    expect(screen.getByRole("status")).toHaveTextContent("Invitación creada para nuevo@example.com.");
    const box = within(dialog()).getByRole("textbox", { name: "Mensaje para copiar" }) as HTMLTextAreaElement | HTMLInputElement;
    expect(box).toHaveAttribute("readonly");
    expect(box.value).toBe(MESSAGE());
    expect(within(dialog()).getByText("La plataforma no envía el aviso: mándale este mensaje tú.")).toBeInTheDocument();
    expect(within(dialog()).queryByLabelText("Correo electrónico")).not.toBeInTheDocument();
  });

  it("copies the message and confirms it", async () => {
    const rest = await succeed();
    await rest.user.click(within(dialog()).getByRole("button", { name: "Copiar mensaje" }));
    expect(rest.clipboard.writeText).toHaveBeenCalledWith(MESSAGE());
    expect(await within(dialog()).findByText("Mensaje copiado")).toBeInTheDocument();
  });

  it("tells the person to copy by hand when the clipboard fails", async () => {
    const clipboard = { writeText: jest.fn().mockRejectedValue(new Error("denied")) };
    const rest = await succeed(setup({ clipboard }));
    await rest.user.click(within(dialog()).getByRole("button", { name: "Copiar mensaje" }));
    expect(await within(dialog()).findByText("No se pudo copiar. Selecciona el texto y cópialo.")).toBeInTheDocument();
    expect(within(dialog()).queryByText("Mensaje copiado")).not.toBeInTheDocument();
    expect(within(dialog()).getByRole("textbox", { name: "Mensaje para copiar" })).toBeInTheDocument();
  });

  it("«Invitar a otra persona» goes back to an empty form with the role «Arquitecto»", async () => {
    const rest = await succeed();
    await rest.user.click(within(dialog()).getByRole("button", { name: "Invitar a otra persona" }));
    expect(emailField()).toHaveValue("");
    expect(roleField()).toHaveValue("architect");
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("«Invitar a otra persona» resets a role and qualifications chosen before", async () => {
    const rest = await open();
    await rest.user.selectOptions(roleField(), "director");
    await rest.user.click(within(dialog()).getByText("Más opciones"));
    await rest.user.click(within(dialog()).getByRole("checkbox", { name: "Sponsor" }));
    await sendInvitation(rest);
    await screen.findByRole("status");
    await rest.user.click(within(dialog()).getByRole("button", { name: "Invitar a otra persona" }));
    expect(roleField()).toHaveValue("architect");
    expect(within(dialog()).getByRole("checkbox", { name: "Sponsor", hidden: true })).not.toBeChecked();
  });

  it("«Cerrar» closes the dialog and returns the focus to the button", async () => {
    const rest = await succeed();
    await rest.user.click(within(dialog()).getByRole("button", { name: "Cerrar" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(trigger()).toHaveFocus();
  });
});

describe("InviteButton accessibility", () => {
  it("has no violations closed, open, with errors and on the success step", async () => {
    const inviter = jest.fn().mockRejectedValueOnce(new ApiError(422, "invalid_email", "El correo no es válido.")).mockResolvedValue(CREATED);
    const rest = setup({ inviter });
    expect(await axe(rest.container)).toHaveNoViolations();
    await rest.user.click(trigger());
    expect(await axe(document.body)).toHaveNoViolations();
    await rest.user.type(emailField(), "raro@example.com");
    await rest.user.click(submit());
    await screen.findByText("El correo no es válido.");
    expect(await axe(document.body)).toHaveNoViolations();
    await rest.user.click(submit());
    await screen.findByRole("status");
    expect(await axe(document.body)).toHaveNoViolations();
  });
});

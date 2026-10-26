/**
 * RGB-2b · contract for `@/components/auth/SessionBadge` (client component, shown in the header):
 *   <SessionBadge client={AuthClient} email={string} role={string | null} onSignedOut={() => void} />
 *   - Shows the email and roleLabel(role) as text.
 *   - Button "Cerrar sesión" -> client.auth.signOut(); on success (no error) onSignedOut() once.
 *   - While signing out: button disabled + aria-busy.
 *   - If signOut fails: role="alert" "No se pudo cerrar la sesión. Inténtalo de nuevo.", button enabled, onSignedOut not called.
 */
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { axe } from "jest-axe";
import { SessionBadge } from "@/components/auth/SessionBadge";
import { createFakeAuthClient } from "../../helpers/fake-auth-client";

function setup(role: string | null = "director") {
  const client = createFakeAuthClient();
  const onSignedOut = jest.fn();
  const view = render(<SessionBadge client={client} email="ana@example.com" role={role} onSignedOut={onSignedOut} />);
  return { client, onSignedOut, ...view };
}

describe("SessionBadge", () => {
  it("shows the email and the role in Spanish", () => {
    setup("project_director");
    expect(screen.getByText("ana@example.com")).toBeInTheDocument();
    expect(screen.getByText("Director de proyecto")).toBeInTheDocument();
  });

  it("shows a neutral label when the role is not known yet", () => {
    setup(null);
    expect(screen.getByText("Sin rol")).toBeInTheDocument();
  });

  it("signs out and reports it", async () => {
    const { client, onSignedOut } = setup();
    await userEvent.click(screen.getByRole("button", { name: "Cerrar sesión" }));
    await waitFor(() => expect(onSignedOut).toHaveBeenCalledTimes(1));
    expect(client.auth.signOut).toHaveBeenCalledTimes(1);
  });

  it("is reachable and usable with the keyboard", async () => {
    const { client } = setup();
    await userEvent.tab();
    expect(screen.getByRole("button", { name: "Cerrar sesión" })).toHaveFocus();
    await userEvent.keyboard("{Enter}");
    expect(client.auth.signOut).toHaveBeenCalledTimes(1);
  });

  it("disables the button while signing out", async () => {
    const client = createFakeAuthClient();
    client.auth.signOut.mockReturnValue(new Promise(() => {}));
    render(<SessionBadge client={client} email="ana@example.com" role="partner" onSignedOut={jest.fn()} />);
    await userEvent.click(screen.getByRole("button", { name: "Cerrar sesión" }));
    const button = screen.getByRole("button", { name: "Cerrar sesión" });
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute("aria-busy", "true");
  });

  it("shows an alert and stays signed in when signOut fails", async () => {
    const client = createFakeAuthClient();
    client.auth.signOut.mockResolvedValue({ error: { message: "boom" } });
    const onSignedOut = jest.fn();
    render(<SessionBadge client={client} email="ana@example.com" role="partner" onSignedOut={onSignedOut} />);
    await userEvent.click(screen.getByRole("button", { name: "Cerrar sesión" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("No se pudo cerrar la sesión. Inténtalo de nuevo.");
    expect(screen.getByRole("button", { name: "Cerrar sesión" })).toBeEnabled();
    expect(onSignedOut).not.toHaveBeenCalled();
  });

  it("has no accessibility violations", async () => {
    const { container } = setup();
    expect(await axe(container)).toHaveNoViolations();
  });
});

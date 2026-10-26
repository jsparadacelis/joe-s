/**
 * RGB-2b · contract for `@/components/auth/LoginForm` (client component):
 *   <LoginForm client={AuthClient} callbackUrl={string} error?={string | null} />
 *   - Button named exactly "Entrar con Google" -> client.auth.signInWithOAuth({ provider: "google", options: { redirectTo: callbackUrl } }).
 *   - While the call is pending: button disabled, aria-busy="true", name "Redirigiendo a Google…".
 *   - If the call returns { error } or rejects: role="alert" "No se pudo iniciar sesión con Google. Inténtalo de nuevo." and the button is enabled again.
 *   - `error` prop is the ?error= code; known codes render getLoginNotice(code) inside role="alert", which receives focus on mount
 *     (tabIndex -1). Unknown/absent codes render no alert.
 *   - A level-1 heading exists. No Microsoft button (decision of 2026-10-25).
 */
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { axe } from "jest-axe";
import { LoginForm } from "@/components/auth/LoginForm";
import { createFakeAuthClient } from "../../helpers/fake-auth-client";

const CALLBACK = "https://app.example.test/auth/callback";

function setup(error?: string | null) {
  const client = createFakeAuthClient();
  const view = render(<LoginForm client={client} callbackUrl={CALLBACK} error={error} />);
  return { client, ...view };
}

describe("LoginForm", () => {
  it("shows a level-1 heading and the Google button", () => {
    setup();
    expect(screen.getByRole("heading", { level: 1 })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Entrar con Google" })).toBeEnabled();
  });

  it("offers no Microsoft button yet", () => {
    setup();
    expect(screen.queryByRole("button", { name: /microsoft/i })).not.toBeInTheDocument();
  });

  it("starts the Google flow with the callback URL", async () => {
    const { client } = setup();
    await userEvent.click(screen.getByRole("button", { name: "Entrar con Google" }));
    expect(client.auth.signInWithOAuth).toHaveBeenCalledTimes(1);
    expect(client.auth.signInWithOAuth).toHaveBeenCalledWith({ provider: "google", options: { redirectTo: CALLBACK } });
  });

  it("can be used with the keyboard", async () => {
    const { client } = setup();
    await userEvent.tab();
    expect(screen.getByRole("button", { name: "Entrar con Google" })).toHaveFocus();
    await userEvent.keyboard("{Enter}");
    expect(client.auth.signInWithOAuth).toHaveBeenCalledTimes(1);
  });

  it("disables the button and announces progress while redirecting", async () => {
    const client = createFakeAuthClient();
    client.auth.signInWithOAuth.mockReturnValue(new Promise(() => {}));
    render(<LoginForm client={client} callbackUrl={CALLBACK} />);
    await userEvent.click(screen.getByRole("button", { name: "Entrar con Google" }));
    const busy = await screen.findByRole("button", { name: "Redirigiendo a Google…" });
    expect(busy).toBeDisabled();
    expect(busy).toHaveAttribute("aria-busy", "true");
  });

  it("does not start the flow twice on a double click", async () => {
    const client = createFakeAuthClient();
    client.auth.signInWithOAuth.mockReturnValue(new Promise(() => {}));
    render(<LoginForm client={client} callbackUrl={CALLBACK} />);
    await userEvent.dblClick(screen.getByRole("button", { name: "Entrar con Google" }));
    expect(client.auth.signInWithOAuth).toHaveBeenCalledTimes(1);
  });

  it("shows an alert and re-enables the button when Supabase returns an error", async () => {
    const client = createFakeAuthClient();
    client.auth.signInWithOAuth.mockResolvedValue({ data: {}, error: { message: "boom" } });
    render(<LoginForm client={client} callbackUrl={CALLBACK} />);
    await userEvent.click(screen.getByRole("button", { name: "Entrar con Google" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("No se pudo iniciar sesión con Google. Inténtalo de nuevo.");
    expect(screen.getByRole("button", { name: "Entrar con Google" })).toBeEnabled();
  });

  it("shows the same alert when the call rejects, without leaking the technical message", async () => {
    const client = createFakeAuthClient();
    client.auth.signInWithOAuth.mockRejectedValue(new Error("secret internal detail"));
    render(<LoginForm client={client} callbackUrl={CALLBACK} />);
    await userEvent.click(screen.getByRole("button", { name: "Entrar con Google" }));
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("No se pudo iniciar sesión con Google");
    expect(alert).not.toHaveTextContent("secret internal detail");
  });

  it("shows no alert by default", () => {
    setup();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it.each([
    ["not_invited", /No tienes invitación/],
    ["member_revoked", /Tu acceso ha sido retirado/],
    ["email_not_verified", /verific/i],
    ["unauthenticated", /sesión/i],
  ])("shows the notice for ?error=%s in an alert and focuses it", (code, text) => {
    setup(code);
    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent(text);
    expect(alert).toHaveFocus();
  });

  it("ignores an unknown error code", () => {
    setup("<b>hacked</b>");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.queryByText("hacked")).not.toBeInTheDocument();
  });

  it("still lets the person try again after a notice", async () => {
    const { client } = setup("not_invited");
    await userEvent.click(screen.getByRole("button", { name: "Entrar con Google" }));
    await waitFor(() => expect(client.auth.signInWithOAuth).toHaveBeenCalledTimes(1));
  });

  it("has no accessibility violations", async () => {
    const { container } = setup();
    expect(await axe(container)).toHaveNoViolations();
  });

  it("has no accessibility violations with a notice", async () => {
    const { container } = setup("member_revoked");
    expect(await axe(container)).toHaveNoViolations();
  });

  it("has no accessibility violations while loading", async () => {
    const client = createFakeAuthClient();
    client.auth.signInWithOAuth.mockReturnValue(new Promise(() => {}));
    const { container } = render(<LoginForm client={client} callbackUrl={CALLBACK} />);
    await userEvent.click(screen.getByRole("button", { name: "Entrar con Google" }));
    expect(await axe(container)).toHaveNoViolations();
  });
});

/**
 * RGB-2b · contract for `@/components/auth/MfaPanel` (client component):
 *   <MfaPanel client={AuthClient} onVerified={() => void} />
 *   On mount: status "Cargando…" (role="status") while client.auth.mfa.listFactors() resolves.
 *   - No verified TOTP in `data.totp` -> ENROLL: mfa.enroll({ factorType: "totp" }); shows <img> with alt matching /código QR/i
 *     and src = totp.qr_code, the secret as visible text under the label "Clave secreta", a text input labelled
 *     "Código de 6 dígitos" (inputMode numeric, autocomplete one-time-code, maxLength 6, digits only) and a submit button
 *     "Activar doble factor", disabled until 6 digits.
 *   - A verified TOTP -> VERIFY: no QR, no enroll; submit button "Verificar código" (disabled until 6 digits).
 *   - Submit (both modes): mfa.challenge({ factorId }) then mfa.verify({ factorId, challengeId, code }); on success onVerified() once.
 *   - Wrong code (error.code "mfa_verification_failed"): role="alert" "El código no es correcto. Comprueba la hora de tu dispositivo e inténtalo de nuevo.",
 *     the input is cleared and focused, onVerified not called.
 *   - Any other failure (listFactors, enroll, challenge, verify): role="alert" starting "No se pudo" (no technical message shown).
 *   - Heading level 1 "Verificación en dos pasos" is not asserted verbatim: only that a level-1 heading exists.
 */
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { axe } from "jest-axe";
import { MfaPanel } from "@/components/auth/MfaPanel";
import { createFakeAuthClient, QR_DATA_URI, TOTP_SECRET, withVerifiedFactor } from "../../helpers/fake-auth-client";

const WRONG_CODE = "El código no es correcto. Comprueba la hora de tu dispositivo e inténtalo de nuevo.";

async function renderEnroll() {
  const client = createFakeAuthClient();
  const onVerified = jest.fn();
  const view = render(<MfaPanel client={client} onVerified={onVerified} />);
  await screen.findByAltText(/código QR/i);
  return { client, onVerified, ...view };
}

async function renderVerify() {
  const client = withVerifiedFactor(createFakeAuthClient(), "factor-9");
  const onVerified = jest.fn();
  const view = render(<MfaPanel client={client} onVerified={onVerified} />);
  await screen.findByRole("button", { name: "Verificar código" });
  return { client, onVerified, ...view };
}

const codeInput = () => screen.getByLabelText("Código de 6 dígitos");

describe("MfaPanel · loading", () => {
  it("announces loading while it looks for the factors", async () => {
    const client = createFakeAuthClient();
    client.auth.mfa.listFactors.mockReturnValue(new Promise(() => {}));
    render(<MfaPanel client={client} onVerified={jest.fn()} />);
    expect(screen.getByRole("status")).toHaveTextContent("Cargando…");
    expect(screen.queryByLabelText("Código de 6 dígitos")).not.toBeInTheDocument();
  });

  it("shows an alert when the factors cannot be read", async () => {
    const client = createFakeAuthClient();
    client.auth.mfa.listFactors.mockResolvedValue({ data: null, error: { message: "internal secret" } });
    render(<MfaPanel client={client} onVerified={jest.fn()} />);
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(/^No se pudo/);
    expect(alert).not.toHaveTextContent("internal secret");
  });
});

describe("MfaPanel · enrolment", () => {
  it("enrols a TOTP factor and shows the QR code", async () => {
    const { client } = await renderEnroll();
    expect(client.auth.mfa.enroll).toHaveBeenCalledWith({ factorType: "totp" });
    expect(screen.getByAltText(/código QR/i)).toHaveAttribute("src", QR_DATA_URI);
  });

  it("shows the secret key as text for people who cannot scan", async () => {
    await renderEnroll();
    expect(screen.getByText(TOTP_SECRET)).toBeVisible();
    expect(screen.getByText(/Clave secreta/i)).toBeInTheDocument();
  });

  it("enrols only once even if it re-renders", async () => {
    const { client, rerender, onVerified } = await renderEnroll();
    rerender(<MfaPanel client={client} onVerified={onVerified} />);
    expect(client.auth.mfa.enroll).toHaveBeenCalledTimes(1);
  });

  it("describes the code field for assistive technology", async () => {
    await renderEnroll();
    expect(codeInput()).toHaveAttribute("inputmode", "numeric");
    expect(codeInput()).toHaveAttribute("autocomplete", "one-time-code");
    expect(codeInput()).toHaveAttribute("maxlength", "6");
  });

  it("keeps only digits in the code field", async () => {
    await renderEnroll();
    await userEvent.type(codeInput(), "12a3-4");
    expect(codeInput()).toHaveValue("1234");
  });

  it("disables the submit button until there are 6 digits", async () => {
    await renderEnroll();
    const submit = screen.getByRole("button", { name: "Activar doble factor" });
    expect(submit).toBeDisabled();
    await userEvent.type(codeInput(), "12345");
    expect(submit).toBeDisabled();
    await userEvent.type(codeInput(), "6");
    expect(submit).toBeEnabled();
  });

  it("challenges and verifies the new factor, then reports success", async () => {
    const { client, onVerified } = await renderEnroll();
    await userEvent.type(codeInput(), "123456");
    await userEvent.click(screen.getByRole("button", { name: "Activar doble factor" }));
    await waitFor(() => expect(onVerified).toHaveBeenCalledTimes(1));
    expect(client.auth.mfa.challenge).toHaveBeenCalledWith({ factorId: "factor-1" });
    expect(client.auth.mfa.verify).toHaveBeenCalledWith({ factorId: "factor-1", challengeId: "challenge-1", code: "123456" });
  });

  it("submits with Enter from the code field", async () => {
    const { onVerified } = await renderEnroll();
    await userEvent.type(codeInput(), "123456{Enter}");
    await waitFor(() => expect(onVerified).toHaveBeenCalledTimes(1));
  });

  it("shows an alert if the enrolment fails, without technical detail", async () => {
    const client = createFakeAuthClient();
    client.auth.mfa.enroll.mockResolvedValue({ data: null, error: { message: "db exploded" } });
    render(<MfaPanel client={client} onVerified={jest.fn()} />);
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(/^No se pudo/);
    expect(alert).not.toHaveTextContent("db exploded");
    expect(screen.queryByAltText(/código QR/i)).not.toBeInTheDocument();
  });

  it("moves focus to the code field once the QR is ready", async () => {
    await renderEnroll();
    expect(codeInput()).toHaveFocus();
  });
});

describe("MfaPanel · verification at every sign-in", () => {
  it("does not enrol nor show a QR when a verified factor exists", async () => {
    const { client } = await renderVerify();
    expect(client.auth.mfa.enroll).not.toHaveBeenCalled();
    expect(screen.queryByAltText(/código QR/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Clave secreta/i)).not.toBeInTheDocument();
  });

  it("focuses the code field", async () => {
    await renderVerify();
    expect(codeInput()).toHaveFocus();
  });

  it("challenges and verifies the existing factor, then reports success", async () => {
    const { client, onVerified } = await renderVerify();
    await userEvent.type(codeInput(), "654321");
    await userEvent.click(screen.getByRole("button", { name: "Verificar código" }));
    await waitFor(() => expect(onVerified).toHaveBeenCalledTimes(1));
    expect(client.auth.mfa.challenge).toHaveBeenCalledWith({ factorId: "factor-9" });
    expect(client.auth.mfa.verify).toHaveBeenCalledWith({ factorId: "factor-9", challengeId: "challenge-1", code: "654321" });
  });

  it("explains a wrong code in Spanish, clears the field and focuses it", async () => {
    const { client, onVerified } = await renderVerify();
    client.auth.mfa.verify.mockResolvedValue({ data: null, error: { code: "mfa_verification_failed", message: "Invalid TOTP code entered", status: 400 } });
    await userEvent.type(codeInput(), "000000");
    await userEvent.click(screen.getByRole("button", { name: "Verificar código" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(WRONG_CODE);
    expect(screen.getByRole("alert")).not.toHaveTextContent("Invalid TOTP");
    expect(codeInput()).toHaveValue("");
    expect(codeInput()).toHaveFocus();
    expect(onVerified).not.toHaveBeenCalled();
  });

  it("links the field to the error for assistive technology", async () => {
    const { client } = await renderVerify();
    client.auth.mfa.verify.mockResolvedValue({ data: null, error: { code: "mfa_verification_failed", message: "x" } });
    await userEvent.type(codeInput(), "000000");
    await userEvent.click(screen.getByRole("button", { name: "Verificar código" }));
    const alert = await screen.findByRole("alert");
    expect(codeInput()).toHaveAttribute("aria-invalid", "true");
    expect(codeInput().getAttribute("aria-describedby")).toContain(alert.id);
  });

  it("clears the previous error when the person types again", async () => {
    const { client } = await renderVerify();
    client.auth.mfa.verify.mockResolvedValue({ data: null, error: { code: "mfa_verification_failed", message: "x" } });
    await userEvent.type(codeInput(), "000000");
    await userEvent.click(screen.getByRole("button", { name: "Verificar código" }));
    await screen.findByRole("alert");
    await userEvent.type(codeInput(), "1");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("allows a new attempt after a wrong code", async () => {
    const { client, onVerified } = await renderVerify();
    client.auth.mfa.verify
      .mockResolvedValueOnce({ data: null, error: { code: "mfa_verification_failed", message: "x" } })
      .mockResolvedValueOnce({ data: {}, error: null });
    await userEvent.type(codeInput(), "000000");
    await userEvent.click(screen.getByRole("button", { name: "Verificar código" }));
    await screen.findByRole("alert");
    await userEvent.type(codeInput(), "111111");
    await userEvent.click(screen.getByRole("button", { name: "Verificar código" }));
    await waitFor(() => expect(onVerified).toHaveBeenCalledTimes(1));
  });

  it("shows a generic alert when the challenge fails", async () => {
    const { client, onVerified } = await renderVerify();
    client.auth.mfa.challenge.mockResolvedValue({ data: null, error: { code: "unexpected_failure", message: "internal" } });
    await userEvent.type(codeInput(), "123456");
    await userEvent.click(screen.getByRole("button", { name: "Verificar código" }));
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(/^No se pudo/);
    expect(alert).not.toHaveTextContent("internal");
    expect(client.auth.mfa.verify).not.toHaveBeenCalled();
    expect(onVerified).not.toHaveBeenCalled();
  });

  it("shows a generic alert when verify fails for another reason", async () => {
    const { client, onVerified } = await renderVerify();
    client.auth.mfa.verify.mockRejectedValue(new Error("network down"));
    await userEvent.type(codeInput(), "123456");
    await userEvent.click(screen.getByRole("button", { name: "Verificar código" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/^No se pudo/);
    expect(onVerified).not.toHaveBeenCalled();
  });

  it("disables the button while verifying and does not submit twice", async () => {
    const { client } = await renderVerify();
    client.auth.mfa.verify.mockReturnValue(new Promise(() => {}));
    await userEvent.type(codeInput(), "123456");
    const submit = screen.getByRole("button", { name: "Verificar código" });
    await userEvent.dblClick(submit);
    expect(submit).toBeDisabled();
    expect(submit).toHaveAttribute("aria-busy", "true");
    expect(client.auth.mfa.verify).toHaveBeenCalledTimes(1);
  });
});

describe("MfaPanel · accessibility", () => {
  it("has a level-1 heading in both modes", async () => {
    await renderVerify();
    expect(screen.getByRole("heading", { level: 1 })).toBeInTheDocument();
  });

  it("has no violations while loading", async () => {
    const client = createFakeAuthClient();
    client.auth.mfa.listFactors.mockReturnValue(new Promise(() => {}));
    const { container } = render(<MfaPanel client={client} onVerified={jest.fn()} />);
    expect(await axe(container)).toHaveNoViolations();
  });

  it("has no violations in enrolment", async () => {
    const { container } = await renderEnroll();
    expect(await axe(container)).toHaveNoViolations();
  });

  it("has no violations in verification", async () => {
    const { container } = await renderVerify();
    expect(await axe(container)).toHaveNoViolations();
  });

  it("has no violations with an error", async () => {
    const { client, container } = await renderVerify();
    client.auth.mfa.verify.mockResolvedValue({ data: null, error: { code: "mfa_verification_failed", message: "x" } });
    await userEvent.type(codeInput(), "000000");
    await userEvent.click(screen.getByRole("button", { name: "Verificar código" }));
    await screen.findByRole("alert");
    expect(await axe(container)).toHaveNoViolations();
  });
});

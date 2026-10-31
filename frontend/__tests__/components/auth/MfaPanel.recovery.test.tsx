/**
 * RGB-2c · contract for `@/components/auth/MfaPanel` (additions to RGB-2b):
 *   AuthClient.auth.mfa.unenroll(params: { factorId: string }): AuthResult<unknown>
 *   - No verified TOTP but unverified TOTP factors in `data.totp`: unenroll({ factorId }) once per unverified factor,
 *     all BEFORE enroll; the QR shown is the new factor's. If an unenroll fails: no enroll, setup-failed alert.
 *   - A verified TOTP: never unenroll nor enroll (even if unverified ones coexist); goes to verify.
 *   - No factors: only enroll.
 *   - Setup failure (listFactors/enroll/unenroll): alert "No se pudo preparar el doble factor. Recarga la página e inténtalo de nuevo."
 *     followed by "Código de error: <code>" only when the error object has a string `code`.
 *   - challenge/verify failure with code !== "mfa_verification_failed": "No se pudo completar la verificación. Inténtalo de nuevo."
 *     followed by "Código de error: <code>" when there is a code. "mfa_verification_failed" keeps the wrong-code message, no code line.
 *   - A thrown non-object (string, null) or an Error without `code` never produces a "Código de error" line.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { StrictMode } from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { axe } from "jest-axe";
import { MfaPanel } from "@/components/auth/MfaPanel";
import { createFakeAuthClient, QR_DATA_URI, withUnverifiedFactors, withVerifiedFactor } from "../../helpers/fake-auth-client";

const SETUP_FAILED = "No se pudo preparar el doble factor. Recarga la página e inténtalo de nuevo.";
const VERIFY_FAILED = "No se pudo completar la verificación. Inténtalo de nuevo.";
const WRONG_CODE = "El código no es correcto. Comprueba la hora de tu dispositivo e inténtalo de nuevo.";
const NEW_QR = "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' id='fresh'/>";

const codeInput = () => screen.getByLabelText("Código de 6 dígitos");

function freshEnrolment(client: ReturnType<typeof createFakeAuthClient>) {
  client.auth.mfa.enroll.mockResolvedValue({
    data: { id: "factor-new", type: "totp", totp: { qr_code: NEW_QR, secret: "NEWSECRET234567AB", uri: "otpauth://totp/RGB:ana@example.com" } },
    error: null,
  });
}

async function submitCode(name: string) {
  await userEvent.type(codeInput(), "123456");
  await userEvent.click(screen.getByRole("button", { name }));
}

describe("MfaPanel · pending factors are removed before enrolling", () => {
  it("unenrols every unverified factor before enrolling and shows the new QR", async () => {
    const client = withUnverifiedFactors(createFakeAuthClient(), ["stale-1", "stale-2"]);
    freshEnrolment(client);
    render(<MfaPanel client={client} onVerified={jest.fn()} />);
    expect(await screen.findByAltText(/código QR/i)).toHaveAttribute("src", NEW_QR);
    const { unenroll, enroll } = client.auth.mfa;
    expect(unenroll).toHaveBeenCalledTimes(2);
    expect(unenroll).toHaveBeenCalledWith({ factorId: "stale-1" });
    expect(unenroll).toHaveBeenCalledWith({ factorId: "stale-2" });
    expect(enroll).toHaveBeenCalledTimes(1);
    const lastUnenroll = Math.max(...unenroll.mock.invocationCallOrder);
    expect(lastUnenroll).toBeLessThan(enroll.mock.invocationCallOrder[0]);
  });

  it("verifies the freshly enrolled factor, not the stale one", async () => {
    const client = withUnverifiedFactors(createFakeAuthClient(), ["stale-1"]);
    freshEnrolment(client);
    const onVerified = jest.fn();
    render(<MfaPanel client={client} onVerified={onVerified} />);
    await screen.findByAltText(/código QR/i);
    await submitCode("Activar doble factor");
    await waitFor(() => expect(onVerified).toHaveBeenCalledTimes(1));
    expect(client.auth.mfa.challenge).toHaveBeenCalledWith({ factorId: "factor-new" });
    expect(client.auth.mfa.verify).toHaveBeenCalledWith({ factorId: "factor-new", challengeId: "challenge-1", code: "123456" });
  });

  it("does not enrol and shows the setup failure with its code when unenrol fails", async () => {
    const client = withUnverifiedFactors(createFakeAuthClient());
    client.auth.mfa.unenroll.mockResolvedValue({ data: null, error: { code: "mfa_factor_not_found", message: "internal detail" } });
    render(<MfaPanel client={client} onVerified={jest.fn()} />);
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(SETUP_FAILED);
    expect(alert).toHaveTextContent("Código de error: mfa_factor_not_found");
    expect(alert).not.toHaveTextContent("internal detail");
    expect(client.auth.mfa.enroll).not.toHaveBeenCalled();
    expect(screen.queryByAltText(/código QR/i)).not.toBeInTheDocument();
  });

  it("does not enrol when unenrol throws, and invents no code", async () => {
    const client = withUnverifiedFactors(createFakeAuthClient());
    client.auth.mfa.unenroll.mockRejectedValue(new Error("network down"));
    render(<MfaPanel client={client} onVerified={jest.fn()} />);
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(SETUP_FAILED);
    expect(alert).not.toHaveTextContent("Código de error");
    expect(client.auth.mfa.enroll).not.toHaveBeenCalled();
  });

  it("never unenrols nor enrols when a verified factor exists, even alongside unverified ones", async () => {
    const client = withVerifiedFactor(createFakeAuthClient(), "factor-9");
    const verified = { id: "factor-9", factor_type: "totp", status: "verified" };
    const stale = { id: "stale-1", factor_type: "totp", status: "unverified" };
    client.auth.mfa.listFactors.mockResolvedValue({ data: { all: [stale, verified], totp: [stale, verified] }, error: null });
    render(<MfaPanel client={client} onVerified={jest.fn()} />);
    await screen.findByRole("button", { name: "Verificar código" });
    expect(client.auth.mfa.unenroll).not.toHaveBeenCalled();
    expect(client.auth.mfa.enroll).not.toHaveBeenCalled();
    expect(screen.queryByAltText(/código QR/i)).not.toBeInTheDocument();
    await submitCode("Verificar código");
    await waitFor(() => expect(client.auth.mfa.verify).toHaveBeenCalledWith({ factorId: "factor-9", challengeId: "challenge-1", code: "123456" }));
  });

  it("only enrols when there are no factors", async () => {
    const client = createFakeAuthClient();
    render(<MfaPanel client={client} onVerified={jest.fn()} />);
    expect(await screen.findByAltText(/código QR/i)).toHaveAttribute("src", QR_DATA_URI);
    expect(client.auth.mfa.unenroll).not.toHaveBeenCalled();
    expect(client.auth.mfa.enroll).toHaveBeenCalledTimes(1);
  });

  it("does not duplicate calls under Strict Mode", async () => {
    const client = withUnverifiedFactors(createFakeAuthClient(), ["stale-1"]);
    freshEnrolment(client);
    render(
      <StrictMode>
        <MfaPanel client={client} onVerified={jest.fn()} />
      </StrictMode>,
    );
    await screen.findByAltText(/código QR/i);
    expect(client.auth.mfa.listFactors).toHaveBeenCalledTimes(1);
    expect(client.auth.mfa.unenroll).toHaveBeenCalledTimes(1);
    expect(client.auth.mfa.enroll).toHaveBeenCalledTimes(1);
  });
});

describe("MfaPanel · setup failures state their cause", () => {
  it("adds the error code when listFactors fails with one", async () => {
    const client = createFakeAuthClient();
    client.auth.mfa.listFactors.mockResolvedValue({ data: null, error: { code: "session_not_found", message: "x" } });
    render(<MfaPanel client={client} onVerified={jest.fn()} />);
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(SETUP_FAILED);
    expect(alert).toHaveTextContent("Código de error: session_not_found");
  });

  it("adds the error code when enroll fails with one", async () => {
    const client = createFakeAuthClient();
    client.auth.mfa.enroll.mockResolvedValue({ data: null, error: { code: "mfa_factor_name_conflict", message: "x" } });
    render(<MfaPanel client={client} onVerified={jest.fn()} />);
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(SETUP_FAILED);
    expect(alert).toHaveTextContent("Código de error: mfa_factor_name_conflict");
  });

  it("omits the code line when the error has none", async () => {
    const client = createFakeAuthClient();
    client.auth.mfa.enroll.mockResolvedValue({ data: null, error: { message: "db exploded" } });
    render(<MfaPanel client={client} onVerified={jest.fn()} />);
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(SETUP_FAILED);
    expect(alert).not.toHaveTextContent("Código de error");
  });

  it.each([["a string", "boom"], ["null", null], ["an Error without code", new Error("network down")]])(
    "survives listFactors rejecting with %s and invents no code",
    async (_label, thrown) => {
      const client = createFakeAuthClient();
      client.auth.mfa.listFactors.mockRejectedValue(thrown);
      render(<MfaPanel client={client} onVerified={jest.fn()} />);
      const alert = await screen.findByRole("alert");
      expect(alert).toHaveTextContent(SETUP_FAILED);
      expect(alert).not.toHaveTextContent("Código de error");
    },
  );
});

describe("MfaPanel · verification failures state their cause", () => {
  async function renderVerify() {
    const client = withVerifiedFactor(createFakeAuthClient(), "factor-9");
    const onVerified = jest.fn();
    render(<MfaPanel client={client} onVerified={onVerified} />);
    await screen.findByRole("button", { name: "Verificar código" });
    return { client, onVerified };
  }

  it("adds the code when challenge fails", async () => {
    const { client, onVerified } = await renderVerify();
    client.auth.mfa.challenge.mockResolvedValue({ data: null, error: { code: "mfa_challenge_expired", message: "internal" } });
    await submitCode("Verificar código");
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(VERIFY_FAILED);
    expect(alert).toHaveTextContent("Código de error: mfa_challenge_expired");
    expect(alert).not.toHaveTextContent("internal");
    expect(onVerified).not.toHaveBeenCalled();
  });

  it("adds the code when verify fails with a different code", async () => {
    const { client } = await renderVerify();
    client.auth.mfa.verify.mockResolvedValue({ data: null, error: { code: "over_request_rate_limit", message: "x" } });
    await submitCode("Verificar código");
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(VERIFY_FAILED);
    expect(alert).toHaveTextContent("Código de error: over_request_rate_limit");
  });

  it("keeps the wrong-code message and behaviour, without a code line", async () => {
    const { client } = await renderVerify();
    client.auth.mfa.verify.mockResolvedValue({ data: null, error: { code: "mfa_verification_failed", message: "Invalid TOTP" } });
    await submitCode("Verificar código");
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(WRONG_CODE);
    expect(alert).not.toHaveTextContent("Código de error");
    expect(alert).not.toHaveTextContent("mfa_verification_failed");
    expect(codeInput()).toHaveValue("");
    expect(codeInput()).toHaveFocus();
  });

  it("omits the code line when the failure has no code", async () => {
    const { client } = await renderVerify();
    client.auth.mfa.verify.mockResolvedValue({ data: null, error: { message: "x" } });
    await submitCode("Verificar código");
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(VERIFY_FAILED);
    expect(alert).not.toHaveTextContent("Código de error");
  });

  it.each([["a string", "boom"], ["null", null], ["an Error without code", new Error("network down")]])(
    "survives verify rejecting with %s and invents no code",
    async (_label, thrown) => {
      const { client, onVerified } = await renderVerify();
      client.auth.mfa.verify.mockRejectedValue(thrown);
      await submitCode("Verificar código");
      const alert = await screen.findByRole("alert");
      expect(alert).toHaveTextContent(VERIFY_FAILED);
      expect(alert).not.toHaveTextContent("Código de error");
      expect(onVerified).not.toHaveBeenCalled();
    },
  );
});

describe("MfaPanel · accessibility of the new states", () => {
  it("has no violations after recovering from a pending factor", async () => {
    const client = withUnverifiedFactors(createFakeAuthClient());
    freshEnrolment(client);
    const { container } = render(<MfaPanel client={client} onVerified={jest.fn()} />);
    await screen.findByAltText(/código QR/i);
    expect(await axe(container)).toHaveNoViolations();
  });

  it("has no violations on a setup failure with an error code", async () => {
    const client = createFakeAuthClient();
    client.auth.mfa.enroll.mockResolvedValue({ data: null, error: { code: "mfa_factor_name_conflict", message: "x" } });
    const { container } = render(<MfaPanel client={client} onVerified={jest.fn()} />);
    await screen.findByRole("alert");
    expect(await axe(container)).toHaveNoViolations();
  });

  it("has no violations on a verification failure with an error code", async () => {
    const client = withVerifiedFactor(createFakeAuthClient());
    const { container } = render(<MfaPanel client={client} onVerified={jest.fn()} />);
    await screen.findByRole("button", { name: "Verificar código" });
    client.auth.mfa.verify.mockResolvedValue({ data: null, error: { code: "over_request_rate_limit", message: "x" } });
    await submitCode("Verificar código");
    await screen.findByRole("alert");
    expect(await axe(container)).toHaveNoViolations();
  });
});

describe("MfaPanel · QR code stays scannable in every theme", () => {
  // The QR is an SVG with dark modules on a transparent background: it needs a fixed white backdrop.
  it("paints the QR inside a fixed-white container with inner padding", async () => {
    const client = createFakeAuthClient();
    render(<MfaPanel client={client} onVerified={jest.fn()} />);
    const img = await screen.findByAltText("Código QR para configurar la aplicación de autenticación");
    const holder = img.parentElement as HTMLElement;
    expect(holder.className).toMatch(/(^|\s)bg-qr-bg(\s|$)/);
    expect(holder.className).toMatch(/(^|\s)p-\d/);
    expect(holder.className).not.toMatch(/bg-surface/);
    expect(img.className).not.toMatch(/bg-surface/);
  });

  it("keeps the QR size", async () => {
    render(<MfaPanel client={createFakeAuthClient()} onVerified={jest.fn()} />);
    const img = await screen.findByAltText(/código QR/i);
    expect(img).toHaveAttribute("width", "176");
    expect(img).toHaveAttribute("height", "176");
  });

  it("defines the qr-bg token as pure white, independent of the theme", () => {
    const css = readFileSync(join(process.cwd(), "app/globals.css"), "utf8");
    // Exactly one definition, a literal (not var(--surface)), so dark mode cannot change it.
    const matches = css.match(/--color-qr-bg:\s*([^;]+);/g) ?? [];
    expect(matches).toHaveLength(1);
    expect(matches[0]).toMatch(/--color-qr-bg:\s*#(fff|ffffff)\s*;/i);
  });
});

import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { axe } from "jest-axe";
import { OpportunityForm } from "@/components/opportunities/OpportunityForm";
import { ApiError } from "@/lib/api";
import type { Opportunity, OpportunityPayload } from "@/lib/opportunities";

const mockPush = jest.fn();
jest.mock("next/navigation", () => ({ useRouter: () => ({ push: mockPush }) }));
jest.mock("next/link", () => ({
  __esModule: true,
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

const CREATED: Opportunity = {
  code: "PRY-2026-001",
  name: "Test house",
  phase: 0,
  status: "no-plan",
  client: "Test client",
  location: "Test street 1",
  projectType: "industrial",
  owner: "Ana Test",
  estimatedBudget: null,
  deadline: null,
  source: null,
  decisionDate: null,
};

type Submitter = (payload: OpportunityPayload) => Promise<Opportunity>;

function setup(submitter: jest.Mock<ReturnType<Submitter>, Parameters<Submitter>> = jest.fn().mockResolvedValue(CREATED), onCreated?: jest.Mock) {
  const user = userEvent.setup();
  const view = render(<OpportunityForm submitter={submitter} onCreated={onCreated} />);
  return { user, submitter, onCreated, ...view };
}

const field = (name: string) => screen.getByLabelText(name);
const submitButton = () => screen.getByRole("button", { name: /Guardar oportunidad|Guardando…/ });

async function fillRequired(user: ReturnType<typeof userEvent.setup>) {
  await user.type(field("Nombre"), "Test house");
  await user.type(field("Cliente"), "Test client");
  await user.type(field("Localización"), "Test street 1");
  await user.selectOptions(field("Tipología"), "Industrial");
  await user.type(field("Responsable"), "Ana Test");
}

beforeEach(() => mockPush.mockReset());

describe("OpportunityForm · structure", () => {
  it("has a labelled control for each field of the contract", () => {
    setup();
    for (const label of [
      "Nombre", "Cliente", "Localización", "Tipología", "Responsable",
      "Presupuesto estimado (€)", "Plazo", "Fuente", "Fecha de decisión",
    ]) {
      expect(field(label)).toBeInTheDocument();
    }
    expect(field("Tipología").tagName).toBe("SELECT");
    expect(field("Plazo")).toHaveAttribute("type", "date");
    expect(field("Fecha de decisión")).toHaveAttribute("type", "date");
  });

  it("the typology select offers a placeholder and the six typologies with the labels of «Ajustes»", () => {
    setup();
    const options = within(field("Tipología")).getAllByRole("option").map((o) => o.textContent);
    expect(options).toEqual([
      "Selecciona una tipología",
      "Vivienda unifamiliar",
      "Rehabilitación",
      "Plurifamiliar",
      "Dotacional",
      "Industrial",
      "Reforma de interiores",
    ]);
  });

  it("required fields are marked as required; optional ones say «Opcional»", () => {
    setup();
    for (const label of ["Nombre", "Cliente", "Localización", "Tipología", "Responsable"]) {
      expect(field(label)).toBeRequired();
    }
    for (const label of ["Presupuesto estimado (€)", "Plazo", "Fuente", "Fecha de decisión"]) {
      expect(field(label)).not.toBeRequired();
      expect(field(label)).toHaveAccessibleDescription(/Opcional/);
    }
  });

  it("has the submit button and a «Cancelar» link back to the portfolio", () => {
    setup();
    expect(screen.getByRole("button", { name: "Guardar oportunidad" })).toHaveAttribute("type", "submit");
    expect(screen.getByRole("link", { name: "Cancelar" })).toHaveAttribute("href", "/portfolio");
  });

  it("the form is named and does not use native validation bubbles", () => {
    setup();
    const form = screen.getByRole("form", { name: "Nueva oportunidad" });
    expect(form).toHaveAttribute("novalidate");
  });

  it("no accessibility violations when empty", async () => {
    const { container } = setup();
    expect(await axe(container)).toHaveNoViolations();
  });
});

describe("OpportunityForm · client validation", () => {
  it("submitting the empty form shows the five required errors, does not call the API and focuses the first field", async () => {
    const { user, submitter } = setup();
    await user.click(submitButton());
    expect(submitter).not.toHaveBeenCalled();
    for (const [label, name] of [
      ["Nombre", "Nombre"], ["Cliente", "Cliente"], ["Localización", "Localización"], ["Tipología", "Tipología"], ["Responsable", "Responsable"],
    ]) {
      const control = field(label);
      expect(control).toHaveAttribute("aria-invalid", "true");
      expect(control).toHaveAccessibleDescription(`El campo «${name}» es obligatorio.`);
    }
    expect(field("Nombre")).toHaveFocus();
  });

  it("focuses the first invalid field in form order, not the first one in the DOM that is empty", async () => {
    const { user } = setup();
    await user.type(field("Nombre"), "Test house");
    await user.type(field("Cliente"), "Test client");
    await user.click(submitButton());
    expect(field("Localización")).toHaveFocus();
  });

  it("an invalid optional field blocks the submit with the same message as the API", async () => {
    const { user, submitter } = setup();
    await fillRequired(user);
    await user.type(field("Presupuesto estimado (€)"), "abc");
    await user.click(submitButton());
    expect(submitter).not.toHaveBeenCalled();
    expect(field("Presupuesto estimado (€)")).toHaveAccessibleDescription(/El campo «Presupuesto estimado» no es válido: debe ser un número\./);
    expect(field("Presupuesto estimado (€)")).toHaveFocus();
  });

  it("untouched valid fields have no aria-invalid", async () => {
    const { user } = setup();
    await user.click(submitButton());
    expect(field("Fuente")).not.toHaveAttribute("aria-invalid");
    expect(field("Fuente")).toHaveAccessibleDescription("Opcional");
  });

  it("editing a field clears its own error but keeps the others", async () => {
    const { user } = setup();
    await user.click(submitButton());
    await user.type(field("Nombre"), "T");
    expect(field("Nombre")).not.toHaveAttribute("aria-invalid");
    expect(screen.queryByText("El campo «Nombre» es obligatorio.")).not.toBeInTheDocument();
    expect(field("Cliente")).toHaveAttribute("aria-invalid", "true");
  });

  it("errors are drawn with the error token and linked by id", async () => {
    const { user } = setup();
    await user.click(submitButton());
    const message = screen.getByText("El campo «Nombre» es obligatorio.");
    expect(message).toHaveClass("text-bad");
    expect(message.id).toBe(field("Nombre").getAttribute("aria-describedby"));
    expect(field("Nombre")).toHaveClass("border-bad");
  });

  it("no accessibility violations with errors", async () => {
    const { user, container } = setup();
    await user.click(submitButton());
    expect(await axe(container)).toHaveNoViolations();
  });
});

describe("OpportunityForm · submit", () => {
  it("sends the payload with trimmed text, a numeric budget and null optionals", async () => {
    const { user, submitter } = setup();
    await user.type(field("Nombre"), "  Test house ");
    await user.type(field("Cliente"), "Test client");
    await user.type(field("Localización"), "Test street 1");
    await user.selectOptions(field("Tipología"), "Industrial");
    await user.type(field("Responsable"), "Ana Test");
    await user.type(field("Presupuesto estimado (€)"), "125000,50");
    await user.type(field("Plazo"), "2026-12-31");
    await user.click(submitButton());
    await waitFor(() => expect(submitter).toHaveBeenCalledTimes(1));
    expect(submitter).toHaveBeenCalledWith({
      name: "Test house",
      client: "Test client",
      location: "Test street 1",
      project_type: "industrial",
      owner: "Ana Test",
      estimated_budget: 125000.5,
      deadline: "2026-12-31",
      source: null,
      decision_date: null,
    });
  });

  it("while saving: «Guardando…», disabled button, aria-busy; a second click does not resubmit", async () => {
    let resolve!: (o: Opportunity) => void;
    const submitter = jest.fn(() => new Promise<Opportunity>((r) => (resolve = r)));
    const { user } = setup(submitter);
    await fillRequired(user);
    await user.click(submitButton());
    const busy = await screen.findByRole("button", { name: "Guardando…" });
    expect(busy).toBeDisabled();
    expect(screen.getByRole("form", { name: "Nueva oportunidad" })).toHaveAttribute("aria-busy", "true");
    await user.click(busy);
    expect(submitter).toHaveBeenCalledTimes(1);
    await act(async () => resolve(CREATED));
  });

  it("success: calls onCreated with the created opportunity", async () => {
    const { user, onCreated } = setup(jest.fn().mockResolvedValue(CREATED), jest.fn());
    await fillRequired(user);
    await user.click(submitButton());
    await waitFor(() => expect(onCreated).toHaveBeenCalledWith(CREATED));
  });

  it("success without onCreated: navigates to /portfolio", async () => {
    const { user } = setup();
    await fillRequired(user);
    await user.click(submitButton());
    await waitFor(() => expect(mockPush).toHaveBeenCalledWith("/portfolio"));
  });

  it("after success the button stays disabled until the navigation (no duplicate opportunity)", async () => {
    const { user, submitter } = setup(undefined, jest.fn());
    await fillRequired(user);
    await user.click(submitButton());
    await waitFor(() => expect(submitter).toHaveBeenCalled());
    expect(submitButton()).toBeDisabled();
  });
});

describe("OpportunityForm · API errors", () => {
  it("a 422 with a field shows the message next to that field, marks it invalid and focuses it", async () => {
    const message = "El campo «Presupuesto estimado» no es válido: no puede ser negativo.";
    const submitter = jest.fn().mockRejectedValue(new ApiError(422, "invalid_field", message, "estimated_budget"));
    const { user, onCreated } = setup(submitter, jest.fn());
    await fillRequired(user);
    await user.click(submitButton());
    const control = await screen.findByLabelText("Presupuesto estimado (€)");
    await waitFor(() => expect(control).toHaveAttribute("aria-invalid", "true"));
    expect(control).toHaveAccessibleDescription(new RegExp(message));
    expect(control).toHaveFocus();
    expect(onCreated).not.toHaveBeenCalled();
    expect(submitButton()).toBeEnabled();
    expect(submitButton()).toHaveTextContent("Guardar oportunidad");
  });

  it("the entered data is kept after an error", async () => {
    const submitter = jest.fn().mockRejectedValue(new ApiError(422, "invalid_field", "Mensaje", "client"));
    const { user } = setup(submitter);
    await fillRequired(user);
    await user.click(submitButton());
    await waitFor(() => expect(field("Cliente")).toHaveAttribute("aria-invalid", "true"));
    expect(field("Nombre")).toHaveValue("Test house");
    expect(field("Tipología")).toHaveValue("industrial");
  });

  it("fixing the field and sending again works", async () => {
    const submitter = jest
      .fn()
      .mockRejectedValueOnce(new ApiError(422, "invalid_field", "Mensaje del servidor", "client"))
      .mockResolvedValue(CREATED);
    const { user, onCreated } = setup(submitter, jest.fn());
    await fillRequired(user);
    await user.click(submitButton());
    await screen.findByText("Mensaje del servidor");
    await user.type(field("Cliente"), " bis");
    expect(screen.queryByText("Mensaje del servidor")).not.toBeInTheDocument();
    await user.click(submitButton());
    await waitFor(() => expect(onCreated).toHaveBeenCalledTimes(1));
  });

  it("a network error shows a clear alert, keeps the data and lets the user retry", async () => {
    const network = "No se pudo conectar con el servidor. Comprueba tu conexión e inténtalo de nuevo.";
    const submitter = jest.fn().mockRejectedValueOnce(new ApiError(0, "network_error", network)).mockResolvedValue(CREATED);
    const { user, onCreated } = setup(submitter, jest.fn());
    await fillRequired(user);
    await user.click(submitButton());
    expect(await screen.findByRole("alert")).toHaveTextContent(network);
    expect(field("Nombre")).toHaveValue("Test house");
    expect(submitButton()).toBeEnabled();
    await user.click(submitButton());
    await waitFor(() => expect(onCreated).toHaveBeenCalledTimes(1));
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("a 422 whose field is not in the form (e.g. invalid_request) shows the message as a general alert", async () => {
    const submitter = jest.fn().mockRejectedValue(new ApiError(422, "invalid_request", "La petición no es válida."));
    const { user } = setup(submitter);
    await fillRequired(user);
    await user.click(submitButton());
    expect(await screen.findByRole("alert")).toHaveTextContent("La petición no es válida.");
    for (const label of ["Nombre", "Cliente"]) expect(field(label)).not.toHaveAttribute("aria-invalid");
  });

  it("an unknown field name from the API is treated as a general error", async () => {
    const submitter = jest.fn().mockRejectedValue(new ApiError(422, "invalid_field", "Mensaje raro", "constructor"));
    const { user } = setup(submitter);
    await fillRequired(user);
    await user.click(submitButton());
    expect(await screen.findByRole("alert")).toHaveTextContent("Mensaje raro");
  });

  it("an error that is not an ApiError shows the generic message, never the internals", async () => {
    const { user } = setup(jest.fn().mockRejectedValue(new Error("boom internal detail")));
    await fillRequired(user);
    await user.click(submitButton());
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Ocurrió un error inesperado. Inténtalo de nuevo.");
    expect(alert).not.toHaveTextContent("boom");
  });

  it("no accessibility violations with a server error on a field and a general alert", async () => {
    const submitter = jest.fn().mockRejectedValue(new ApiError(422, "invalid_field", "Mensaje del servidor", "client"));
    const { user, container } = setup(submitter);
    await fillRequired(user);
    await user.click(submitButton());
    await screen.findByText("Mensaje del servidor");
    expect(await axe(container)).toHaveNoViolations();
  });
});

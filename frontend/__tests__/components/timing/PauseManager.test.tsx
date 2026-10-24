import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { axe } from "jest-axe";
import { PauseManager } from "@/components/timing/PauseManager";
import { ApiError } from "@/lib/api";
import type { ProjectPause, ProjectPauses } from "@/lib/pauses";

const TODAY = "2026-10-24";

const ACTIVE: ProjectPause = {
  id: "active-1",
  phase: 2,
  reason: "authority-wait",
  startedOn: "2026-10-12",
  expectedResumption: "2026-11-09",
  resumedOn: null,
  overdue: false,
  daysOverdue: 0,
};
const CLOSED: ProjectPause = {
  id: "closed-1",
  phase: 1,
  reason: "client-wait",
  startedOn: "2026-08-03",
  expectedResumption: "2026-08-10",
  resumedOn: "2026-08-09",
  overdue: false,
  daysOverdue: 0,
};
const NONE: ProjectPauses = { active: null, history: [] };

function setup(initial: ProjectPauses, overrides: { pauseAction?: jest.Mock; resumeAction?: jest.Mock } = {}) {
  const pauseAction = overrides.pauseAction ?? jest.fn().mockResolvedValue(ACTIVE);
  const resumeAction = overrides.resumeAction ?? jest.fn().mockResolvedValue({ ...ACTIVE, resumedOn: TODAY });
  const user = userEvent.setup();
  const view = render(
    <PauseManager code="PRY-2026-001" initial={initial} today={TODAY} pauseAction={pauseAction} resumeAction={resumeAction} />,
  );
  return { user, pauseAction, resumeAction, ...view };
}

const openButton = () => screen.getByRole("button", { name: "Pausar proyecto" });
const reasonField = () => screen.getByLabelText("Motivo");
const dateField = () => screen.getByLabelText("Fecha prevista de reanudación");
const saveButton = () => screen.getByRole("button", { name: /Guardar pausa|Guardando…/ });

async function openAndFill(user: ReturnType<typeof userEvent.setup>) {
  await user.click(openButton());
  await user.selectOptions(reasonField(), "Espera del cliente");
  await user.type(dateField(), "2026-11-09");
}

describe("PauseManager · without an active pause", () => {
  it("offers «Pausar proyecto» and keeps the form closed until it is used", () => {
    setup(NONE);
    expect(openButton()).toBeInTheDocument();
    expect(screen.queryByLabelText("Motivo")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Reanudar" })).not.toBeInTheDocument();
    expect(screen.queryByText("Pausa activa")).not.toBeInTheDocument();
  });

  it("the form has a labelled reason select (placeholder + 4 reasons) and a date input", async () => {
    const { user } = setup(NONE);
    await user.click(openButton());
    const options = within(reasonField()).getAllByRole("option").map((o) => o.textContent);
    expect(options).toEqual(["Selecciona un motivo", "Espera del cliente", "Espera de organismo", "Decisión interna", "Otra"]);
    expect(reasonField().tagName).toBe("SELECT");
    expect(dateField()).toHaveAttribute("type", "date");
    expect(dateField()).toHaveAttribute("min", TODAY);
  });

  it("«Cancelar» closes the form and returns the focus to the opener", async () => {
    const { user } = setup(NONE);
    await user.click(openButton());
    await user.click(screen.getByRole("button", { name: "Cancelar" }));
    expect(screen.queryByLabelText("Motivo")).not.toBeInTheDocument();
    expect(openButton()).toHaveFocus();
  });

  it("an empty submit shows both errors as alerts, marks the fields and focuses the first", async () => {
    const { user, pauseAction } = setup(NONE);
    await user.click(openButton());
    await user.click(saveButton());
    expect(pauseAction).not.toHaveBeenCalled();
    expect(reasonField()).toHaveAttribute("aria-invalid", "true");
    expect(dateField()).toHaveAttribute("aria-invalid", "true");
    const alerts = screen.getAllByRole("alert").map((a) => a.textContent);
    expect(alerts).toEqual([
      "El campo «Motivo» es obligatorio.",
      "El campo «Fecha prevista de reanudación» es obligatorio.",
    ]);
    const described = reasonField().getAttribute("aria-describedby");
    expect(document.getElementById(described as string)).toHaveTextContent("El campo «Motivo» es obligatorio.");
    expect(reasonField()).toHaveFocus();
  });

  it("a past date is rejected in the client with the contract message", async () => {
    const { user, pauseAction } = setup(NONE);
    await user.click(openButton());
    await user.selectOptions(reasonField(), "Otra");
    await user.type(dateField(), "2026-10-01");
    await user.click(saveButton());
    expect(pauseAction).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toHaveTextContent(
      "El campo «Fecha prevista de reanudación» no es válido: no puede ser anterior a hoy.",
    );
    expect(dateField()).toHaveFocus();
  });

  it("a valid submit sends the draft, shows the active pause and closes the form", async () => {
    const { user, pauseAction } = setup(NONE);
    await openAndFill(user);
    await user.click(saveButton());
    expect(pauseAction).toHaveBeenCalledWith("client-wait", "2026-11-09");
    expect(await screen.findByRole("heading", { name: "Pausa activa" })).toBeInTheDocument();
    expect(screen.queryByLabelText("Motivo")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Reanudar" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Pausar proyecto" })).not.toBeInTheDocument();
  });

  it("shows «Guardando…», disables the button and sends only once on a double submit", async () => {
    let release!: (pause: ProjectPause) => void;
    const pauseAction = jest.fn(() => new Promise<ProjectPause>((resolve) => (release = resolve)));
    const { user } = setup(NONE, { pauseAction });
    await openAndFill(user);
    await user.click(saveButton());
    await user.click(saveButton());
    expect(pauseAction).toHaveBeenCalledTimes(1);
    expect(saveButton()).toHaveTextContent("Guardando…");
    expect(saveButton()).toBeDisabled();
    await act(async () => release(ACTIVE));
    expect(await screen.findByRole("heading", { name: "Pausa activa" })).toBeInTheDocument();
  });

  it("a 422 with field «reason» is shown next to Motivo, with the data kept and the focus on it", async () => {
    const message = "El campo «Motivo» no es válido: no es un motivo admitido.";
    const pauseAction = jest.fn().mockRejectedValue(new ApiError(422, "invalid_field", message, "reason"));
    const { user } = setup(NONE, { pauseAction });
    await openAndFill(user);
    await user.click(saveButton());
    expect(await screen.findByRole("alert")).toHaveTextContent(message);
    expect(reasonField()).toHaveAttribute("aria-invalid", "true");
    expect(reasonField()).toHaveFocus();
    expect(dateField()).toHaveValue("2026-11-09");
    expect(saveButton()).toBeEnabled();
  });

  it("a 422 with field «expected_resumption» focuses the date", async () => {
    const message = "El campo «Fecha prevista de reanudación» no es válido: no puede ser anterior a hoy.";
    const pauseAction = jest.fn().mockRejectedValue(new ApiError(422, "invalid_field", message, "expected_resumption"));
    const { user } = setup(NONE, { pauseAction });
    await openAndFill(user);
    await user.click(saveButton());
    expect(await screen.findByRole("alert")).toHaveTextContent(message);
    expect(dateField()).toHaveAttribute("aria-invalid", "true");
    expect(dateField()).toHaveFocus();
  });

  it.each([
    [403, "not_allowed", "Solo el director de proyecto o la dirección pueden pausar o reanudar."],
    [409, "already_paused", "El proyecto ya está en pausa."],
    [422, "cannot_pause_opportunity", "Una oportunidad aún no tiene reloj: se puede pausar desde la fase 1."],
    [0, "network_error", "No se pudo conectar con el servidor. Comprueba tu conexión e inténtalo de nuevo."],
  ])("a %i (%s) is shown in Spanish as an alert next to the action and the form stays", async (status, code, message) => {
    const pauseAction = jest.fn().mockRejectedValue(new ApiError(status, code, message));
    const { user } = setup(NONE, { pauseAction });
    await openAndFill(user);
    await user.click(saveButton());
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(message);
    expect(alert).toHaveFocus();
    expect(saveButton()).toBeEnabled();
    expect(reasonField()).not.toHaveAttribute("aria-invalid");
  });

  it("an unexpected error gets the generic Spanish message", async () => {
    const pauseAction = jest.fn().mockRejectedValue(new Error("boom"));
    const { user } = setup(NONE, { pauseAction });
    await openAndFill(user);
    await user.click(saveButton());
    expect(await screen.findByRole("alert")).toHaveTextContent("Ocurrió un error inesperado. Inténtalo de nuevo.");
  });
});

describe("PauseManager · with an active pause", () => {
  it("shows reason, since, expected date and the «Reanudar» button, not the pause button", () => {
    setup({ active: ACTIVE, history: [] });
    const panel = screen.getByRole("heading", { name: "Pausa activa" }).closest("section") as HTMLElement;
    expect(within(panel).getByText("Espera de organismo")).toBeInTheDocument();
    expect(within(panel).getByText("12/10/2026")).toBeInTheDocument();
    expect(within(panel).getByText("09/11/2026")).toBeInTheDocument();
    expect(within(panel).queryByText(/Vencida/)).not.toBeInTheDocument();
    expect(within(panel).getByRole("button", { name: "Reanudar" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Pausar proyecto" })).not.toBeInTheDocument();
  });

  it("an overdue pause says «Vencida hace N días» in text", () => {
    setup({ active: { ...ACTIVE, overdue: true, daysOverdue: 3 }, history: [] });
    expect(screen.getByText("Vencida hace 3 días")).toBeInTheDocument();
  });

  it("«Reanudar» asks for confirmation inside the page, without calling the API yet", async () => {
    const confirmSpy = jest.spyOn(window, "confirm");
    const { user, resumeAction } = setup({ active: ACTIVE, history: [] });
    await user.click(screen.getByRole("button", { name: "Reanudar" }));
    const group = screen.getByRole("group", { name: "Confirmar reanudación" });
    expect(group).toHaveTextContent("el reloj del proyecto volverá a correr");
    expect(within(group).getByRole("button", { name: "Confirmar reanudación" })).toHaveFocus();
    expect(resumeAction).not.toHaveBeenCalled();
    expect(confirmSpy).not.toHaveBeenCalled();
    confirmSpy.mockRestore();
  });

  it("cancelling the confirmation returns the focus to «Reanudar»", async () => {
    const { user, resumeAction } = setup({ active: ACTIVE, history: [] });
    await user.click(screen.getByRole("button", { name: "Reanudar" }));
    await user.click(screen.getByRole("button", { name: "Cancelar" }));
    expect(screen.queryByRole("group", { name: "Confirmar reanudación" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Reanudar" })).toHaveFocus();
    expect(resumeAction).not.toHaveBeenCalled();
  });

  it("confirming resumes: the pause moves to the history and «Pausar proyecto» comes back", async () => {
    const { user, resumeAction } = setup({ active: ACTIVE, history: [CLOSED] });
    await user.click(screen.getByRole("button", { name: "Reanudar" }));
    await user.click(screen.getByRole("button", { name: "Confirmar reanudación" }));
    expect(resumeAction).toHaveBeenCalledTimes(1);
    expect(await screen.findByRole("button", { name: "Pausar proyecto" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Pausa activa" })).not.toBeInTheDocument();
    const rows = within(screen.getByRole("table", { name: "Historial de pausas del proyecto" })).getAllByRole("row");
    // header + the just-closed pause (most recent first) + the previous one
    expect(rows).toHaveLength(3);
    expect(rows[1]).toHaveTextContent("Espera de organismo");
    expect(rows[2]).toHaveTextContent("Espera del cliente");
  });

  it("shows «Guardando…» and sends once on a double confirmation", async () => {
    let release!: (pause: ProjectPause) => void;
    const resumeAction = jest.fn(() => new Promise<ProjectPause>((resolve) => (release = resolve)));
    const { user } = setup({ active: ACTIVE, history: [] }, { resumeAction });
    await user.click(screen.getByRole("button", { name: "Reanudar" }));
    await user.click(screen.getByRole("button", { name: "Confirmar reanudación" }));
    const busy = screen.getByRole("button", { name: "Guardando…" });
    expect(busy).toBeDisabled();
    await user.click(busy);
    expect(resumeAction).toHaveBeenCalledTimes(1);
    await act(async () => release({ ...ACTIVE, resumedOn: TODAY }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Pausar proyecto" })).toBeInTheDocument());
  });

  it.each([
    [403, "not_allowed", "Solo el director de proyecto o la dirección pueden pausar o reanudar."],
    [409, "not_paused", "El proyecto no está en pausa."],
  ])("a %i (%s) on resume is an alert next to the action and the pause stays", async (status, code, message) => {
    const resumeAction = jest.fn().mockRejectedValue(new ApiError(status, code, message));
    const { user } = setup({ active: ACTIVE, history: [] }, { resumeAction });
    await user.click(screen.getByRole("button", { name: "Reanudar" }));
    await user.click(screen.getByRole("button", { name: "Confirmar reanudación" }));
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(message);
    expect(alert).toHaveFocus();
    expect(screen.getByRole("heading", { name: "Pausa activa" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Confirmar reanudación" })).toBeEnabled();
  });
});

describe("PauseManager · history", () => {
  it("lists the closed pauses with dates, phase, reason and the expected date", () => {
    setup({ active: null, history: [CLOSED] });
    const table = screen.getByRole("table", { name: "Historial de pausas del proyecto" });
    const row = within(table).getAllByRole("row")[1];
    expect(row).toHaveTextContent("03/08/2026 – 09/08/2026");
    expect(row).toHaveTextContent("Inicio");
    expect(row).toHaveTextContent("Espera del cliente");
    expect(row).toHaveTextContent("10/08/2026");
  });

  it("says so when there are no closed pauses", () => {
    setup(NONE);
    expect(screen.getByText("Sin pausas registradas")).toBeInTheDocument();
  });
});

describe("PauseManager · accessibility", () => {
  it.each([
    ["no pause", NONE],
    ["active pause", { active: ACTIVE, history: [CLOSED] }],
    ["overdue pause", { active: { ...ACTIVE, overdue: true, daysOverdue: 2 }, history: [] }],
  ])("%s: no axe violations", async (_name, initial) => {
    const { container } = setup(initial as ProjectPauses);
    expect(await axe(container)).toHaveNoViolations();
  });

  it("open form with errors: no axe violations", async () => {
    const { user, container } = setup(NONE);
    await user.click(openButton());
    await user.click(saveButton());
    expect(await axe(container)).toHaveNoViolations();
  });

  it("confirmation open: no axe violations", async () => {
    const { user, container } = setup({ active: ACTIVE, history: [] });
    await user.click(screen.getByRole("button", { name: "Reanudar" }));
    expect(await axe(container)).toHaveNoViolations();
  });
});

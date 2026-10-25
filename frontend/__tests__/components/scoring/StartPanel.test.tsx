/**
 * RGB-16 contract of `@/components/scoring/StartPanel` (to be created by the front developer):
 *   <StartPanel code projectType loadPlan? start? discard? />
 *     code: string; projectType: ProjectType (from lib/plan-settings)
 *     loadPlan?: (scale) => Promise<ProposedPlan>               default: fetchProposedPlan(projectType, scale)
 *     start?:    (scale, weeks: number[]) => Promise<StartResult>  default: startProject(code, ...)
 *     discard?:  (reason: string) => Promise<Transition>         default: doNotPursue(code, reason)
 *   ProposedPlan / StartResult / Transition come from `@/lib/start` (camelCase, see start.test.ts).
 * Weeks are seven number inputs labelled «Semanas de <phase name>» for phases 1..7.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { axe } from "jest-axe";
import { StartPanel } from "@/components/scoring/StartPanel";
import { ApiError } from "@/lib/api";
import type { ProposedPlan, StartResult } from "@/lib/start";

const WEEKS_MESSAGE = "Cada plantilla necesita exactamente 7 valores de semanas, enteros y entre 1 y 520.";
const PHASE_NAMES = ["Inicio", "Briefing y concepto", "Anteproyecto", "Proyecto básico", "Proyecto de ejecución", "Obra", "Cierre"];
const PLANS: Record<string, number[]> = {
  small: [1, 2, 3, 4, 5, 6, 7],
  medium: [2, 4, 6, 8, 10, 12, 14],
  large: [3, 6, 9, 12, 15, 18, 21],
};

const plan = (scale: string): ProposedPlan => ({
  projectType: "single_family_house",
  scale: scale as ProposedPlan["scale"],
  weeksByPhase: PLANS[scale],
  total: PLANS[scale].reduce((a, b) => a + b, 0),
});
const RESULT: StartResult = {
  code: "PRY-2026-001",
  action: "promote",
  previousPhase: 0,
  currentPhase: 1,
  frozenVersion: 3,
  plan: plan("medium"),
};
const TRANSITION = { code: "PRY-2026-001", action: "do_not_pursue", previousPhase: 0, currentPhase: 0, frozenVersion: 2 };

function setup(overrides: { loadPlan?: jest.Mock; start?: jest.Mock; discard?: jest.Mock } = {}) {
  const loadPlan = overrides.loadPlan ?? jest.fn(async (scale: string) => plan(scale));
  const start = overrides.start ?? jest.fn().mockResolvedValue(RESULT);
  const discard = overrides.discard ?? jest.fn().mockResolvedValue(TRANSITION);
  const user = userEvent.setup();
  const view = render(<StartPanel code="PRY-2026-001" projectType="single_family_house" loadPlan={loadPlan} start={start} discard={discard} />);
  return { user, loadPlan, start, discard, ...view };
}

type User = ReturnType<typeof userEvent.setup>;
const promoteButton = () => screen.getByRole("button", { name: "Promover a 1 · Inicio" });
const discardButton = () => screen.getByRole("button", { name: "No perseguir" });
const weeksField = (phase: string) => screen.getByLabelText(`Semanas de ${phase}`) as HTMLInputElement;
const scaleRadio = (label: string) => screen.getByRole("radio", { name: label });

async function chooseScale(user: User, label = "Media") {
  await user.click(scaleRadio(label));
  await screen.findByLabelText("Semanas de Inicio");
}
async function editWeeks(user: User, phase: string, value: string) {
  await user.clear(weeksField(phase));
  if (value !== "") await user.type(weeksField(phase), value);
}
async function openConfirmation(user: User) {
  await chooseScale(user);
  await user.click(promoteButton());
}
const confirmButton = () => screen.getByRole("button", { name: "Confirmar promoción" });
async function openDiscard(user: User) {
  await user.click(discardButton());
}
const reasonField = () => screen.getByLabelText("Motivo") as HTMLTextAreaElement;
const confirmDiscardButton = () => screen.getByRole("button", { name: "Confirmar no perseguir" });

describe("StartPanel · scale and proposed plan", () => {
  it("shows a heading, the three scales as radios in a labelled group and nothing selected", () => {
    setup();
    expect(screen.getByRole("heading", { name: "Plan propuesto" })).toBeInTheDocument();
    const group = screen.getByRole("group", { name: "Escala" });
    expect(within(group).getAllByRole("radio").map((r) => (r as HTMLInputElement).labels?.[0]?.textContent)).toEqual([
      "Pequeña",
      "Media",
      "Grande",
    ]);
    expect(screen.getAllByRole("radio").every((r) => !(r as HTMLInputElement).checked)).toBe(true);
    expect(screen.getByText("Elige una escala para ver el plan propuesto.")).toBeInTheDocument();
    expect(screen.queryByLabelText("Semanas de Inicio")).not.toBeInTheDocument();
  });

  it("does not change anything on its own: no start or discard call on render or when choosing a scale", async () => {
    const { user, start, discard } = setup();
    await chooseScale(user);
    expect(start).not.toHaveBeenCalled();
    expect(discard).not.toHaveBeenCalled();
  });

  it("choosing a scale loads the plan for that scale and shows seven labelled editable week fields", async () => {
    const { user, loadPlan } = setup();
    await chooseScale(user, "Media");
    expect(loadPlan).toHaveBeenCalledWith("medium");
    PHASE_NAMES.forEach((name, i) => {
      const field = weeksField(name);
      expect(field).toHaveAttribute("type", "number");
      expect(field).toHaveValue(PLANS.medium[i]);
    });
  });

  it("shows the total in weeks and updates it as the weeks are edited", async () => {
    const { user } = setup();
    await chooseScale(user, "Media");
    expect(screen.getByText("Total: 56 semanas")).toBeInTheDocument();
    await editWeeks(user, "Cierre", "20");
    expect(screen.getByText("Total: 62 semanas")).toBeInTheDocument();
  });

  it("while a week is invalid the total is not shown as a number", async () => {
    const { user } = setup();
    await chooseScale(user, "Pequeña");
    await editWeeks(user, "Obra", "0");
    expect(screen.queryByText(/Total: \d+ semanas/)).not.toBeInTheDocument();
    expect(screen.getByText("Total: —")).toBeInTheDocument();
  });

  it("shows «Cargando plan…» while the plan loads and disables promotion until it arrives", async () => {
    let release!: (p: ProposedPlan) => void;
    const loadPlan = jest.fn(() => new Promise<ProposedPlan>((resolve) => (release = resolve)));
    const { user } = setup({ loadPlan });
    await user.click(scaleRadio("Grande"));
    expect(screen.getByText("Cargando plan…")).toBeInTheDocument();
    expect(promoteButton()).toBeDisabled();
    await act(async () => release(plan("large")));
    expect(await screen.findByLabelText("Semanas de Inicio")).toHaveValue(3);
    expect(screen.queryByText("Cargando plan…")).not.toBeInTheDocument();
    expect(promoteButton()).toBeEnabled();
  });

  it("changing the scale replaces the edited weeks with the plan of the new scale", async () => {
    const { user } = setup();
    await chooseScale(user, "Media");
    await editWeeks(user, "Obra", "99");
    await user.click(scaleRadio("Grande"));
    await waitFor(() => expect(weeksField("Inicio")).toHaveValue(3));
    expect(weeksField("Obra")).toHaveValue(18);
    expect(screen.getByText("Total: 84 semanas")).toBeInTheDocument();
  });

  it("the scale radios work with the keyboard (arrows move and select)", async () => {
    const { user, loadPlan } = setup();
    await user.tab();
    expect(scaleRadio("Pequeña")).toHaveFocus();
    await user.keyboard("{ArrowRight}");
    expect(scaleRadio("Media")).toBeChecked();
    await screen.findByLabelText("Semanas de Inicio");
    expect(loadPlan).toHaveBeenLastCalledWith("medium");
  });

  it("without a scale the promotion button is disabled and the missing step is said in text", () => {
    setup();
    expect(promoteButton()).toBeDisabled();
    expect(screen.getByText("Elige una escala para promover.")).toBeInTheDocument();
  });

  it("a failed plan load shows an alert with the API message, no weeks, and another scale retries", async () => {
    const loadPlan = jest
      .fn()
      .mockRejectedValueOnce(new ApiError(0, "network_error", "No se pudo conectar con el servidor. Comprueba tu conexión e inténtalo de nuevo."))
      .mockImplementation(async (scale: string) => plan(scale));
    const { user } = setup({ loadPlan });
    await user.click(scaleRadio("Media"));
    expect(await screen.findByRole("alert")).toHaveTextContent("No se pudo conectar con el servidor");
    expect(screen.queryByLabelText("Semanas de Inicio")).not.toBeInTheDocument();
    expect(promoteButton()).toBeDisabled();
    await user.click(scaleRadio("Grande"));
    expect(await screen.findByLabelText("Semanas de Inicio")).toHaveValue(3);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});

describe("StartPanel · weeks validation", () => {
  it.each([
    ["empty", ""],
    ["zero", "0"],
    ["above the limit", "521"],
    ["a decimal", "2.5"],
  ])("%s: promoting is blocked with the server message, the field is marked and focused", async (_name, value) => {
    const { user, start } = setup();
    await chooseScale(user);
    await editWeeks(user, "Anteproyecto", value);
    await user.click(promoteButton());
    expect(start).not.toHaveBeenCalled();
    expect(screen.queryByRole("group", { name: "Confirmar promoción" })).not.toBeInTheDocument();
    const field = weeksField("Anteproyecto");
    expect(field).toHaveAttribute("aria-invalid", "true");
    expect(field).toHaveFocus();
    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent(WEEKS_MESSAGE);
    const described = field.getAttribute("aria-describedby") ?? "";
    expect(described.split(" ").some((id) => document.getElementById(id)?.textContent?.includes(WEEKS_MESSAGE))).toBe(true);
  });

  it("the first invalid field gets the focus when several are wrong", async () => {
    const { user } = setup();
    await chooseScale(user);
    await editWeeks(user, "Obra", "0");
    await editWeeks(user, "Briefing y concepto", "0");
    await user.click(promoteButton());
    expect(weeksField("Briefing y concepto")).toHaveFocus();
  });

  it("accepts the limits 1 and 520", async () => {
    const { user } = setup();
    await chooseScale(user);
    await editWeeks(user, "Inicio", "1");
    await editWeeks(user, "Cierre", "520");
    await user.click(promoteButton());
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.getByRole("group", { name: "Confirmar promoción" })).toBeInTheDocument();
  });

  it("fixing the value clears the error and the invalid mark", async () => {
    const { user } = setup();
    await chooseScale(user);
    await editWeeks(user, "Obra", "0");
    await user.click(promoteButton());
    await editWeeks(user, "Obra", "12");
    expect(weeksField("Obra")).not.toHaveAttribute("aria-invalid", "true");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.getByText("Total: 56 semanas")).toBeInTheDocument();
  });
});

describe("StartPanel · promote", () => {
  it("«Promover a 1 · Inicio» asks for confirmation in the page, explains the freeze and does not call the API yet", async () => {
    const confirmSpy = jest.spyOn(window, "confirm");
    const { user, start } = setup();
    await openConfirmation(user);
    const group = screen.getByRole("group", { name: "Confirmar promoción" });
    expect(group).toHaveTextContent("el scoring y el plan quedarán congelados");
    expect(within(group).getByRole("button", { name: "Confirmar promoción" })).toHaveFocus();
    expect(start).not.toHaveBeenCalled();
    expect(confirmSpy).not.toHaveBeenCalled();
    confirmSpy.mockRestore();
  });

  it("cancelling closes the confirmation and returns the focus to the promote button", async () => {
    const { user, start } = setup();
    await openConfirmation(user);
    await user.click(screen.getByRole("button", { name: "Cancelar" }));
    expect(screen.queryByRole("group", { name: "Confirmar promoción" })).not.toBeInTheDocument();
    expect(promoteButton()).toHaveFocus();
    expect(start).not.toHaveBeenCalled();
  });

  it("Escape closes the confirmation and returns the focus", async () => {
    const { user } = setup();
    await openConfirmation(user);
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("group", { name: "Confirmar promoción" })).not.toBeInTheDocument();
    expect(promoteButton()).toHaveFocus();
  });

  it("works with the keyboard only: Enter on the promote button, then Enter on the confirmation", async () => {
    const { user, start } = setup();
    await chooseScale(user);
    promoteButton().focus();
    await user.keyboard("{Enter}");
    expect(confirmButton()).toHaveFocus();
    await user.keyboard("{Enter}");
    expect(start).toHaveBeenCalledTimes(1);
  });

  it("confirming sends the scale and the (edited) weeks as integers", async () => {
    const { user, start } = setup();
    await chooseScale(user, "Media");
    await editWeeks(user, "Obra", "20");
    await user.click(promoteButton());
    await user.click(confirmButton());
    expect(start).toHaveBeenCalledWith("medium", [2, 4, 6, 8, 10, 20, 14]);
  });

  it("success: says the project moved to «1 · Inicio» with the frozen version, hides the actions and links to the phase", async () => {
    const { user } = setup();
    await openConfirmation(user);
    await user.click(confirmButton());
    const status = await screen.findByRole("status");
    expect(status).toHaveTextContent("Proyecto promovido a 1 · Inicio");
    expect(status).toHaveTextContent("versión 3");
    expect(screen.queryByRole("button", { name: "Promover a 1 · Inicio" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "No perseguir" })).not.toBeInTheDocument();
    expect(screen.queryByRole("group", { name: "Confirmar promoción" })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Ir a Inicio" })).toHaveAttribute("href", "/projects/PRY-2026-001/phase/1");
  });

  it("success freezes the plan: the week fields and the scale are read-only or gone", async () => {
    const { user } = setup();
    await openConfirmation(user);
    await user.click(confirmButton());
    await screen.findByRole("status");
    for (const radio of screen.queryAllByRole("radio")) expect(radio).toBeDisabled();
    for (const name of PHASE_NAMES) {
      const field = screen.queryByLabelText(`Semanas de ${name}`) as HTMLInputElement | null;
      if (field) expect(field.readOnly || field.disabled).toBe(true);
    }
  });

  it("shows «Promoviendo…», disables the button and sends only once on a double confirmation", async () => {
    let release!: (r: StartResult) => void;
    const start = jest.fn(() => new Promise<StartResult>((resolve) => (release = resolve)));
    const { user } = setup({ start });
    await openConfirmation(user);
    await user.click(confirmButton());
    const busy = screen.getByRole("button", { name: "Promoviendo…" });
    expect(busy).toBeDisabled();
    await user.click(busy);
    expect(start).toHaveBeenCalledTimes(1);
    await act(async () => release(RESULT));
    expect(await screen.findByRole("status")).toHaveTextContent("Proyecto promovido");
  });

  it.each([
    [403, "no_authority", "Solo un socio o un director pueden promover desde la fase 0."],
    [409, "plan_already_confirmed", "El proyecto ya tiene un plan confirmado."],
    [422, "incomplete_deliverable", "Falta guardar el scoring de la oportunidad antes de promover."],
    [422, "invalid_weeks", WEEKS_MESSAGE],
    [422, "invalid_scale", "La escala no es válida."],
    [0, "network_error", "No se pudo conectar con el servidor. Comprueba tu conexión e inténtalo de nuevo."],
  ])("a %i (%s) is shown in Spanish as a focused alert; the plan stays editable and nothing claims success", async (status, code, message) => {
    const start = jest.fn().mockRejectedValue(new ApiError(status, code, message));
    const { user } = setup({ start });
    await chooseScale(user);
    await editWeeks(user, "Obra", "20");
    await user.click(promoteButton());
    await user.click(confirmButton());
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(message);
    expect(alert).toHaveFocus();
    expect(screen.queryByText(/Proyecto promovido/)).not.toBeInTheDocument();
    expect(weeksField("Obra")).toHaveValue(20);
    expect(confirmButton()).toBeEnabled();
    expect(screen.queryByRole("link", { name: "Ir a Inicio" })).not.toBeInTheDocument();
  });

  it("an unexpected error gets the generic Spanish message", async () => {
    const start = jest.fn().mockRejectedValue(new Error("boom"));
    const { user } = setup({ start });
    await openConfirmation(user);
    await user.click(confirmButton());
    expect(await screen.findByRole("alert")).toHaveTextContent("Ocurrió un error inesperado. Inténtalo de nuevo.");
  });

  it("after an error the person can retry and succeed; the old alert goes away", async () => {
    const start = jest
      .fn()
      .mockRejectedValueOnce(new ApiError(0, "network_error", "No se pudo conectar con el servidor. Comprueba tu conexión e inténtalo de nuevo."))
      .mockResolvedValue(RESULT);
    const { user } = setup({ start });
    await openConfirmation(user);
    await user.click(confirmButton());
    await screen.findByRole("alert");
    await user.click(confirmButton());
    expect(await screen.findByRole("status")).toHaveTextContent("Proyecto promovido");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});

describe("StartPanel · do not pursue", () => {
  it("«No perseguir» is available from the start (no scale needed), opens a labelled reason field and focuses it", async () => {
    const { user, discard } = setup();
    expect(discardButton()).toBeEnabled();
    await openDiscard(user);
    const group = screen.getByRole("group", { name: "Descartar oportunidad" });
    expect(within(group).getByLabelText("Motivo")).toBe(reasonField());
    expect(reasonField().tagName).toBe("TEXTAREA");
    expect(reasonField()).toBeRequired();
    expect(reasonField()).toHaveFocus();
    expect(discard).not.toHaveBeenCalled();
  });

  it("cancelling closes the form and returns the focus to «No perseguir»", async () => {
    const { user } = setup();
    await openDiscard(user);
    await user.click(screen.getByRole("button", { name: "Cancelar" }));
    expect(screen.queryByLabelText("Motivo")).not.toBeInTheDocument();
    expect(discardButton()).toHaveFocus();
  });

  it.each([
    ["empty", ""],
    ["only spaces", "   "],
  ])("%s reason: blocked with an alert, field marked and focused, API not called", async (_name, text) => {
    const { user, discard } = setup();
    await openDiscard(user);
    if (text) await user.type(reasonField(), text);
    await user.click(confirmDiscardButton());
    expect(discard).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toHaveTextContent("El campo «Motivo» es obligatorio.");
    expect(reasonField()).toHaveAttribute("aria-invalid", "true");
    expect(reasonField()).toHaveFocus();
    const described = reasonField().getAttribute("aria-describedby") as string;
    expect(document.getElementById(described)).toHaveTextContent("El campo «Motivo» es obligatorio.");
  });

  it("a valid reason is sent trimmed and the outcome is announced; the actions disappear", async () => {
    const { user, discard } = setup();
    await openDiscard(user);
    await user.type(reasonField(), "  Budget too low for the studio  ");
    await user.click(confirmDiscardButton());
    expect(discard).toHaveBeenCalledWith("Budget too low for the studio");
    expect(await screen.findByRole("status")).toHaveTextContent("Oportunidad descartada: no perseguir.");
    expect(screen.queryByRole("button", { name: "No perseguir" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Promover a 1 · Inicio" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Ir a Inicio" })).not.toBeInTheDocument();
  });

  it("shows «Guardando…», disables the button and sends once on a double submit", async () => {
    let release!: (t: typeof TRANSITION) => void;
    const discard = jest.fn(() => new Promise<typeof TRANSITION>((resolve) => (release = resolve)));
    const { user } = setup({ discard });
    await openDiscard(user);
    await user.type(reasonField(), "Out of scope");
    await user.click(confirmDiscardButton());
    const busy = screen.getByRole("button", { name: "Guardando…" });
    expect(busy).toBeDisabled();
    await user.click(busy);
    expect(discard).toHaveBeenCalledTimes(1);
    await act(async () => release(TRANSITION));
    expect(await screen.findByRole("status")).toHaveTextContent("Oportunidad descartada");
  });

  it.each([
    [403, "no_authority", "Solo un socio o un director pueden descartar una oportunidad."],
    [409, "action_not_allowed", "Esta acción no está permitida en la fase actual."],
    [422, "reason_required", "El motivo es obligatorio."],
    [0, "network_error", "No se pudo conectar con el servidor. Comprueba tu conexión e inténtalo de nuevo."],
  ])("a %i (%s) is a focused alert, the reason is kept and the form stays", async (status, code, message) => {
    const discard = jest.fn().mockRejectedValue(new ApiError(status, code, message));
    const { user } = setup({ discard });
    await openDiscard(user);
    await user.type(reasonField(), "Out of scope");
    await user.click(confirmDiscardButton());
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(message);
    expect(alert).toHaveFocus();
    expect(reasonField()).toHaveValue("Out of scope");
    expect(confirmDiscardButton()).toBeEnabled();
    expect(screen.queryByText(/Oportunidad descartada/)).not.toBeInTheDocument();
  });

  it("opening one decision closes the other, so only one confirmation is pending", async () => {
    const { user } = setup();
    await openConfirmation(user);
    await openDiscard(user);
    expect(screen.queryByRole("group", { name: "Confirmar promoción" })).not.toBeInTheDocument();
    expect(screen.getByRole("group", { name: "Descartar oportunidad" })).toBeInTheDocument();
    await user.click(promoteButton());
    expect(screen.queryByRole("group", { name: "Descartar oportunidad" })).not.toBeInTheDocument();
    expect(screen.getByRole("group", { name: "Confirmar promoción" })).toBeInTheDocument();
  });
});

describe("StartPanel · human decision", () => {
  it("states that the decision belongs to the person and who can take it", () => {
    setup();
    expect(
      screen.getByText("Promover o descartar es una decisión de la persona; solo un socio o un director pueden tomarla."),
    ).toBeInTheDocument();
  });
});

describe("StartPanel · focus on success and revalidation on confirm", () => {
  it("after promoting, the focus moves to the success notice", async () => {
    const { user } = setup();
    await openConfirmation(user);
    await user.click(confirmButton());
    const status = await screen.findByRole("status");
    await waitFor(() => expect(status).toHaveFocus());
    expect(status).toHaveAttribute("tabindex", "-1");
  });

  it("after discarding, the focus moves to the success notice", async () => {
    const { user } = setup();
    await openDiscard(user);
    await user.type(reasonField(), "Out of scope");
    await user.click(confirmDiscardButton());
    const status = await screen.findByRole("status");
    await waitFor(() => expect(status).toHaveFocus());
  });

  it("confirming with a week edited to an invalid value does not send, shows the error and focuses the field", async () => {
    const { user, start } = setup();
    await openConfirmation(user);
    await editWeeks(user, "Obra", "0");
    await user.click(confirmButton());
    expect(start).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toHaveTextContent(WEEKS_MESSAGE);
    expect(weeksField("Obra")).toHaveAttribute("aria-invalid", "true");
    expect(weeksField("Obra")).toHaveFocus();
  });
});

describe("StartPanel · accessibility and theme", () => {
  it("initial state: no axe violations", async () => {
    const { container } = setup();
    expect(await axe(container)).toHaveNoViolations();
  });

  it("plan loaded: no axe violations", async () => {
    const { user, container } = setup();
    await chooseScale(user);
    expect(await axe(container)).toHaveNoViolations();
  });

  it("week error shown: no axe violations", async () => {
    const { user, container } = setup();
    await chooseScale(user);
    await editWeeks(user, "Obra", "0");
    await user.click(promoteButton());
    expect(await axe(container)).toHaveNoViolations();
  });

  it("promotion confirmation open: no axe violations", async () => {
    const { user, container } = setup();
    await openConfirmation(user);
    expect(await axe(container)).toHaveNoViolations();
  });

  it("discard form with a 403 shown: no axe violations", async () => {
    const discard = jest.fn().mockRejectedValue(new ApiError(403, "no_authority", "Solo un socio o un director pueden descartar una oportunidad."));
    const { user, container } = setup({ discard });
    await openDiscard(user);
    await user.type(reasonField(), "Out of scope");
    await user.click(confirmDiscardButton());
    await screen.findByRole("alert");
    expect(await axe(container)).toHaveNoViolations();
  });

  it("success state: no axe violations", async () => {
    const { user, container } = setup();
    await openConfirmation(user);
    await user.click(confirmButton());
    await screen.findByRole("status");
    expect(await axe(container)).toHaveNoViolations();
  });

  it("the component source uses theme tokens only (no hex, rgb or arbitrary colours), so light and dark both work", () => {
    const source = readFileSync(join(process.cwd(), "components/scoring/StartPanel.tsx"), "utf8");
    expect(source).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    expect(source).not.toMatch(/\b(rgb|rgba|hsl|oklch)\(/);
    expect(source).not.toMatch(/(bg|text|border|ring|outline|fill|stroke)-\[/);
    expect(source).not.toMatch(/\b(bg|text|border)-(white|black|gray|slate|red|green|blue|yellow|amber|zinc|neutral)\b/);
  });
});

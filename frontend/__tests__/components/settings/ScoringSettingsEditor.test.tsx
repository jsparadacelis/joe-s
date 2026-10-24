import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { axe } from "jest-axe";
import { ScoringSettingsEditor } from "@/components/settings/ScoringSettingsEditor";
import { ApiError } from "@/lib/api";
import { CRITERIA, CRITERION_LABELS, type ScoringSettings } from "@/lib/scoring";

const all = <T,>(value: T) => Object.fromEntries(CRITERIA.map((c) => [c, value])) as Record<(typeof CRITERIA)[number], T>;
const SETTINGS: ScoringSettings = { weights: all(1), threshold: 60 };
const WEIGHT_MESSAGE = "Cada peso debe ser un número mayor que 0 y como máximo 10, con hasta 2 decimales.";
const THRESHOLD_MESSAGE = "El umbral debe ser un número entero entre 1 y 100.";
const UNEXPECTED = "Ocurrió un error inesperado. Inténtalo de nuevo.";

function setup(overrides: { fetcher?: jest.Mock; saver?: jest.Mock } = {}) {
  const fetcher = overrides.fetcher ?? jest.fn().mockResolvedValue(SETTINGS);
  const saver = overrides.saver ?? jest.fn().mockResolvedValue(undefined);
  const user = userEvent.setup();
  const view = render(<ScoringSettingsEditor fetcher={fetcher} saver={saver} />);
  return { fetcher, saver, user, ...view };
}

const weight = (c: (typeof CRITERIA)[number]) => screen.getByLabelText(`Peso de ${CRITERION_LABELS[c]}`) as HTMLInputElement;
const threshold = () => screen.getByLabelText("Umbral de recomendación") as HTMLInputElement;
const saveButton = () => screen.getByRole("button", { name: "Guardar scoring" });

async function loaded(rest = setup()) {
  await screen.findByRole("button", { name: "Guardar scoring" });
  return rest;
}
async function typeInto(user: ReturnType<typeof userEvent.setup>, field: HTMLElement, value: string) {
  await user.clear(field);
  if (value !== "") await user.type(field, value);
}

describe("ScoringSettingsEditor loading", () => {
  it("shows a loading message, then the seven weights and the threshold from the API", async () => {
    const { fetcher } = setup();
    expect(screen.getByText("Cargando ajustes de scoring…")).toBeInTheDocument();
    await screen.findByRole("heading", { level: 2, name: "Scoring de oportunidades" });
    expect(fetcher).toHaveBeenCalledTimes(1);
    for (const c of CRITERIA) expect(weight(c)).toHaveValue(1);
    expect(threshold()).toHaveValue(60);
  });

  it("explains that saved scorings are not altered", async () => {
    await loaded();
    expect(screen.getByText(/las puntuaciones ya guardadas no cambian/i)).toBeInTheDocument();
  });

  it("shows the error with a retry button when loading fails", async () => {
    const fetcher = jest.fn().mockRejectedValueOnce(new ApiError(0, "network_error", "No se pudo conectar con el servidor. Comprueba tu conexión e inténtalo de nuevo.")).mockResolvedValue(SETTINGS);
    const { user } = setup({ fetcher });
    expect(await screen.findByRole("alert")).toHaveTextContent("No se pudo conectar con el servidor");
    await user.click(screen.getByRole("button", { name: "Reintentar" }));
    await screen.findByRole("button", { name: "Guardar scoring" });
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
});

describe("ScoringSettingsEditor validation (same limits as the API)", () => {
  it("keeps Guardar disabled until something changes", async () => {
    const { user } = await loaded();
    expect(saveButton()).toBeDisabled();
    await typeInto(user, threshold(), "70");
    expect(saveButton()).toBeEnabled();
    await typeInto(user, threshold(), "60");
    expect(saveButton()).toBeDisabled();
  });

  it.each(["0", "-1", "10.01", "", "1.005"])("rejects the weight «%s» next to the weights without calling the API", async (bad) => {
    const { user, saver } = await loaded();
    await typeInto(user, weight("budget"), bad);
    await user.click(saveButton());
    const message = await screen.findByText(WEIGHT_MESSAGE);
    expect(message).toHaveAttribute("role", "alert");
    expect(weight("budget")).toHaveAttribute("aria-invalid", "true");
    expect(weight("budget")).toHaveAccessibleDescription(WEIGHT_MESSAGE);
    expect(weight("budget")).toHaveFocus();
    expect(saver).not.toHaveBeenCalled();
  });

  it("marks only the offending weight as invalid for a client-side error", async () => {
    const { user } = await loaded();
    await typeInto(user, weight("budget"), "0");
    await user.click(saveButton());
    await screen.findByText(WEIGHT_MESSAGE);
    expect(weight("budget")).toHaveAttribute("aria-invalid", "true");
    expect(weight("location")).not.toHaveAttribute("aria-invalid");
  });

  it.each(["0", "101", "60.5", ""])("rejects the threshold «%s»", async (bad) => {
    const { user, saver } = await loaded();
    await typeInto(user, threshold(), bad);
    await user.click(saveButton());
    expect(await screen.findByText(THRESHOLD_MESSAGE)).toHaveAttribute("role", "alert");
    expect(threshold()).toHaveAttribute("aria-invalid", "true");
    expect(threshold()).toHaveAccessibleDescription(THRESHOLD_MESSAGE);
    expect(threshold()).toHaveFocus();
    expect(saver).not.toHaveBeenCalled();
  });

  it("accepts the limits 10, 0.01, 1 and 100", async () => {
    const { user, saver } = await loaded();
    await typeInto(user, weight("location"), "10");
    await typeInto(user, weight("source"), "0.01");
    await typeInto(user, threshold(), "100");
    await user.click(saveButton());
    expect(saver).toHaveBeenCalledWith({ weights: { ...all(1), location: 10, source: 0.01 }, threshold: 100 });
  });

  it("removes a field error as soon as the field is edited", async () => {
    const { user } = await loaded();
    await typeInto(user, threshold(), "0");
    await user.click(saveButton());
    await screen.findByText(THRESHOLD_MESSAGE);
    await user.type(threshold(), "5");
    expect(screen.queryByText(THRESHOLD_MESSAGE)).not.toBeInTheDocument();
  });
});

describe("ScoringSettingsEditor saving", () => {
  it("sends the whole settings as numbers, announces politely and restores focus to the edited field", async () => {
    const { user, saver } = await loaded();
    await typeInto(user, weight("typology"), "2.5");
    await user.click(saveButton());
    expect(saver).toHaveBeenCalledWith({ weights: { ...all(1), typology: 2.5 }, threshold: 60 });
    const status = await screen.findByText("Ajustes de scoring guardados.");
    expect(status.closest("[aria-live='polite']")).not.toBeNull();
    expect(weight("typology")).toHaveFocus();
    expect(saveButton()).toBeDisabled();
  });

  it("clears the announcement when editing again", async () => {
    const { user } = await loaded();
    await typeInto(user, threshold(), "70");
    await user.click(saveButton());
    await screen.findByText("Ajustes de scoring guardados.");
    await user.type(threshold(), "1");
    expect(screen.queryByText("Ajustes de scoring guardados.")).not.toBeInTheDocument();
  });

  it("disables Guardar while saving", async () => {
    let resolve: () => void = () => undefined;
    const saver = jest.fn().mockReturnValue(new Promise<void>((r) => (resolve = r)));
    const { user } = await loaded(setup({ saver }));
    await typeInto(user, threshold(), "70");
    await user.click(saveButton());
    expect(saveButton()).toBeDisabled();
    resolve();
    await screen.findByText("Ajustes de scoring guardados.");
  });

  it("422 invalid_weights: server message next to the weights, focus restored", async () => {
    const saver = jest.fn().mockRejectedValue(new ApiError(422, "invalid_weights", "Los pesos no son válidos."));
    const { user } = await loaded(setup({ saver }));
    await typeInto(user, weight("timeline"), "3");
    await user.click(saveButton());
    expect(await screen.findByText("Los pesos no son válidos.")).toHaveAttribute("role", "alert");
    expect(weight("timeline")).toHaveFocus();
    expect(screen.queryByText("Ajustes de scoring guardados.")).not.toBeInTheDocument();
  });

  it("422 invalid_threshold: server message next to the threshold", async () => {
    const saver = jest.fn().mockRejectedValue(new ApiError(422, "invalid_threshold", "El umbral no es válido."));
    const { user } = await loaded(setup({ saver }));
    await typeInto(user, threshold(), "70");
    await user.click(saveButton());
    await screen.findByText("El umbral no es válido.");
    expect(threshold()).toHaveAttribute("aria-invalid", "true");
    expect(threshold()).toHaveFocus();
  });

  it("other failures show a generic Spanish alert and keep the draft", async () => {
    const saver = jest.fn().mockRejectedValue(new Error("boom"));
    const { user } = await loaded(setup({ saver }));
    await typeInto(user, threshold(), "70");
    await user.click(saveButton());
    expect(await screen.findByText(UNEXPECTED)).toHaveAttribute("role", "alert");
    expect(threshold()).toHaveValue(70);
    expect(saveButton()).toBeEnabled();
  });
});

describe("ScoringSettingsEditor accessibility", () => {
  it("groups the weights and has no axe violations, also with errors", async () => {
    const { user, container } = await loaded();
    expect(within(screen.getByRole("group", { name: "Pesos de los criterios" })).getAllByRole("spinbutton")).toHaveLength(7);
    expect(await axe(container)).toHaveNoViolations();
    await typeInto(user, threshold(), "0");
    await user.click(saveButton());
    await screen.findByText(THRESHOLD_MESSAGE);
    expect(await axe(container)).toHaveNoViolations();
  });
});

import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { axe } from "jest-axe";
import { ApiError } from "@/lib/api";
import type { PlanSettings } from "@/lib/plan-settings";
import { PlanSettingsEditor } from "@/components/settings/PlanSettingsEditor";

const NETWORK = "No se pudo conectar con el servidor. Comprueba tu conexión e inténtalo de nuevo.";
const UNEXPECTED = "Ocurrió un error inesperado. Inténtalo de nuevo.";
// Messages changed with the bounds (MAX_WEEKS = 520, MIN_FACTOR = 0.1); see lib/plan-settings.test.ts.
const WEEKS_MESSAGE = "Cada plantilla necesita exactamente 7 valores de semanas, enteros y entre 1 y 520.";
const FACTOR_MESSAGE = "El factor de escala debe ser un número entre 0,1 y 10.";
const HELP = "Los cambios se aplican a los planes que se generen a partir de ahora y quedan en el registro de auditoría.";

// Phases 1 to 7 (phase 0 is the opportunity itself and has no weeks).
const PHASE_NAMES = [
  "Inicio",
  "Briefing y concepto",
  "Anteproyecto",
  "Proyecto básico",
  "Proyecto de ejecución",
  "Obra",
  "Cierre",
];

const TYPE_LABELS = [
  "Vivienda unifamiliar",
  "Rehabilitación",
  "Plurifamiliar",
  "Dotacional",
  "Industrial",
  "Reforma de interiores",
];

const SETTINGS: PlanSettings = {
  templates: {
    single_family_house: [2, 2, 4, 6, 8, 30, 3],
    rehabilitation: [2, 3, 4, 6, 8, 26, 3],
    multi_family: [3, 3, 5, 7, 10, 40, 4],
    facility: [3, 4, 6, 8, 12, 44, 4],
    industrial: [3, 3, 5, 7, 10, 52, 5],
    renovation_interiors: [1, 2, 3, 4, 5, 10, 2],
  },
  scaleFactors: { small: 0.8, medium: 1, large: 1.3 },
};

function setup(overrides: { fetcher?: jest.Mock; updater?: { updateTemplate: jest.Mock; updateScaleFactor: jest.Mock } } = {}) {
  const fetcher = overrides.fetcher ?? jest.fn().mockResolvedValue(SETTINGS);
  const updater = overrides.updater ?? {
    updateTemplate: jest.fn().mockResolvedValue(undefined),
    updateScaleFactor: jest.fn().mockResolvedValue(undefined),
  };
  const user = userEvent.setup();
  const view = render(<PlanSettingsEditor fetcher={fetcher} updater={updater} />);
  return { fetcher, updater, user, ...view };
}

async function loaded(rest = setup()) {
  await screen.findByRole("group", { name: "Industrial" });
  return rest;
}

const row = (label: string) => screen.getByRole("group", { name: label });
const weekField = (label: string, index: number) =>
  within(row(label)).getByLabelText(`Fase ${index + 1}: ${PHASE_NAMES[index]}`) as HTMLInputElement;
const saveButton = (label: string) => within(row(label)).getByRole("button", { name: "Guardar" });

async function typeInto(user: ReturnType<typeof userEvent.setup>, field: HTMLElement, value: string) {
  await user.clear(field);
  if (value !== "") await user.type(field, value);
}

describe("PlanSettingsEditor · loading and load errors", () => {
  it("shows the loading text while the settings are being fetched", async () => {
    let resolve!: (value: PlanSettings) => void;
    const fetcher = jest.fn().mockReturnValue(new Promise<PlanSettings>((r) => (resolve = r)));
    setup({ fetcher });
    expect(screen.getByText("Cargando ajustes del plan…")).toBeInTheDocument();
    expect(screen.queryByRole("group", { name: "Industrial" })).not.toBeInTheDocument();
    await act(async () => resolve(SETTINGS));
    expect(screen.queryByText("Cargando ajustes del plan…")).not.toBeInTheDocument();
    expect(screen.getByRole("group", { name: "Industrial" })).toBeInTheDocument();
  });

  it("fetches the settings once on mount", async () => {
    const { fetcher } = await loaded();
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("shows the API message and a Retry button when loading fails", async () => {
    const fetcher = jest.fn().mockRejectedValue(new ApiError(0, "network_error", NETWORK));
    setup({ fetcher });
    expect(await screen.findByRole("alert")).toHaveTextContent(NETWORK);
    expect(screen.getByRole("button", { name: "Reintentar" })).toBeInTheDocument();
    expect(screen.queryByText("Cargando ajustes del plan…")).not.toBeInTheDocument();
    expect(screen.queryByRole("group", { name: "Industrial" })).not.toBeInTheDocument();
  });

  it("falls back to the generic message when loading fails with a non-API error", async () => {
    const fetcher = jest.fn().mockRejectedValue(new Error("boom"));
    setup({ fetcher });
    expect(await screen.findByRole("alert")).toHaveTextContent(UNEXPECTED);
  });

  it("Retry fetches again and then shows the editor", async () => {
    const fetcher = jest
      .fn()
      .mockRejectedValueOnce(new ApiError(0, "network_error", NETWORK))
      .mockResolvedValueOnce(SETTINGS);
    const { user } = setup({ fetcher });
    await user.click(await screen.findByRole("button", { name: "Reintentar" }));
    expect(await screen.findByRole("group", { name: "Industrial" })).toBeInTheDocument();
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("keeps showing the error when Retry fails again", async () => {
    const fetcher = jest.fn().mockRejectedValue(new ApiError(0, "network_error", NETWORK));
    const { user } = setup({ fetcher });
    await user.click(await screen.findByRole("button", { name: "Reintentar" }));
    await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(2));
    expect(await screen.findByRole("alert")).toHaveTextContent(NETWORK);
    expect(screen.getByRole("button", { name: "Reintentar" })).toBeInTheDocument();
  });
});

describe("PlanSettingsEditor · templates", () => {
  it("renders the two sections and the help text", async () => {
    await loaded();
    expect(screen.getByRole("heading", { level: 2, name: "Plantillas de semanas por tipología" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 2, name: "Factores de escala" })).toBeInTheDocument();
    expect(screen.getByText(HELP)).toBeInTheDocument();
  });

  it("renders one group per project type, in order", async () => {
    await loaded();
    for (const label of TYPE_LABELS) expect(row(label)).toBeInTheDocument();
  });

  it("renders seven number fields per row labelled with the phase name and loaded with the saved weeks", async () => {
    await loaded();
    const expected = SETTINGS.templates.industrial;
    PHASE_NAMES.forEach((_, index) => {
      const field = weekField("Industrial", index);
      expect(field).toHaveAttribute("type", "number");
      expect(field).toHaveValue(expected[index]);
    });
    expect(within(row("Industrial")).getAllByRole("spinbutton")).toHaveLength(7);
  });

  it("shows the total of weeks of each row", async () => {
    await loaded();
    expect(within(row("Industrial")).getByText("Total: 85 semanas")).toBeInTheDocument();
    expect(within(row("Vivienda unifamiliar")).getByText("Total: 55 semanas")).toBeInTheDocument();
  });

  it("updates the total live while typing", async () => {
    const { user } = await loaded();
    await typeInto(user, weekField("Industrial", 5), "60");
    expect(within(row("Industrial")).getByText("Total: 93 semanas")).toBeInTheDocument();
    expect(within(row("Rehabilitación")).getByText("Total: 52 semanas")).toBeInTheDocument();
  });

  it("disables Guardar on every row while there are no changes", async () => {
    await loaded();
    for (const label of TYPE_LABELS) expect(saveButton(label)).toBeDisabled();
  });

  it("enables Guardar only on the edited row", async () => {
    const { user } = await loaded();
    await typeInto(user, weekField("Industrial", 0), "4");
    expect(saveButton("Industrial")).toBeEnabled();
    expect(saveButton("Dotacional")).toBeDisabled();
  });

  it("disables Guardar again when the value goes back to the saved one", async () => {
    const { user } = await loaded();
    await typeInto(user, weekField("Industrial", 0), "4");
    await typeInto(user, weekField("Industrial", 0), "3");
    expect(saveButton("Industrial")).toBeDisabled();
  });

  it("saves the edited row with the typed weeks as numbers", async () => {
    const { user, updater } = await loaded();
    await typeInto(user, weekField("Industrial", 6), "6");
    await user.click(saveButton("Industrial"));
    expect(updater.updateTemplate).toHaveBeenCalledTimes(1);
    expect(updater.updateTemplate).toHaveBeenCalledWith("industrial", [3, 3, 5, 7, 10, 52, 6]);
    expect(updater.updateScaleFactor).not.toHaveBeenCalled();
  });

  it("disables Guardar while the save is in flight", async () => {
    let resolve!: () => void;
    const updater = {
      updateTemplate: jest.fn().mockReturnValue(new Promise<void>((r) => (resolve = r))),
      updateScaleFactor: jest.fn(),
    };
    const { user } = await loaded(setup({ updater }));
    await typeInto(user, weekField("Industrial", 0), "4");
    await user.click(saveButton("Industrial"));
    expect(saveButton("Industrial")).toBeDisabled();
    expect(updater.updateTemplate).toHaveBeenCalledTimes(1);
    await act(async () => resolve());
    expect(saveButton("Industrial")).toBeDisabled(); // saved value updated: no changes left
  });

  it("announces success in an aria-live region that exists before the save", async () => {
    const { user, container } = await loaded();
    const region = container.querySelector('[aria-live="polite"]');
    expect(region).not.toBeNull();
    expect(region).toBeEmptyDOMElement();
    await typeInto(user, weekField("Industrial", 0), "4");
    await user.click(saveButton("Industrial"));
    expect(await screen.findByText("Plantilla de Industrial guardada.")).toBeInTheDocument();
    expect(region).toHaveTextContent("Plantilla de Industrial guardada.");
  });

  it("after a successful save the new values become the saved ones", async () => {
    const { user } = await loaded();
    await typeInto(user, weekField("Industrial", 0), "4");
    await user.click(saveButton("Industrial"));
    await screen.findByText("Plantilla de Industrial guardada.");
    expect(saveButton("Industrial")).toBeDisabled();
    expect(weekField("Industrial", 0)).toHaveValue(4);
    // Going back to the old value is now a change.
    await typeInto(user, weekField("Industrial", 0), "3");
    expect(saveButton("Industrial")).toBeEnabled();
  });

  it("shows the server rejection next to the row, marks the fields and keeps what was typed", async () => {
    const updater = {
      updateTemplate: jest.fn().mockRejectedValue(new ApiError(422, "invalid_weeks", WEEKS_MESSAGE)),
      updateScaleFactor: jest.fn(),
    };
    const { user } = await loaded(setup({ updater }));
    await typeInto(user, weekField("Industrial", 2), "9");
    await user.click(saveButton("Industrial"));
    const message = await within(row("Industrial")).findByText(WEEKS_MESSAGE);
    expect(message.id).not.toBe("");
    for (let index = 0; index < 7; index += 1) {
      const field = weekField("Industrial", index);
      expect(field).toHaveAttribute("aria-invalid", "true");
      expect(field.getAttribute("aria-describedby")?.split(" ")).toContain(message.id);
    }
    expect(weekField("Industrial", 2)).toHaveValue(9);
    expect(saveButton("Industrial")).toBeEnabled(); // the row still has changes
    expect(screen.queryByText("Plantilla de Industrial guardada.")).not.toBeInTheDocument();
    // Other rows are untouched.
    expect(within(row("Dotacional")).queryByText(WEEKS_MESSAGE)).not.toBeInTheDocument();
    expect(weekField("Dotacional", 0)).not.toHaveAttribute("aria-invalid", "true");
  });

  it("shows a network failure of the save next to the row", async () => {
    const updater = {
      updateTemplate: jest.fn().mockRejectedValue(new ApiError(0, "network_error", NETWORK)),
      updateScaleFactor: jest.fn(),
    };
    const { user } = await loaded(setup({ updater }));
    await typeInto(user, weekField("Industrial", 0), "4");
    await user.click(saveButton("Industrial"));
    expect(await within(row("Industrial")).findByText(NETWORK)).toBeInTheDocument();
    expect(weekField("Industrial", 0)).toHaveValue(4);
    expect(saveButton("Industrial")).toBeEnabled();
    expect(screen.queryByRole("group", { name: "Industrial" })).toBeInTheDocument(); // page keeps working
  });

  it("uses the generic message when the save fails with a non-API error", async () => {
    const updater = { updateTemplate: jest.fn().mockRejectedValue(new Error("boom")), updateScaleFactor: jest.fn() };
    const { user } = await loaded(setup({ updater }));
    await typeInto(user, weekField("Industrial", 0), "4");
    await user.click(saveButton("Industrial"));
    expect(await within(row("Industrial")).findByText(UNEXPECTED)).toBeInTheDocument();
  });

  it("clears the error and marks after a later successful save", async () => {
    const updater = {
      updateTemplate: jest
        .fn()
        .mockRejectedValueOnce(new ApiError(422, "invalid_weeks", WEEKS_MESSAGE))
        .mockResolvedValueOnce(undefined),
      updateScaleFactor: jest.fn(),
    };
    const { user } = await loaded(setup({ updater }));
    await typeInto(user, weekField("Industrial", 0), "4");
    await user.click(saveButton("Industrial"));
    await within(row("Industrial")).findByText(WEEKS_MESSAGE);
    await user.click(saveButton("Industrial"));
    expect(await screen.findByText("Plantilla de Industrial guardada.")).toBeInTheDocument();
    expect(within(row("Industrial")).queryByText(WEEKS_MESSAGE)).not.toBeInTheDocument();
    expect(weekField("Industrial", 0)).not.toHaveAttribute("aria-invalid", "true");
  });

  it.each([
    ["an empty field", ""],
    ["zero", "0"],
    ["a negative number", "-2"],
    ["a decimal", "2.5"],
    ["521 weeks (just above the cap)", "521"],
    ["2147483648 weeks", "2147483648"],
    ["99999999999 weeks", "99999999999"],
    ["1e21 weeks", "1e21"],
  ])("rejects %s in the client without calling the API", async (_name, value) => {
    const { user, updater } = await loaded();
    const field = weekField("Industrial", 3);
    await typeInto(user, field, value);
    await user.click(saveButton("Industrial"));
    const message = await within(row("Industrial")).findByText(WEEKS_MESSAGE);
    expect(updater.updateTemplate).not.toHaveBeenCalled();
    expect(field).toHaveAttribute("aria-invalid", "true");
    expect(field.getAttribute("aria-describedby")?.split(" ")).toContain(message.id);
    expect(screen.queryByText("Plantilla de Industrial guardada.")).not.toBeInTheDocument();
    expect(saveButton("Industrial")).toBeEnabled();
  });
});

describe("PlanSettingsEditor · live total", () => {
  const total = (label: string) => within(row(label)).getByText(/^Total:/);

  it("shows the sum when all seven values are valid integers", async () => {
    await loaded();
    expect(total("Industrial")).toHaveTextContent("Total: 85 semanas");
  });

  it("accepts 520 weeks in a field and sums it", async () => {
    const { user, updater } = await loaded();
    await typeInto(user, weekField("Industrial", 5), "520");
    // 3 + 3 + 5 + 7 + 10 + 520 + 5
    expect(total("Industrial")).toHaveTextContent("Total: 553 semanas");
    await user.click(saveButton("Industrial"));
    expect(updater.updateTemplate).toHaveBeenCalledWith("industrial", [3, 3, 5, 7, 10, 520, 5]);
  });

  it.each([
    ["an empty field", ""],
    ["zero", "0"],
    ["a negative number", "-2"],
    ["a decimal", "2.5"],
    ["521 weeks", "521"],
    ["99999999999 weeks", "99999999999"],
    ["1e21 weeks", "1e21"],
  ])("shows a dash instead of a number with %s", async (_name, value) => {
    const { user } = await loaded();
    await typeInto(user, weekField("Industrial", 3), value);
    expect(total("Industrial").textContent).toBe("Total: —");
    expect(total("Industrial").textContent).not.toMatch(/e\+|NaN|\.|Infinity/);
    // Other rows keep their numeric total.
    expect(total("Rehabilitación")).toHaveTextContent("Total: 52 semanas");
  });

  it("goes back to the numeric total when the field is fixed", async () => {
    const { user } = await loaded();
    await typeInto(user, weekField("Industrial", 3), "");
    expect(total("Industrial").textContent).toBe("Total: —");
    await typeInto(user, weekField("Industrial", 3), "7");
    expect(total("Industrial")).toHaveTextContent("Total: 85 semanas");
  });
});

describe("PlanSettingsEditor · focus after saving", () => {
  // Chosen element: the last field of the row that had focus before the save
  // (the field being edited); focus must never fall back to <body>.
  it("keeps focus on the edited field after clicking Guardar", async () => {
    const { user } = await loaded();
    await typeInto(user, weekField("Industrial", 2), "9");
    await user.click(saveButton("Industrial"));
    await screen.findByText("Plantilla de Industrial guardada.");
    expect(saveButton("Industrial")).toBeDisabled();
    expect(document.body).not.toHaveFocus();
    expect(weekField("Industrial", 2)).toHaveFocus();
  });

  it("keeps focus on the edited field after saving with Enter on Guardar", async () => {
    const { user } = await loaded();
    await typeInto(user, weekField("Industrial", 2), "9");
    for (let index = 0; index < 5; index += 1) await user.tab(); // fields 3..7, then Guardar
    expect(saveButton("Industrial")).toHaveFocus();
    await user.keyboard("{Enter}");
    await screen.findByText("Plantilla de Industrial guardada.");
    expect(document.body).not.toHaveFocus();
    expect(weekField("Industrial", 6)).toHaveFocus(); // last field focused in the row before Guardar
  });

  it("keeps focus on the factor field after saving a scale factor", async () => {
    const { user } = await loaded();
    const field = within(screen.getByRole("group", { name: "Media" })).getByLabelText("Factor de escala Media");
    await typeInto(user, field, "1.5");
    await user.click(within(screen.getByRole("group", { name: "Media" })).getByRole("button", { name: "Guardar" }));
    await screen.findByText("Factor de escala Media guardado.");
    expect(document.body).not.toHaveFocus();
    expect(field).toHaveFocus();
  });

  it("keeps focus on the edited field after a server rejection of a template", async () => {
    const updater = {
      updateTemplate: jest.fn().mockRejectedValue(new ApiError(422, "invalid_weeks", WEEKS_MESSAGE)),
      updateScaleFactor: jest.fn(),
    };
    const { user } = await loaded(setup({ updater }));
    const field = weekField("Industrial", 2);
    await typeInto(user, field, "9");
    await user.click(saveButton("Industrial"));
    await screen.findByText(WEEKS_MESSAGE);
    expect(field).toHaveAttribute("aria-invalid", "true");
    expect(document.activeElement).not.toBe(document.body);
    expect(field).toHaveFocus();
  });

  it("keeps focus on the edited field after a server rejection of a scale factor", async () => {
    const updater = {
      updateTemplate: jest.fn(),
      updateScaleFactor: jest.fn().mockRejectedValue(new ApiError(422, "invalid_factor", FACTOR_MESSAGE)),
    };
    const { user } = await loaded(setup({ updater }));
    const group = within(screen.getByRole("group", { name: "Media" }));
    const field = group.getByLabelText("Factor de escala Media");
    await typeInto(user, field, "1.5");
    await user.click(group.getByRole("button", { name: "Guardar" }));
    await screen.findByText(FACTOR_MESSAGE);
    expect(field).toHaveAttribute("aria-invalid", "true");
    expect(document.activeElement).not.toBe(document.body);
    expect(field).toHaveFocus();
  });

  it("keeps focus on the edited field after a network failure while saving with Enter", async () => {
    const updater = {
      updateTemplate: jest.fn().mockRejectedValue(new ApiError(0, "network_error", NETWORK)),
      updateScaleFactor: jest.fn(),
    };
    const { user } = await loaded(setup({ updater }));
    await typeInto(user, weekField("Industrial", 2), "9");
    for (let index = 0; index < 5; index += 1) await user.tab(); // fields 3..7, then Guardar
    expect(saveButton("Industrial")).toHaveFocus();
    await user.keyboard("{Enter}");
    await screen.findByText(NETWORK);
    expect(document.activeElement).not.toBe(document.body);
    expect(weekField("Industrial", 6)).toHaveFocus(); // last field focused in the row before Guardar
    expect(weekField("Industrial", 6)).toHaveAttribute("aria-invalid", "true");
  });
});

describe("PlanSettingsEditor · success announcement lifecycle", () => {
  const region = (container: HTMLElement) => container.querySelector('[aria-live="polite"]') as HTMLElement;

  it("clears the message as soon as any template field is edited", async () => {
    const { user, container } = await loaded();
    await typeInto(user, weekField("Industrial", 0), "4");
    await user.click(saveButton("Industrial"));
    await screen.findByText("Plantilla de Industrial guardada.");
    await user.type(weekField("Rehabilitación", 0), "1"); // a different row
    expect(region(container)).toBeEmptyDOMElement();
  });

  it("clears the message when a scale factor is edited", async () => {
    const { user, container } = await loaded();
    await typeInto(user, weekField("Industrial", 0), "4");
    await user.click(saveButton("Industrial"));
    await screen.findByText("Plantilla de Industrial guardada.");
    const field = within(screen.getByRole("group", { name: "Media" })).getByLabelText("Factor de escala Media");
    await user.type(field, "1");
    expect(region(container)).toBeEmptyDOMElement();
  });

  it("re-announces when the same row is saved twice: the live region is empty in between", async () => {
    const { user, container } = await loaded();
    await typeInto(user, weekField("Industrial", 0), "4");
    await user.click(saveButton("Industrial"));
    await screen.findByText("Plantilla de Industrial guardada.");
    await typeInto(user, weekField("Industrial", 0), "5");
    expect(region(container)).toBeEmptyDOMElement(); // mechanism: empty, then the text again
    await user.click(saveButton("Industrial"));
    await waitFor(() => expect(region(container)).toHaveTextContent("Plantilla de Industrial guardada."));
  });

  it("re-announces when the same factor is saved twice", async () => {
    const { user, container } = await loaded();
    const group = () => screen.getByRole("group", { name: "Media" });
    const field = () => within(group()).getByLabelText("Factor de escala Media") as HTMLInputElement;
    await typeInto(user, field(), "1.5");
    await user.click(within(group()).getByRole("button", { name: "Guardar" }));
    await waitFor(() => expect(region(container)).toHaveTextContent("Factor de escala Media guardado."));
    await typeInto(user, field(), "2");
    expect(region(container)).toBeEmptyDOMElement();
    await user.click(within(group()).getByRole("button", { name: "Guardar" }));
    await waitFor(() => expect(region(container)).toHaveTextContent("Factor de escala Media guardado."));
  });
});

describe("PlanSettingsEditor · scale factors", () => {
  const factorField = (label: string) =>
    within(screen.getByRole("group", { name: label })).getByLabelText(`Factor de escala ${label}`) as HTMLInputElement;
  const factorSave = (label: string) =>
    within(screen.getByRole("group", { name: label })).getByRole("button", { name: "Guardar" });

  it("renders one field per scale with the loaded factor", async () => {
    await loaded();
    expect(factorField("Pequeña")).toHaveValue(0.8);
    expect(factorField("Media")).toHaveValue(1);
    expect(factorField("Grande")).toHaveValue(1.3);
  });

  it("disables Guardar until a factor changes", async () => {
    const { user } = await loaded();
    expect(factorSave("Media")).toBeDisabled();
    await typeInto(user, factorField("Media"), "1.1");
    expect(factorSave("Media")).toBeEnabled();
    expect(factorSave("Pequeña")).toBeDisabled();
  });

  it("saves one factor as a number and announces it", async () => {
    const { user, updater, container } = await loaded();
    await typeInto(user, factorField("Pequeña"), "0.9");
    await user.click(factorSave("Pequeña"));
    expect(updater.updateScaleFactor).toHaveBeenCalledWith("small", 0.9);
    expect(updater.updateTemplate).not.toHaveBeenCalled();
    expect(await screen.findByText("Factor de escala Pequeña guardado.")).toBeInTheDocument();
    expect(container.querySelector('[aria-live="polite"]')).toHaveTextContent("Factor de escala Pequeña guardado.");
    expect(factorSave("Pequeña")).toBeDisabled();
  });

  it("disables Guardar while the factor save is in flight", async () => {
    let resolve!: () => void;
    const updater = {
      updateTemplate: jest.fn(),
      updateScaleFactor: jest.fn().mockReturnValue(new Promise<void>((r) => (resolve = r))),
    };
    const { user } = await loaded(setup({ updater }));
    await typeInto(user, factorField("Grande"), "2");
    await user.click(factorSave("Grande"));
    expect(factorSave("Grande")).toBeDisabled();
    await act(async () => resolve());
  });

  it("shows the server rejection next to the field and keeps the typed value", async () => {
    const updater = {
      updateTemplate: jest.fn(),
      updateScaleFactor: jest.fn().mockRejectedValue(new ApiError(422, "invalid_factor", FACTOR_MESSAGE)),
    };
    const { user } = await loaded(setup({ updater }));
    await typeInto(user, factorField("Grande"), "9");
    await user.click(factorSave("Grande"));
    const group = screen.getByRole("group", { name: "Grande" });
    const message = await within(group).findByText(FACTOR_MESSAGE);
    expect(factorField("Grande")).toHaveAttribute("aria-invalid", "true");
    expect(factorField("Grande").getAttribute("aria-describedby")?.split(" ")).toContain(message.id);
    expect(factorField("Grande")).toHaveValue(9);
    expect(factorSave("Grande")).toBeEnabled();
  });

  it.each([
    ["an empty field", ""],
    ["zero", "0"],
    ["a negative number", "-1"],
    ["more than 10", "10.5"],
    ["0.09 (just below the minimum)", "0.09"],
    ["1e-10", "1e-10"],
  ])("rejects %s in the client without calling the API", async (_name, value) => {
    const { user, updater } = await loaded();
    await typeInto(user, factorField("Media"), value);
    await user.click(factorSave("Media"));
    const message = await within(screen.getByRole("group", { name: "Media" })).findByText(FACTOR_MESSAGE);
    expect(updater.updateScaleFactor).not.toHaveBeenCalled();
    expect(factorField("Media")).toHaveAttribute("aria-invalid", "true");
    expect(factorField("Media").getAttribute("aria-describedby")?.split(" ")).toContain(message.id);
  });

  it("accepts the lower bound 0.1", async () => {
    const { user, updater } = await loaded();
    await typeInto(user, factorField("Media"), "0.1");
    await user.click(factorSave("Media"));
    expect(updater.updateScaleFactor).toHaveBeenCalledWith("medium", 0.1);
  });

  it("shows the generic message when the server answers 422 with a list detail (FastAPI validation)", async () => {
    // lib/api maps a non-{code,message} detail to unexpected_error; the editor must show that generic text.
    const updater = {
      updateTemplate: jest.fn(),
      updateScaleFactor: jest.fn().mockRejectedValue(new ApiError(422, "unexpected_error", UNEXPECTED)),
    };
    const { user } = await loaded(setup({ updater }));
    // 2 passes the client validation; the server (e.g. a 1e21 that slipped through) answers with a list detail.
    await typeInto(user, factorField("Grande"), "2");
    await user.click(factorSave("Grande"));
    const message = await within(screen.getByRole("group", { name: "Grande" })).findByText(UNEXPECTED);
    expect(factorField("Grande")).toHaveAttribute("aria-invalid", "true");
    expect(factorField("Grande").getAttribute("aria-describedby")?.split(" ")).toContain(message.id);
    expect(factorSave("Grande")).toBeEnabled();
  });

  it("accepts the upper bound 10", async () => {
    const { user, updater } = await loaded();
    await typeInto(user, factorField("Media"), "10");
    await user.click(factorSave("Media"));
    expect(updater.updateScaleFactor).toHaveBeenCalledWith("medium", 10);
  });
});

describe("PlanSettingsEditor · accessibility", () => {
  it("has no axe violations once loaded", async () => {
    const { container } = await loaded();
    expect(await axe(container)).toHaveNoViolations();
  });

  it("has no axe violations while loading", async () => {
    const fetcher = jest.fn().mockReturnValue(new Promise(() => {}));
    const { container } = setup({ fetcher });
    expect(await axe(container)).toHaveNoViolations();
  });

  it("has no axe violations in the load error state", async () => {
    const fetcher = jest.fn().mockRejectedValue(new ApiError(0, "network_error", NETWORK));
    const { container } = setup({ fetcher });
    await screen.findByRole("alert");
    expect(await axe(container)).toHaveNoViolations();
  });

  it("has no axe violations with a server error shown", async () => {
    const updater = {
      updateTemplate: jest.fn().mockRejectedValue(new ApiError(422, "invalid_weeks", WEEKS_MESSAGE)),
      updateScaleFactor: jest.fn(),
    };
    const { user, container } = await loaded(setup({ updater }));
    await typeInto(user, weekField("Industrial", 0), "4");
    await user.click(saveButton("Industrial"));
    await within(row("Industrial")).findByText(WEEKS_MESSAGE);
    expect(await axe(container)).toHaveNoViolations();
  });

  it("gives every input an accessible name", async () => {
    await loaded();
    const inputs = screen.getAllByRole("spinbutton");
    expect(inputs).toHaveLength(6 * 7 + 3);
    for (const input of inputs) expect(input).toHaveAccessibleName();
  });
});

describe("PlanSettingsEditor · keyboard", () => {
  it("Tab walks the seven fields of a row and then reaches an enabled Guardar", async () => {
    const { user } = await loaded();
    await user.tab();
    expect(weekField("Vivienda unifamiliar", 0)).toHaveFocus();
    await user.keyboard("{Control>}a{/Control}9");
    expect(weekField("Vivienda unifamiliar", 0)).toHaveValue(9);
    for (let index = 1; index < 7; index += 1) {
      await user.tab();
      expect(weekField("Vivienda unifamiliar", index)).toHaveFocus();
    }
    await user.tab();
    expect(saveButton("Vivienda unifamiliar")).toHaveFocus();
  });

  it("skips disabled Guardar buttons", async () => {
    await loaded();
    const user = userEvent.setup();
    weekField("Vivienda unifamiliar", 6).focus();
    await user.tab();
    // Guardar of the first row is disabled, so focus goes to the next row's first field.
    expect(weekField("Rehabilitación", 0)).toHaveFocus();
  });

  it("Enter on the focused Guardar saves the row", async () => {
    const { user, updater } = await loaded();
    await typeInto(user, weekField("Industrial", 0), "4");
    for (let index = 0; index < 6; index += 1) await user.tab();
    await user.tab();
    expect(saveButton("Industrial")).toHaveFocus();
    await user.keyboard("{Enter}");
    expect(updater.updateTemplate).toHaveBeenCalledWith("industrial", [4, 3, 5, 7, 10, 52, 5]);
  });

  it("Retry is reachable and works with the keyboard", async () => {
    const fetcher = jest
      .fn()
      .mockRejectedValueOnce(new ApiError(0, "network_error", NETWORK))
      .mockResolvedValueOnce(SETTINGS);
    const { user } = setup({ fetcher });
    await screen.findByRole("button", { name: "Reintentar" });
    await user.tab();
    expect(screen.getByRole("button", { name: "Reintentar" })).toHaveFocus();
    await user.keyboard("{Enter}");
    expect(await screen.findByRole("group", { name: "Industrial" })).toBeInTheDocument();
  });
});

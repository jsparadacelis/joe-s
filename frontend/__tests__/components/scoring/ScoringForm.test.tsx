import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { axe } from "jest-axe";
import { ScoringForm } from "@/components/scoring/ScoringForm";
import { ApiError } from "@/lib/api";
import { CRITERIA, CRITERION_LABELS, type Ratings, type Scoring, type ScoringRecord, type ScoringSettings } from "@/lib/scoring";

const all = <T,>(value: T) => Object.fromEntries(CRITERIA.map((c) => [c, value])) as Record<(typeof CRITERIA)[number], T>;
const SETTINGS: ScoringSettings = { weights: all(1), threshold: 60 };
const DECISION_TEXT = "La decisión de perseguir la oportunidad es de la persona; la recomendación no cambia el estado del proyecto.";

function record(overrides: Partial<ScoringRecord> = {}): ScoringRecord {
  return {
    projectCode: "PRY-2026-001",
    version: 1,
    ratings: all(3),
    weights: all(1),
    threshold: 60,
    score: 60,
    recommendation: "pursue",
    scoredBy: "Test user",
    scoredAt: "2026-10-24T10:00:00Z",
    ...overrides,
  };
}

function setup(props: { initial?: Scoring | null; save?: jest.Mock; settings?: ScoringSettings } = {}) {
  const save = props.save ?? jest.fn().mockResolvedValue(record());
  const user = userEvent.setup();
  const view = render(
    <ScoringForm code="PRY-2026-001" settings={props.settings ?? SETTINGS} initial={props.initial ?? null} save={save} />,
  );
  return { save, user, ...view };
}

const select = (criterion: (typeof CRITERIA)[number]) => screen.getByLabelText(CRITERION_LABELS[criterion]) as HTMLSelectElement;

async function rateAll(user: ReturnType<typeof userEvent.setup>, value: string, except?: (typeof CRITERIA)[number]) {
  for (const c of CRITERIA) if (c !== except) await user.selectOptions(select(c), value);
}

describe("ScoringForm fields", () => {
  it("renders one labelled selector per criterion with options 1 to 5", () => {
    setup();
    expect(screen.getAllByRole("combobox")).toHaveLength(7);
    for (const c of CRITERIA) {
      const options = within(select(c)).getAllByRole("option").map((o) => o.textContent);
      expect(options).toEqual(["Selecciona", "1", "2", "3", "4", "5"]);
      expect(select(c)).toBeRequired();
    }
  });

  it("explains the scale and shows the threshold in use", () => {
    setup();
    expect(screen.getByText(/1 es la peor valoración y 5 la mejor/i)).toBeInTheDocument();
    expect(screen.getByText("Umbral de recomendación: 60")).toBeInTheDocument();
  });

  it("starts from the ratings of the latest scoring", () => {
    const initial: Scoring = { ...record({ ratings: { ...all(4), budget: 2 } }), history: [] };
    setup({ initial });
    expect(select("client_fit")).toHaveValue("4");
    expect(select("budget")).toHaveValue("2");
  });
});

describe("live score and recommendation", () => {
  it("asks to complete the criteria before showing a score", () => {
    setup();
    expect(screen.getByText("Completa los siete criterios para ver la nota.")).toBeInTheDocument();
    expect(screen.queryByText(/Recomendación:/)).not.toBeInTheDocument();
  });

  it("shows 60,0 and «perseguir» with everything at 3 (limit of the threshold)", async () => {
    const { user } = setup();
    await rateAll(user, "3");
    expect(screen.getByText("Nota: 60,0 sobre 100")).toBeInTheDocument();
    expect(screen.getByText("Recomendación: perseguir")).toBeInTheDocument();
  });

  it("shows «no perseguir» below the threshold and updates live", async () => {
    const { user } = setup();
    await rateAll(user, "3");
    await user.selectOptions(select("client_fit"), "1");
    // 100 · (1 + 18) / 35 = 54.285… -> 54,3
    expect(screen.getByText("Nota: 54,3 sobre 100")).toBeInTheDocument();
    expect(screen.getByText("Recomendación: no perseguir")).toBeInTheDocument();
  });

  it("always states that the decision belongs to the person", async () => {
    const { user } = setup();
    expect(screen.getByText(DECISION_TEXT)).toBeInTheDocument();
    await rateAll(user, "5");
    expect(screen.getByText(DECISION_TEXT)).toBeInTheDocument();
  });

  it("uses the configured weights and threshold", async () => {
    const settings: ScoringSettings = { weights: { ...all(1), client_fit: 4 }, threshold: 80 };
    const { user } = setup({ settings });
    await rateAll(user, "3", "client_fit");
    await user.selectOptions(select("client_fit"), "5");
    // 100 · (20 + 18) / 50 = 76
    expect(screen.getByText("Nota: 76,0 sobre 100")).toBeInTheDocument();
    expect(screen.getByText("Recomendación: no perseguir")).toBeInTheDocument();
  });

  it("is inside a polite live region", () => {
    setup();
    expect(screen.getByText("Completa los siete criterios para ver la nota.").closest("[aria-live='polite']")).not.toBeNull();
  });
});

describe("saving", () => {
  it("does not call the API and focuses the first missing criterion", async () => {
    const { user, save } = setup();
    await rateAll(user, "3", "location");
    await user.click(screen.getByRole("button", { name: "Guardar puntuación" }));
    expect(save).not.toHaveBeenCalled();
    expect(await screen.findByText("Puntúa el criterio «Localización» de 1 a 5.")).toBeInTheDocument();
    expect(select("location")).toHaveFocus();
    expect(select("location")).toHaveAttribute("aria-invalid", "true");
    expect(select("location")).toHaveAccessibleDescription("Puntúa el criterio «Localización» de 1 a 5.");
  });

  it("clears the field error when the criterion is rated", async () => {
    const { user } = setup();
    await user.click(screen.getByRole("button", { name: "Guardar puntuación" }));
    await user.selectOptions(select("client_fit"), "2");
    expect(screen.queryByText("Puntúa el criterio «Encaje del cliente» de 1 a 5.")).not.toBeInTheDocument();
  });

  it("sends integer ratings and shows what the API returned, not the live value", async () => {
    const save = jest.fn().mockResolvedValue(record({ score: 61, version: 3, scoredBy: "Ana Test" }));
    const { user } = setup({ save });
    await rateAll(user, "3");
    await user.click(screen.getByRole("button", { name: "Guardar puntuación" }));
    const sent: Ratings = save.mock.calls[0][0];
    expect(sent).toEqual(all(3));
    const panel = await screen.findByRole("region", { name: "Última puntuación" });
    expect(within(panel).getByText("Versión 3")).toBeInTheDocument();
    expect(within(panel).getByText("Nota: 61,0 sobre 100")).toBeInTheDocument();
    expect(within(panel).getByText("Recomendación: perseguir")).toBeInTheDocument();
    expect(within(panel).getByText(/Ana Test/)).toBeInTheDocument();
  });

  it("announces the save politely, adds the version to the history and returns focus to the form", async () => {
    const { user } = setup();
    await rateAll(user, "3");
    await user.click(screen.getByRole("button", { name: "Guardar puntuación" }));
    const status = await screen.findByText("Puntuación guardada: versión 1, nota 60,0.");
    expect(status.closest("[aria-live='polite']")).not.toBeNull();
    const table = screen.getByRole("table", { name: "Historial de puntuaciones" });
    expect(within(table).getAllByRole("row")).toHaveLength(2);
    expect(within(table).getByText("v1")).toBeInTheDocument();
    expect(within(table).getByText("perseguir")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Guardar puntuación" })).toHaveFocus();
  });

  it("puts the newest version first in the history", async () => {
    const initial: Scoring = {
      ...record({ version: 1 }),
      history: [{ version: 1, score: 40, recommendation: "do_not_pursue", scoredAt: "2026-10-23T09:00:00Z" }],
    };
    const save = jest.fn().mockResolvedValue(record({ version: 2 }));
    const { user } = setup({ initial, save });
    await user.click(screen.getByRole("button", { name: "Guardar puntuación" }));
    await screen.findByText("Puntuación guardada: versión 2, nota 60,0.");
    const rows = within(screen.getByRole("table", { name: "Historial de puntuaciones" })).getAllByRole("row");
    expect(within(rows[1]).getByText("v2")).toBeInTheDocument();
    expect(within(rows[2]).getByText("v1")).toBeInTheDocument();
  });

  it("disables the button while saving and ignores a second submit", async () => {
    let resolve: (r: ScoringRecord) => void = () => undefined;
    const save = jest.fn().mockReturnValue(new Promise<ScoringRecord>((r) => (resolve = r)));
    const { user } = setup({ save });
    await rateAll(user, "3");
    await user.click(screen.getByRole("button", { name: "Guardar puntuación" }));
    const busy = screen.getByRole("button", { name: "Guardando…" });
    expect(busy).toBeDisabled();
    await user.click(busy);
    expect(save).toHaveBeenCalledTimes(1);
    resolve(record());
    await screen.findByText("Puntuación guardada: versión 1, nota 60,0.");
  });
});

describe("API errors in Spanish", () => {
  it("422 invalid_ratings with field: shows the message next to that selector and focuses it", async () => {
    const save = jest.fn().mockRejectedValue(new ApiError(422, "invalid_ratings", "La puntuación de «Presupuesto» debe ser un entero entre 1 y 5.", "budget"));
    const { user } = setup({ save });
    await rateAll(user, "3");
    await user.click(screen.getByRole("button", { name: "Guardar puntuación" }));
    const message = await screen.findByText("La puntuación de «Presupuesto» debe ser un entero entre 1 y 5.");
    expect(message).toHaveAttribute("role", "alert");
    expect(select("budget")).toHaveAccessibleDescription(message.textContent ?? "");
    expect(select("budget")).toHaveAttribute("aria-invalid", "true");
    expect(select("budget")).toHaveFocus();
    expect(screen.queryByRole("region", { name: "Última puntuación" })).not.toBeInTheDocument();
  });

  it.each([
    [409, "not_an_opportunity", "Solo se puede puntuar una oportunidad (fase 0)."],
    [404, "project_not_found", "No existe el proyecto PRY-2026-001."],
  ])("%s %s: shows a focused alert at form level", async (status, code, message) => {
    const save = jest.fn().mockRejectedValue(new ApiError(status, code, message));
    const { user } = setup({ save });
    await rateAll(user, "3");
    await user.click(screen.getByRole("button", { name: "Guardar puntuación" }));
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(message);
    expect(alert).toHaveFocus();
    for (const c of CRITERIA) expect(select(c)).not.toHaveAttribute("aria-invalid");
  });

  it("422 without field: form-level alert", async () => {
    const save = jest.fn().mockRejectedValue(new ApiError(422, "invalid_ratings", "El cuerpo no es válido."));
    const { user } = setup({ save });
    await rateAll(user, "3");
    await user.click(screen.getByRole("button", { name: "Guardar puntuación" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("El cuerpo no es válido.");
  });

  it("unexpected failures show the generic Spanish message and keep the ratings", async () => {
    const save = jest.fn().mockRejectedValue(new Error("boom"));
    const { user } = setup({ save });
    await rateAll(user, "3");
    await user.click(screen.getByRole("button", { name: "Guardar puntuación" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Ocurrió un error inesperado. Inténtalo de nuevo.");
    expect(select("client_fit")).toHaveValue("3");
    expect(screen.getByRole("button", { name: "Guardar puntuación" })).toBeEnabled();
  });

  it("a successful retry removes the previous error", async () => {
    const save = jest.fn().mockRejectedValueOnce(new ApiError(409, "not_an_opportunity", "Solo se puede puntuar una oportunidad (fase 0).")).mockResolvedValue(record());
    const { user } = setup({ save });
    await rateAll(user, "3");
    await user.click(screen.getByRole("button", { name: "Guardar puntuación" }));
    await screen.findByRole("alert");
    await user.click(screen.getByRole("button", { name: "Guardar puntuación" }));
    await waitFor(() => expect(screen.queryByRole("alert")).not.toBeInTheDocument());
  });
});

describe("history", () => {
  it("says there are no scorings yet", () => {
    setup();
    expect(screen.getByText("Sin puntuaciones todavía")).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Última puntuación" })).not.toBeInTheDocument();
  });

  it("lists each version with score, recommendation and date (UTC)", () => {
    const initial: Scoring = {
      ...record({ version: 2 }),
      history: [
        { version: 2, score: 60, recommendation: "pursue", scoredAt: "2026-10-24T10:00:00Z" },
        { version: 1, score: 40.5, recommendation: "do_not_pursue", scoredAt: "2026-10-23T09:05:00Z" },
      ],
    };
    setup({ initial });
    const table = screen.getByRole("table", { name: "Historial de puntuaciones" });
    const rows = within(table).getAllByRole("row");
    expect(rows).toHaveLength(3);
    expect(within(rows[2]).getByText("v1")).toBeInTheDocument();
    expect(within(rows[2]).getByText("40,5")).toBeInTheDocument();
    expect(within(rows[2]).getByText("no perseguir")).toBeInTheDocument();
    expect(within(rows[2]).getByText("23/10/2026 09:05")).toBeInTheDocument();
  });

  it("notes that changing weights or threshold does not alter saved scorings", () => {
    setup();
    expect(screen.getByText(/Cambiar los pesos o el umbral no altera las puntuaciones ya guardadas/)).toBeInTheDocument();
  });
});

describe("accessibility", () => {
  it("has no axe violations (empty, with errors and saved)", async () => {
    const { user, container } = setup();
    expect(await axe(container)).toHaveNoViolations();
    await user.click(screen.getByRole("button", { name: "Guardar puntuación" }));
    expect(await axe(container)).toHaveNoViolations();
    await rateAll(user, "3");
    await user.click(screen.getByRole("button", { name: "Guardar puntuación" }));
    await screen.findByRole("region", { name: "Última puntuación" });
    expect(await axe(container)).toHaveNoViolations();
  });
});

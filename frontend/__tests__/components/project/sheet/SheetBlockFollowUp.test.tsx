/**
 * RGB-17b Tester follow-ups on <SheetBlock>: focus after an error (finding 2), retry and wait notice when the
 * proposed plan loads (finding 3) and half-typed dates (finding 7).
 */
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SheetBlock } from "@/components/project/sheet/SheetBlock";
import { ApiError } from "@/lib/api";
import type { ProjectSheet, SheetBlockData } from "@/lib/sheet";
import { API_SHEET } from "../../../helpers/sheet-fixtures";

const block = (id: string) => API_SHEET.blocks.find((b) => b.block === id) as unknown as SheetBlockData;
const SAVED = API_SHEET as unknown as ProjectSheet;
const region = (name: string) => screen.getByRole("region", { name });
const edit = (name: string) => within(region(name)).getByRole("button", { name: /^Editar/ });
const plan = { projectType: "single_family_house", scale: "large", weeksByPhase: [3, 4, 6, 8, 9, 40, 5], total: 75 };

function setup(id: string, props: Record<string, unknown> = {}) {
  const save = jest.fn().mockResolvedValue(SAVED);
  const utils = render(<SheetBlock block={block(id)} code="PRY-2026-001" editable save={save} {...props} />);
  return { save, user: userEvent.setup(), ...utils };
}

describe("focus after a save error", () => {
  it.each([
    new ApiError(403, "no_authority", "Solo un socio o un director puede editar la ficha."),
    new ApiError(409, "sheet_not_editable", "La ficha solo se edita mientras el proyecto está en Inicio."),
    new ApiError(422, "invalid_weeks", "Semanas no válidas."),
    new Error("boom"),
  ])("%s moves focus to the alert", async (error) => {
    const { user } = setup("governance", { save: jest.fn().mockRejectedValue(error) });
    await user.click(edit("Gobierno"));
    await user.type(screen.getByLabelText("Promotor"), "x");
    await user.click(screen.getByRole("button", { name: "Guardar" }));
    const alert = await within(region("Gobierno")).findByRole("alert");
    await waitFor(() => expect(alert).toHaveFocus());
    expect(alert).toHaveAttribute("tabindex", "-1");
  });
});

describe("proposed plan loading", () => {
  async function openScale(loadPlan: jest.Mock) {
    const utils = setup("identification", { loadPlan });
    await utils.user.click(edit("Identificación"));
    await utils.user.selectOptions(screen.getByLabelText("Escala"), "Grande");
    return utils;
  }

  it("a failed load offers «Reintentar» next to «Cancelar»; retrying loads the plan", async () => {
    const loadPlan = jest.fn().mockRejectedValueOnce(new ApiError(500, "unexpected_error", "No se pudo calcular el plan.")).mockResolvedValue(plan);
    const { user } = await openScale(loadPlan);
    await screen.findByRole("alert");
    expect(screen.getByRole("button", { name: "Cancelar" })).toBeEnabled();
    await user.click(screen.getByRole("button", { name: "Reintentar" }));
    expect(await screen.findByRole("button", { name: "Confirmar recálculo" })).toBeInTheDocument();
    expect(loadPlan).toHaveBeenCalledTimes(2);
    expect(loadPlan).toHaveBeenLastCalledWith("single_family_house", "large");
    expect(screen.queryByRole("button", { name: "Reintentar" })).not.toBeInTheDocument();
  });

  it("Enter while the plan loads shows a live notice instead of being ignored", async () => {
    const loadPlan = jest.fn().mockReturnValue(new Promise(() => {}));
    const { user, save } = await openScale(loadPlan);
    await user.type(screen.getByLabelText("Referencia catastral"), "x{Enter}");
    expect(screen.getByText("Espera a que termine de calcularse el plan")).toBeInTheDocument();
    expect(screen.getByText("Espera a que termine de calcularse el plan").closest("[aria-live], [role=status]")).not.toBeNull();
    expect(save).not.toHaveBeenCalled();
  });
});

describe("half-typed dates", () => {
  it("a date input with badInput is not sent: the field is marked «Fecha incompleta» and focused", async () => {
    const { user, save } = setup("engagement");
    await user.click(edit("Encargo"));
    const date = screen.getByLabelText("Fecha de firma del contrato");
    Object.defineProperty(date, "validity", { value: { badInput: true }, configurable: true });
    await user.type(screen.getByLabelText("Alcance incluido"), "Obra de prueba");
    await user.click(screen.getByRole("button", { name: "Guardar" }));
    expect(save).not.toHaveBeenCalled();
    expect(date).toHaveAttribute("aria-invalid", "true");
    expect(document.getElementById(date.getAttribute("aria-describedby")!)).toHaveTextContent("Fecha incompleta");
    expect(date).toHaveFocus();
  });

  it("completing the date clears the error", async () => {
    const { user } = setup("engagement");
    await user.click(edit("Encargo"));
    const date = screen.getByLabelText("Fecha de firma del contrato");
    Object.defineProperty(date, "validity", { value: { badInput: true }, configurable: true });
    await user.type(screen.getByLabelText("Alcance incluido"), "x");
    await user.click(screen.getByRole("button", { name: "Guardar" }));
    fireEvent.change(date, { target: { value: "2026-11-03" } });
    expect(screen.queryByText("Fecha incompleta")).not.toBeInTheDocument();
  });
});

describe("native validation", () => {
  it("the form opts out of the browser tooltip so our own messages are shown", async () => {
    const { user, container } = setup("engagement");
    await user.click(edit("Encargo"));
    expect(container.querySelector("form")).toHaveAttribute("novalidate");
  });
});

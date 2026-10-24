import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { axe } from "jest-axe";
import { PhaseDeliverableForm } from "@/components/project/PhaseDeliverableForm";
import type { PhaseDeliverable } from "@/lib/projects";

const deliverable = (over: Partial<PhaseDeliverable> = {}): PhaseDeliverable => ({
  phase: 2,
  frozenVersion: null,
  fields: [
    { id: "title", label: "Título del briefing", type: "text", value: "Vivienda (ejemplo)" },
    { id: "notas", label: "Notas del concepto", type: "textarea", value: "Texto de ejemplo" },
    { id: "entrega", label: "Fecha de entrega", type: "date", value: "2026-03-01" },
  ],
  ...over,
});

const LABELS = ["Título del briefing", "Notas del concepto", "Fecha de entrega"];
const blocked = (el: HTMLElement) =>
  (el as HTMLInputElement).readOnly === true || (el as HTMLInputElement).disabled === true;

describe("FaseEntregable · edición", () => {
  it("muestra los tres tipos de campo con su etiqueta y valor", () => {
    render(<PhaseDeliverableForm deliverable={deliverable()} mode="edit" />);
    const text = screen.getByLabelText("Título del briefing");
    const area = screen.getByLabelText("Notas del concepto");
    const date = screen.getByLabelText("Fecha de entrega");
    expect(text.tagName).toBe("INPUT");
    expect(text).toHaveValue("Vivienda (ejemplo)");
    expect(area.tagName).toBe("TEXTAREA");
    expect(area).toHaveValue("Texto de ejemplo");
    expect(date).toHaveAttribute("type", "date");
    expect(date).toHaveValue("2026-03-01");
  });

  it("los campos son editables", async () => {
    const user = userEvent.setup();
    render(<PhaseDeliverableForm deliverable={deliverable()} mode="edit" />);
    for (const e of LABELS) expect(blocked(screen.getByLabelText(e))).toBe(false);
    const text = screen.getByLabelText("Título del briefing");
    await user.clear(text);
    await user.type(text, "Nuevo título");
    expect(text).toHaveValue("Nuevo título");
    const area = screen.getByLabelText("Notas del concepto");
    await user.type(area, " más");
    expect(area).toHaveValue("Texto de ejemplo más");
    const date = screen.getByLabelText("Fecha de entrega");
    fireEvent.change(date, { target: { value: "2026-04-15" } });
    expect(date).toHaveValue("2026-04-15");
  });

  it("el botón «Guardar» llama a onGuardar", async () => {
    const user = userEvent.setup();
    const onSave = jest.fn();
    render(<PhaseDeliverableForm deliverable={deliverable()} mode="edit" onSave={onSave} />);
    await user.click(screen.getByRole("button", { name: "Guardar" }));
    expect(onSave).toHaveBeenCalledTimes(1);
  });

  it("Guardar sin onGuardar no falla", async () => {
    const user = userEvent.setup();
    render(<PhaseDeliverableForm deliverable={deliverable()} mode="edit" />);
    await expect(user.click(screen.getByRole("button", { name: "Guardar" }))).resolves.not.toThrow();
  });

  it("no muestra versión congelada", () => {
    render(<PhaseDeliverableForm deliverable={deliverable()} mode="edit" />);
    expect(screen.queryByText(/congelada/i)).not.toBeInTheDocument();
  });

  it("con lista de campos vacía no falla y sigue ofreciendo Guardar", () => {
    render(<PhaseDeliverableForm deliverable={deliverable({ fields: [] })} mode="edit" />);
    expect(screen.queryAllByRole("textbox")).toHaveLength(0);
    expect(screen.getByRole("button", { name: "Guardar" })).toBeInTheDocument();
  });

  it("sin violaciones de accesibilidad", async () => {
    const { container } = render(<PhaseDeliverableForm deliverable={deliverable()} mode="edit" />);
    expect(await axe(container)).toHaveNoViolations();
  });
});

describe("FaseEntregable · solo lectura", () => {
  const props = { deliverable: deliverable({ frozenVersion: "v1" }), mode: "read-only" as const };

  it("todos los campos son readOnly o disabled y conservan su valor", () => {
    render(<PhaseDeliverableForm {...props} />);
    for (const e of LABELS) expect(blocked(screen.getByLabelText(e))).toBe(true);
    expect(screen.getByLabelText("Título del briefing")).toHaveValue("Vivienda (ejemplo)");
  });

  it("no se puede escribir en los campos", async () => {
    const user = userEvent.setup();
    render(<PhaseDeliverableForm {...props} />);
    await user.type(screen.getByLabelText("Título del briefing"), "xyz");
    await user.type(screen.getByLabelText("Notas del concepto"), "xyz");
    expect(screen.getByLabelText("Título del briefing")).toHaveValue("Vivienda (ejemplo)");
    expect(screen.getByLabelText("Notas del concepto")).toHaveValue("Texto de ejemplo");
  });

  it("no hay botón «Guardar»", () => {
    render(<PhaseDeliverableForm {...props} />);
    expect(screen.queryByRole("button", { name: "Guardar" })).not.toBeInTheDocument();
  });

  it("muestra la versión congelada", () => {
    render(<PhaseDeliverableForm {...props} />);
    expect(screen.getByText(/v1/)).toBeInTheDocument();
    expect(screen.getByText(/congelada/i)).toBeInTheDocument();
  });

  it("onGuardar nunca se llama", async () => {
    const onSave = jest.fn();
    render(<PhaseDeliverableForm {...props} onSave={onSave} />);
    await userEvent.setup().keyboard("{Enter}");
    expect(onSave).not.toHaveBeenCalled();
  });

  it("con lista de campos vacía no falla", () => {
    render(<PhaseDeliverableForm deliverable={deliverable({ frozenVersion: "v1", fields: [] })} mode="read-only" />);
    expect(screen.queryAllByRole("textbox")).toHaveLength(0);
  });

  it("sin violaciones de accesibilidad", async () => {
    const { container } = render(<PhaseDeliverableForm {...props} />);
    expect(await axe(container)).toHaveNoViolations();
  });
});

describe("FaseEntregable · vista previa", () => {
  const props = { deliverable: deliverable(), mode: "preview" as const };

  it("todos los campos están disabled", () => {
    render(<PhaseDeliverableForm {...props} />);
    for (const e of LABELS) expect(screen.getByLabelText(e)).toBeDisabled();
  });

  it("no hay botón «Guardar»", () => {
    render(<PhaseDeliverableForm {...props} />);
    expect(screen.queryByRole("button", { name: "Guardar" })).not.toBeInTheDocument();
  });

  it("no se puede escribir", async () => {
    const user = userEvent.setup();
    render(<PhaseDeliverableForm {...props} />);
    await user.type(screen.getByLabelText("Título del briefing"), "xyz");
    expect(screen.getByLabelText("Título del briefing")).toHaveValue("Vivienda (ejemplo)");
  });

  it("no muestra versión congelada", () => {
    render(<PhaseDeliverableForm {...props} />);
    expect(screen.queryByText(/congelada/i)).not.toBeInTheDocument();
  });

  it("con lista de campos vacía no falla", () => {
    render(<PhaseDeliverableForm deliverable={deliverable({ fields: [] })} mode="preview" />);
    expect(screen.queryAllByRole("textbox")).toHaveLength(0);
  });

  it("sin violaciones de accesibilidad", async () => {
    const { container } = render(<PhaseDeliverableForm {...props} />);
    expect(await axe(container)).toHaveNoViolations();
  });
});

describe("FaseEntregable · el envío del formulario nunca guarda fuera de edición (Tester)", () => {
  it.each(["read-only", "preview"] as const)("%s: submit forzado y Enter en un campo no llaman a onGuardar", async (mode) => {
    const onSave = jest.fn();
    const { container } = render(<PhaseDeliverableForm deliverable={deliverable({ frozenVersion: "v1" })} mode={mode} onSave={onSave} />);
    const form = container.querySelector("form") as HTMLFormElement;
    fireEvent.submit(form);
    screen.getByLabelText("Título del briefing").focus();
    await userEvent.setup().keyboard("{Enter}");
    expect(onSave).not.toHaveBeenCalled();
    expect(screen.queryByRole("button", { name: /guardar/i })).toBeNull();
  });
});

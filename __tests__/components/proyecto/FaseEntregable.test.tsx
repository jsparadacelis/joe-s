import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { axe } from "jest-axe";
import { FaseEntregable } from "@/components/proyecto/FaseEntregable";
import type { EntregableFase } from "@/lib/proyectos";

const entregable = (over: Partial<EntregableFase> = {}): EntregableFase => ({
  fase: 2,
  versionCongelada: null,
  campos: [
    { id: "titulo", etiqueta: "Título del briefing", tipo: "texto", valor: "Vivienda (ejemplo)" },
    { id: "notas", etiqueta: "Notas del concepto", tipo: "area", valor: "Texto de ejemplo" },
    { id: "entrega", etiqueta: "Fecha de entrega", tipo: "fecha", valor: "2026-03-01" },
  ],
  ...over,
});

const ETIQUETAS = ["Título del briefing", "Notas del concepto", "Fecha de entrega"];
const blocked = (el: HTMLElement) =>
  (el as HTMLInputElement).readOnly === true || (el as HTMLInputElement).disabled === true;

describe("FaseEntregable · edición", () => {
  it("muestra los tres tipos de campo con su etiqueta y valor", () => {
    render(<FaseEntregable entregable={entregable()} modo="edicion" />);
    const texto = screen.getByLabelText("Título del briefing");
    const area = screen.getByLabelText("Notas del concepto");
    const fecha = screen.getByLabelText("Fecha de entrega");
    expect(texto.tagName).toBe("INPUT");
    expect(texto).toHaveValue("Vivienda (ejemplo)");
    expect(area.tagName).toBe("TEXTAREA");
    expect(area).toHaveValue("Texto de ejemplo");
    expect(fecha).toHaveAttribute("type", "date");
    expect(fecha).toHaveValue("2026-03-01");
  });

  it("los campos son editables", async () => {
    const user = userEvent.setup();
    render(<FaseEntregable entregable={entregable()} modo="edicion" />);
    for (const e of ETIQUETAS) expect(blocked(screen.getByLabelText(e))).toBe(false);
    const texto = screen.getByLabelText("Título del briefing");
    await user.clear(texto);
    await user.type(texto, "Nuevo título");
    expect(texto).toHaveValue("Nuevo título");
    const area = screen.getByLabelText("Notas del concepto");
    await user.type(area, " más");
    expect(area).toHaveValue("Texto de ejemplo más");
    const fecha = screen.getByLabelText("Fecha de entrega");
    fireEvent.change(fecha, { target: { value: "2026-04-15" } });
    expect(fecha).toHaveValue("2026-04-15");
  });

  it("el botón «Guardar» llama a onGuardar", async () => {
    const user = userEvent.setup();
    const onGuardar = jest.fn();
    render(<FaseEntregable entregable={entregable()} modo="edicion" onGuardar={onGuardar} />);
    await user.click(screen.getByRole("button", { name: "Guardar" }));
    expect(onGuardar).toHaveBeenCalledTimes(1);
  });

  it("Guardar sin onGuardar no falla", async () => {
    const user = userEvent.setup();
    render(<FaseEntregable entregable={entregable()} modo="edicion" />);
    await expect(user.click(screen.getByRole("button", { name: "Guardar" }))).resolves.not.toThrow();
  });

  it("no muestra versión congelada", () => {
    render(<FaseEntregable entregable={entregable()} modo="edicion" />);
    expect(screen.queryByText(/congelada/i)).not.toBeInTheDocument();
  });

  it("con lista de campos vacía no falla y sigue ofreciendo Guardar", () => {
    render(<FaseEntregable entregable={entregable({ campos: [] })} modo="edicion" />);
    expect(screen.queryAllByRole("textbox")).toHaveLength(0);
    expect(screen.getByRole("button", { name: "Guardar" })).toBeInTheDocument();
  });

  it("sin violaciones de accesibilidad", async () => {
    const { container } = render(<FaseEntregable entregable={entregable()} modo="edicion" />);
    expect(await axe(container)).toHaveNoViolations();
  });
});

describe("FaseEntregable · solo lectura", () => {
  const props = { entregable: entregable({ versionCongelada: "v1" }), modo: "solo-lectura" as const };

  it("todos los campos son readOnly o disabled y conservan su valor", () => {
    render(<FaseEntregable {...props} />);
    for (const e of ETIQUETAS) expect(blocked(screen.getByLabelText(e))).toBe(true);
    expect(screen.getByLabelText("Título del briefing")).toHaveValue("Vivienda (ejemplo)");
  });

  it("no se puede escribir en los campos", async () => {
    const user = userEvent.setup();
    render(<FaseEntregable {...props} />);
    await user.type(screen.getByLabelText("Título del briefing"), "xyz");
    await user.type(screen.getByLabelText("Notas del concepto"), "xyz");
    expect(screen.getByLabelText("Título del briefing")).toHaveValue("Vivienda (ejemplo)");
    expect(screen.getByLabelText("Notas del concepto")).toHaveValue("Texto de ejemplo");
  });

  it("no hay botón «Guardar»", () => {
    render(<FaseEntregable {...props} />);
    expect(screen.queryByRole("button", { name: "Guardar" })).not.toBeInTheDocument();
  });

  it("muestra la versión congelada", () => {
    render(<FaseEntregable {...props} />);
    expect(screen.getByText(/v1/)).toBeInTheDocument();
    expect(screen.getByText(/congelada/i)).toBeInTheDocument();
  });

  it("onGuardar nunca se llama", async () => {
    const onGuardar = jest.fn();
    render(<FaseEntregable {...props} onGuardar={onGuardar} />);
    await userEvent.setup().keyboard("{Enter}");
    expect(onGuardar).not.toHaveBeenCalled();
  });

  it("con lista de campos vacía no falla", () => {
    render(<FaseEntregable entregable={entregable({ versionCongelada: "v1", campos: [] })} modo="solo-lectura" />);
    expect(screen.queryAllByRole("textbox")).toHaveLength(0);
  });

  it("sin violaciones de accesibilidad", async () => {
    const { container } = render(<FaseEntregable {...props} />);
    expect(await axe(container)).toHaveNoViolations();
  });
});

describe("FaseEntregable · vista previa", () => {
  const props = { entregable: entregable(), modo: "vista-previa" as const };

  it("todos los campos están disabled", () => {
    render(<FaseEntregable {...props} />);
    for (const e of ETIQUETAS) expect(screen.getByLabelText(e)).toBeDisabled();
  });

  it("no hay botón «Guardar»", () => {
    render(<FaseEntregable {...props} />);
    expect(screen.queryByRole("button", { name: "Guardar" })).not.toBeInTheDocument();
  });

  it("no se puede escribir", async () => {
    const user = userEvent.setup();
    render(<FaseEntregable {...props} />);
    await user.type(screen.getByLabelText("Título del briefing"), "xyz");
    expect(screen.getByLabelText("Título del briefing")).toHaveValue("Vivienda (ejemplo)");
  });

  it("no muestra versión congelada", () => {
    render(<FaseEntregable {...props} />);
    expect(screen.queryByText(/congelada/i)).not.toBeInTheDocument();
  });

  it("con lista de campos vacía no falla", () => {
    render(<FaseEntregable entregable={entregable({ campos: [] })} modo="vista-previa" />);
    expect(screen.queryAllByRole("textbox")).toHaveLength(0);
  });

  it("sin violaciones de accesibilidad", async () => {
    const { container } = render(<FaseEntregable {...props} />);
    expect(await axe(container)).toHaveNoViolations();
  });
});

describe("FaseEntregable · el envío del formulario nunca guarda fuera de edición (Tester)", () => {
  it.each(["solo-lectura", "vista-previa"] as const)("%s: submit forzado y Enter en un campo no llaman a onGuardar", async (modo) => {
    const onGuardar = jest.fn();
    const { container } = render(<FaseEntregable entregable={entregable({ versionCongelada: "v1" })} modo={modo} onGuardar={onGuardar} />);
    const form = container.querySelector("form") as HTMLFormElement;
    fireEvent.submit(form);
    screen.getByLabelText("Título del briefing").focus();
    await userEvent.setup().keyboard("{Enter}");
    expect(onGuardar).not.toHaveBeenCalled();
    expect(screen.queryByRole("button", { name: /guardar/i })).toBeNull();
  });
});

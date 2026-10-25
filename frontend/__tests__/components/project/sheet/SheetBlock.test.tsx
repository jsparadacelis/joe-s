/**
 * RGB-17a contract of `@/components/project/sheet/SheetBlock` (to be created by the front developer):
 *   <SheetBlock block={SheetBlockData} />   (SheetBlockData from `@/lib/sheet`)
 * Renders <section> labelled by an <h3> with the Spanish block name (role region); a status text
 * «Completo» or «Faltan N» («Falta 1» for one); fields as <li> of a list showing «<label>» and the value;
 * required empty field: text «Obligatorio · falta»; source scoring: text «del scoring»; optional: no «Obligatorio».
 */
import { render, screen, within } from "@testing-library/react";
import { axe } from "jest-axe";
import { SheetBlock } from "@/components/project/sheet/SheetBlock";
import type { SheetBlockData } from "@/lib/sheet";
import { API_PLAN_VALUE, API_SHEET } from "../../../helpers/sheet-fixtures";

const block = (id: string) => API_SHEET.blocks.find((b) => b.block === id) as unknown as SheetBlockData;
const item = (label: string) => {
  const li = screen.getAllByRole("listitem").find((x) => x.textContent?.includes(label));
  if (!li) throw new Error(`No field «${label}»`);
  return li;
};

describe("<SheetBlock>", () => {
  it("is a region named by an h3 with the Spanish block name", () => {
    render(<SheetBlock block={block("identification")} />);
    const region = screen.getByRole("region", { name: "Identificación" });
    expect(within(region).getByRole("heading", { level: 3, name: "Identificación" })).toBeInTheDocument();
  });

  it("shows «Faltan N» when required fields are missing (N = required - filled)", () => {
    render(<SheetBlock block={block("engagement")} />);
    expect(screen.getByText("Faltan 3")).toBeInTheDocument();
    expect(screen.queryByText("Completo")).not.toBeInTheDocument();
  });

  it("uses the singular for one missing field", () => {
    render(<SheetBlock block={block("identification")} />);
    expect(screen.getByText("Falta 1")).toBeInTheDocument();
  });

  it("shows «Completo» when the block is complete and no «Faltan»", () => {
    render(<SheetBlock block={block("status")} />);
    expect(screen.getByText("Completo")).toBeInTheDocument();
    expect(screen.queryByText(/Falta/)).not.toBeInTheDocument();
  });

  it("marks every empty required field with text, not only color", () => {
    render(<SheetBlock block={block("engagement")} />);
    for (const label of ["Alcance incluido", "Alcance excluido", "Fecha de firma del contrato"]) {
      expect(within(item(label)).getByText("Obligatorio · falta")).toBeInTheDocument();
    }
    expect(screen.getAllByText("Obligatorio · falta")).toHaveLength(3);
  });

  it("shows the value of a filled field and does not mark it as missing", () => {
    render(<SheetBlock block={block("identification")} />);
    const name = item("Nombre");
    expect(name).toHaveTextContent("Casa de prueba");
    expect(within(name).queryByText(/falta/i)).not.toBeInTheDocument();
    expect(screen.getAllByText("Obligatorio · falta")).toHaveLength(1);
    expect(within(item("Referencia catastral")).getByText("Obligatorio · falta")).toBeInTheDocument();
  });

  it("labels the preloaded fields «del scoring» and no others", () => {
    render(<SheetBlock block={block("identification")} />);
    for (const label of ["Cliente", "Ubicación", "Tipología", "Escala"]) {
      expect(within(item(label)).getByText(/del scoring/i)).toBeInTheDocument();
    }
    expect(within(item("Nombre")).queryByText(/del scoring/i)).not.toBeInTheDocument();
    expect(within(item("Referencia catastral")).queryByText(/del scoring/i)).not.toBeInTheDocument();
    expect(screen.getAllByText(/del scoring/i)).toHaveLength(4);
  });

  it("optional fields have no required mark even when empty", () => {
    render(<SheetBlock block={block("governance")} />);
    for (const label of ["Equipo", "Colaboradores externos"]) {
      expect(within(item(label)).queryByText(/obligatorio/i)).not.toBeInTheDocument();
    }
  });

  it("renders every field of the block as a list item", () => {
    render(<SheetBlock block={block("governance")} />);
    expect(screen.getAllByRole("listitem")).toHaveLength(5);
  });

  it("shows enumerated values in Spanish, never the raw id", () => {
    render(<SheetBlock block={block("identification")} />);
    expect(within(item("Tipología")).getByText("Vivienda unifamiliar")).toBeInTheDocument();
    expect(within(item("Escala")).getByText("Media")).toBeInTheDocument();
    expect(screen.queryByText("single_family_house")).not.toBeInTheDocument();
    expect(screen.queryByText("medium")).not.toBeInTheDocument();
  });

  it.each([
    ["green", "En plazo"],
    ["amber", "Atención"],
    ["red", "Plan superado"],
  ])("traffic light %s is shown as «%s»", (value, text) => {
    const status = { ...block("status"), fields: [{ field: "traffic_light", required: false, value, source: "auto" }] } as unknown as SheetBlockData;
    render(<SheetBlock block={status} />);
    expect(within(item("Semáforo")).getByText(text)).toBeInTheDocument();
    expect(screen.queryByText(value)).not.toBeInTheDocument();
  });

  it.each([
    ["rehabilitation", "Rehabilitación"],
    ["multi_family", "Plurifamiliar"],
    ["facility", "Dotacional"],
    ["industrial", "Industrial"],
    ["renovation_interiors", "Reforma de interiores"],
  ])("project type %s is shown as «%s»", (value, text) => {
    const b = { ...block("identification"), fields: [{ field: "project_type", required: true, value, source: "scoring" }] } as unknown as SheetBlockData;
    render(<SheetBlock block={b} />);
    expect(within(item("Tipología")).getByText(text)).toBeInTheDocument();
  });

  it.each([["small", "Pequeña"], ["large", "Grande"]])("scale %s is shown as «%s»", (value, text) => {
    const b = { ...block("identification"), fields: [{ field: "scale", required: true, value, source: "scoring" }] } as unknown as SheetBlockData;
    render(<SheetBlock block={b} />);
    expect(within(item("Escala")).getByText(text)).toBeInTheDocument();
  });

  it("shows the confirmed plan: total in weeks and the breakdown by phase", () => {
    render(<SheetBlock block={block("timing")} />);
    const plan = item("Plan confirmado");
    expect(within(plan).getByText(/65 semanas/)).toBeInTheDocument();
    expect(within(plan).getByText(/del scoring/i)).toBeInTheDocument();
    expect(within(plan).queryByText("Obligatorio · falta")).not.toBeInTheDocument();
    const rows = within(plan).getAllByRole("listitem");
    expect(rows).toHaveLength(7);
    const expected: [string, string][] = [
      ["Inicio", "5 semanas"], ["Briefing y concepto", "8 semanas"], ["Anteproyecto", "10 semanas"],
      ["Proyecto básico", "12 semanas"], ["Proyecto de ejecución", "15 semanas"], ["Obra", "10 semanas"], ["Cierre", "5 semanas"],
    ];
    expected.forEach(([name, weeks], i) => {
      expect(rows[i]).toHaveTextContent(name);
      expect(rows[i]).toHaveTextContent(weeks);
    });
  });

  it("uses «1 semana» in the singular", () => {
    const plan = { weeks_by_phase: Object.fromEntries([1, 2, 3, 4, 5, 6, 7].map((n) => [String(n), 1])), total: 7 };
    expect(API_PLAN_VALUE.total).toBe(65);
    const b = { ...block("timing"), fields: [{ field: "confirmed_plan", required: true, value: plan, source: "scoring" }] } as unknown as SheetBlockData;
    render(<SheetBlock block={b} />);
    const rows = within(item("Plan confirmado")).getAllByRole("listitem");
    expect(rows[0]).toHaveTextContent("1 semana");
    expect(rows[0]).not.toHaveTextContent("1 semanas");
    expect(within(item("Plan confirmado")).getByText(/7 semanas/)).toBeInTheDocument();
  });

  it("a null plan is an empty required field marked with text and without breakdown", () => {
    const b = { ...block("timing"), filled: 0, fields: block("timing").fields.map((f) => (f.field === "confirmed_plan" ? { ...f, value: null } : f)) } as SheetBlockData;
    render(<SheetBlock block={b} />);
    const plan = item("Plan confirmado");
    expect(within(plan).getByText("Obligatorio · falta")).toBeInTheDocument();
    expect(within(plan).queryByRole("listitem")).not.toBeInTheDocument();
    expect(plan).not.toHaveTextContent(/semanas/);
    expect(screen.getByText("Faltan 3")).toBeInTheDocument();
  });

  it("auto fields say «automático» in text and are not labelled «del scoring»", () => {
    render(<SheetBlock block={block("identification")} />);
    for (const label of ["Código", "Nombre"]) {
      expect(within(item(label)).getByText(/automático/i)).toBeInTheDocument();
      expect(within(item(label)).queryByText(/del scoring/i)).not.toBeInTheDocument();
    }
    expect(screen.getAllByText(/automático/i)).toHaveLength(2);
  });

  it("a scoring field without value gets no «del scoring» label, only the missing mark", () => {
    const b = { ...block("identification"), fields: [{ field: "client", required: true, value: null, source: "scoring" }] } as unknown as SheetBlockData;
    render(<SheetBlock block={b} />);
    expect(screen.queryByText(/del scoring/i)).not.toBeInTheDocument();
    expect(within(item("Cliente")).getByText("Obligatorio · falta")).toBeInTheDocument();
  });

  it("an empty optional traffic light is not marked as missing", () => {
    const b = { ...block("status"), fields: [{ field: "traffic_light", required: false, value: null, source: "auto" }] } as unknown as SheetBlockData;
    render(<SheetBlock block={b} />);
    expect(screen.queryByText(/obligatorio/i)).not.toBeInTheDocument();
    expect(screen.getByText("Completo")).toBeInTheDocument();
  });

  it("the «del scoring» label of the plan sits next to the total, before the breakdown", () => {
    render(<SheetBlock block={block("timing")} />);
    const plan = item("Plan confirmado");
    const mark = within(plan).getByText(/del scoring/i);
    const breakdown = within(plan).getAllByRole("listitem")[0].parentElement as HTMLElement;
    expect(breakdown.contains(mark)).toBe(false);
    expect(mark.compareDocumentPosition(breakdown) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("long values without spaces can wrap instead of overflowing", () => {
    const long = "x".repeat(300);
    const b = { ...block("engagement"), fields: [{ field: "scope_included", required: true, value: long, source: "manual" }] } as unknown as SheetBlockData;
    render(<SheetBlock block={b} />);
    const value = screen.getByText(long);
    expect(value.className).toMatch(/break-words|break-all/);
    expect(item("Alcance incluido").className).toMatch(/min-w-0/);
  });

  it.each(["identification", "engagement", "governance", "timing", "status"])("%s has no accessibility violations", async (id) => {
    const { container } = render(<SheetBlock block={block(id)} />);
    expect(await axe(container)).toHaveNoViolations();
  });
});

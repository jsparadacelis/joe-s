import { DEFINITIONS, requery, type TechnicalDatum } from "@/lib/technical-data";

const list = (value: string, original: string | null): TechnicalDatum[] =>
  DEFINITIONS.map((d) => ({ id: d.id, value, original, verified: false }));

describe("reconsultar · manuales por grupo (regresión)", () => {
  it("datos de parcela y condiciones sin original (ruta manual) se sustituyen; planeamiento se conserva", () => {
    const current = list("MANUAL", null);
    const incoming = DEFINITIONS.map((d) => ({
      id: d.id,
      value: d.group === "planning" ? "" : "ORIGEN",
      original: d.group === "planning" ? null : "ORIGEN",
      verified: false,
    }));
    for (const d of requery(current, incoming)) {
      const group = DEFINITIONS.find((x) => x.id === d.id)!.group;
      if (group === "planning") expect(d).toMatchObject({ value: "MANUAL", original: null });
      else expect(d).toMatchObject({ value: "ORIGEN", original: "ORIGEN" });
    }
  });
});

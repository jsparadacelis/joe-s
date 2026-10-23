import { DEFINICIONES, reconsultar, type DatoTecnico } from "@/lib/datos-tecnicos";

const lista = (valor: string, original: string | null): DatoTecnico[] =>
  DEFINICIONES.map((d) => ({ id: d.id, valor, original, verificado: false }));

describe("reconsultar · manuales por grupo (regresión)", () => {
  it("datos de parcela y condiciones sin original (ruta manual) se sustituyen; planeamiento se conserva", () => {
    const actual = lista("MANUAL", null);
    const nuevos = DEFINICIONES.map((d) => ({
      id: d.id,
      valor: d.grupo === "planeamiento" ? "" : "ORIGEN",
      original: d.grupo === "planeamiento" ? null : "ORIGEN",
      verificado: false,
    }));
    for (const d of reconsultar(actual, nuevos)) {
      const grupo = DEFINICIONES.find((x) => x.id === d.id)!.grupo;
      if (grupo === "planeamiento") expect(d).toMatchObject({ valor: "MANUAL", original: null });
      else expect(d).toMatchObject({ valor: "ORIGEN", original: "ORIGEN" });
    }
  });
});

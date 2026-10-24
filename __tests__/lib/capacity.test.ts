import { calculateCapacity, formatNumber, parseNumber } from "@/lib/capacity";
import type { TechnicalDatum } from "@/lib/technical-data";

const IDS = ["builtArea", "cadastralPlotArea", "polygonPlotArea", "buildability", "maxOccupancy", "floors", "minPlot", "calcArea"] as const;

/** Datos con solo los ids que usa el cálculo; los no indicados quedan vacíos. */
function data(v: Partial<Record<(typeof IDS)[number], string>>): TechnicalDatum[] {
  return IDS.map((id) => ({ id, value: v[id] ?? "", original: null, verified: false }));
}

describe("parseNumero", () => {
  it.each([
    ["1.240,5", 1240.5],
    ["1.240", 1240],
    ["99,4", 99.4],
    ["1,5", 1.5],
    ["70", 70],
    ["0", 0],
    [" 12 ", 12],
  ])("%j -> %p", (entrada, esperado) => {
    expect(parseNumber(entrada)).toBe(esperado);
  });

  it.each([[""], ["   "], ["abc"], ["m²"]])("%j -> null", (entrada) => {
    expect(parseNumber(entrada)).toBeNull();
  });

  it("null o undefined -> null sin lanzar", () => {
    expect(parseNumber(null as unknown as string)).toBeNull();
    expect(parseNumber(undefined as unknown as string)).toBeNull();
  });
});

describe("formatearNumero", () => {
  it("formato es-ES con coma decimal y puntos de millar", () => {
    expect(formatNumber(12345.67, 1)).toBe("12.345,7");
    expect(formatNumber(1.5, 1)).toBe("1,5");
  });
  it("sin decimales por defecto (redondea)", () => {
    expect(formatNumber(99.4)).toBe("99");
    expect(formatNumber(99.6)).toBe("100");
  });
  it("los decimales sobrantes no se rellenan con ceros", () => {
    expect(formatNumber(150, 1)).toBe("150");
  });
  it("null -> «—»", () => {
    expect(formatNumber(null)).toBe("—");
    expect(formatNumber(null, 2)).toBe("—");
  });
  it("cero es un número, no «—»", () => {
    expect(formatNumber(0)).toBe("0");
  });
});

describe("calcularCapacidad", () => {
  it("limita ocupación × plantas cuando el techo por edificabilidad es mayor", () => {
    // superficie 100; techo 100×2=200; huella 100×50/100=50; ×3 plantas=150
    const c = calculateCapacity(data({ cadastralPlotArea: "100", buildability: "2", maxOccupancy: "50", floors: "PB+2", calcArea: "Catastral", builtArea: "60", minPlot: "80" }));
    expect(c).not.toBeNull();
    expect(c!.surface).toBe(100);
    expect(c!.buildableArea).toBe(200);
    expect(c!.footprint).toBe(50);
    expect(c!.byFloors).toBe(150);
    expect(c!.maximum).toBe(150);
    expect(c!.limitedBy).toBe("occupancy-floors");
    expect(c!.existing).toBe(60);
    expect(c!.minPlot).toBe(80);
    expect(c!.meetsMinPlot).toBe(true);
  });

  it("limita edificabilidad cuando el techo es menor", () => {
    // techo 100×1=100; huella 60; ×2=120
    const c = calculateCapacity(data({ cadastralPlotArea: "100", buildability: "1", maxOccupancy: "60", floors: "PB+1", calcArea: "Catastral" }))!;
    expect(c.buildableArea).toBe(100);
    expect(c.footprint).toBe(60);
    expect(c.byFloors).toBe(120);
    expect(c.maximum).toBe(100);
    expect(c.limitedBy).toBe("buildability");
  });

  it("empate entre techo y huella × plantas: limita «Edificabilidad»", () => {
    // techo 200; huella 50 ×4 = 200
    const c = calculateCapacity(data({ cadastralPlotArea: "100", buildability: "2", maxOccupancy: "50", floors: "PB+3", calcArea: "Catastral" }))!;
    expect(c.buildableArea).toBe(200);
    expect(c.byFloors).toBe(200);
    expect(c.maximum).toBe(200);
    expect(c.limitedBy).toBe("buildability");
  });

  it("scalc «Polígono» usa la superficie del polígono (spp)", () => {
    // superficie 80; techo 160; huella 40; ×1=40
    const c = calculateCapacity(data({ cadastralPlotArea: "100", polygonPlotArea: "80", buildability: "2", maxOccupancy: "50", floors: "PB", calcArea: "Polígono" }))!;
    expect(c.surface).toBe(80);
    expect(c.buildableArea).toBe(160);
    expect(c.footprint).toBe(40);
    expect(c.byFloors).toBe(40);
    expect(c.maximum).toBe(40);
    expect(c.limitedBy).toBe("occupancy-floors");
  });

  it.each(["Catastral", "Topográfico", ""])("scalc %j usa la superficie del Catastro (spc)", (area) => {
    const c = calculateCapacity(data({ cadastralPlotArea: "100", polygonPlotArea: "80", buildability: "2", maxOccupancy: "50", floors: "PB", calcArea: area }))!;
    expect(c.surface).toBe(100);
  });

  it.each([
    ["PB", 1],
    ["PB+1", 2],
    ["PB+2", 3],
    ["PB+3", 4],
    ["PB+4", 5],
    ["PB+5", 6],
  ])("plantas %s multiplica la huella por %i", (floors, n) => {
    // edificabilidad enorme para que nunca limite; huella = 100×10/100 = 10
    const c = calculateCapacity(data({ cadastralPlotArea: "100", buildability: "100", maxOccupancy: "10", floors, calcArea: "Catastral" }))!;
    expect(c.footprint).toBe(10);
    expect(c.byFloors).toBe(10 * n);
    expect(c.maximum).toBe(10 * n);
    expect(c.limitedBy).toBe("occupancy-floors");
  });

  it("acepta decimales con coma", () => {
    // 99,4 × 1,5 = 149,1; huella 99,4×70/100 = 69,58; ×3 = 208,74
    const c = calculateCapacity(data({ cadastralPlotArea: "99,4", buildability: "1,5", maxOccupancy: "70", floors: "PB+2", calcArea: "Catastral" }))!;
    expect(c.buildableArea).toBeCloseTo(149.1, 6);
    expect(c.footprint).toBeCloseTo(69.58, 6);
    expect(c.byFloors).toBeCloseTo(208.74, 6);
    expect(c.maximum).toBeCloseTo(149.1, 6);
    expect(c.limitedBy).toBe("buildability");
  });

  describe("parcela mínima y existente", () => {
    const base = { cadastralPlotArea: "100", buildability: "2", maxOccupancy: "50", floors: "PB+2", calcArea: "Catastral" } as const;
    it("no cumple si la superficie es menor que la parcela mínima", () => {
      const c = calculateCapacity(data({ ...base, minPlot: "150" }))!;
      expect(c.minPlot).toBe(150);
      expect(c.meetsMinPlot).toBe(false);
    });
    it("cumple si la superficie es igual a la parcela mínima", () => {
      const c = calculateCapacity(data({ ...base, minPlot: "100" }))!;
      expect(c.meetsMinPlot).toBe(true);
    });
    it("compara con la superficie de cálculo elegida (Polígono)", () => {
      const c = calculateCapacity(data({ ...base, polygonPlotArea: "90", calcArea: "Polígono", minPlot: "95" }))!;
      expect(c.meetsMinPlot).toBe(false);
    });
    it("sin parcela mínima: parcelaMinima y cumple son null", () => {
      const c = calculateCapacity(data(base))!;
      expect(c.minPlot).toBeNull();
      expect(c.meetsMinPlot).toBeNull();
    });
    it("sin superficie construida: existente es null", () => {
      expect(calculateCapacity(data(base))!.existing).toBeNull();
    });
  });

  describe("devuelve null si falta un dato imprescindible", () => {
    const full = { cadastralPlotArea: "100", polygonPlotArea: "90", buildability: "2", maxOccupancy: "50", floors: "PB+2", calcArea: "Catastral" } as const;
    it("el caso completo calcula", () => {
      expect(calculateCapacity(data(full))).not.toBeNull();
    });
    it("sin superficie del Catastro", () => {
      expect(calculateCapacity(data({ ...full, cadastralPlotArea: "" }))).toBeNull();
    });
    it("scalc Polígono sin superficie del polígono", () => {
      expect(calculateCapacity(data({ ...full, calcArea: "Polígono", polygonPlotArea: "" }))).toBeNull();
    });
    it("sin edificabilidad", () => {
      expect(calculateCapacity(data({ ...full, buildability: "" }))).toBeNull();
    });
    it("sin ocupación", () => {
      expect(calculateCapacity(data({ ...full, maxOccupancy: "" }))).toBeNull();
    });
    it("sin número de plantas", () => {
      expect(calculateCapacity(data({ ...full, floors: "" }))).toBeNull();
    });
    it("valor no numérico en la edificabilidad", () => {
      expect(calculateCapacity(data({ ...full, buildability: "abc" }))).toBeNull();
    });
    it("lista de datos vacía", () => {
      expect(calculateCapacity([])).toBeNull();
    });
  });

  it("no muta los datos de entrada", () => {
    const d = data({ cadastralPlotArea: "100", buildability: "2", maxOccupancy: "50", floors: "PB+2" });
    const copyOf = JSON.parse(JSON.stringify(d));
    calculateCapacity(d);
    expect(d).toEqual(copyOf);
  });
});

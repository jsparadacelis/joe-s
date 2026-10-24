import { calculateCapacity, formatNumber, parseNumber } from "@/lib/capacity";
import type { TechnicalDatum } from "@/lib/technical-data";

const IDS = ["builtArea", "cadastralPlotArea", "polygonPlotArea", "buildability", "maxOccupancy", "floors", "minPlot", "calcArea"] as const;

/** Data with only the ids used by the calculation; the ones not given stay empty. */
function data(v: Partial<Record<(typeof IDS)[number], string>>): TechnicalDatum[] {
  return IDS.map((id) => ({ id, value: v[id] ?? "", original: null, verified: false }));
}

describe("parseNumber", () => {
  it.each([
    ["1.240,5", 1240.5],
    ["1.240", 1240],
    ["99,4", 99.4],
    ["1,5", 1.5],
    ["70", 70],
    ["0", 0],
    [" 12 ", 12],
  ])("%j -> %p", (input, expected) => {
    expect(parseNumber(input)).toBe(expected);
  });

  it.each([[""], ["   "], ["abc"], ["m²"]])("%j -> null", (input) => {
    expect(parseNumber(input)).toBeNull();
  });

  it("null or undefined -> null without throwing", () => {
    expect(parseNumber(null as unknown as string)).toBeNull();
    expect(parseNumber(undefined as unknown as string)).toBeNull();
  });
});

describe("formatNumber", () => {
  it("es-ES format with decimal comma and thousands dots", () => {
    expect(formatNumber(12345.67, 1)).toBe("12.345,7");
    expect(formatNumber(1.5, 1)).toBe("1,5");
  });
  it("no decimals by default (rounds)", () => {
    expect(formatNumber(99.4)).toBe("99");
    expect(formatNumber(99.6)).toBe("100");
  });
  it("surplus decimals are not padded with zeros", () => {
    expect(formatNumber(150, 1)).toBe("150");
  });
  it("null -> «—»", () => {
    expect(formatNumber(null)).toBe("—");
    expect(formatNumber(null, 2)).toBe("—");
  });
  it("zero is a number, not «—»", () => {
    expect(formatNumber(0)).toBe("0");
  });
});

describe("calculateCapacity", () => {
  it("limited by occupancy × floors when the buildability ceiling is larger", () => {
    // surface 100; ceiling 100×2=200; footprint 100×50/100=50; ×3 floors=150
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

  it("limited by buildability when the ceiling is smaller", () => {
    // ceiling 100×1=100; footprint 60; ×2=120
    const c = calculateCapacity(data({ cadastralPlotArea: "100", buildability: "1", maxOccupancy: "60", floors: "PB+1", calcArea: "Catastral" }))!;
    expect(c.buildableArea).toBe(100);
    expect(c.footprint).toBe(60);
    expect(c.byFloors).toBe(120);
    expect(c.maximum).toBe(100);
    expect(c.limitedBy).toBe("buildability");
  });

  it("tie between ceiling and footprint × floors: limited by «Edificabilidad»", () => {
    // ceiling 200; footprint 50 ×4 = 200
    const c = calculateCapacity(data({ cadastralPlotArea: "100", buildability: "2", maxOccupancy: "50", floors: "PB+3", calcArea: "Catastral" }))!;
    expect(c.buildableArea).toBe(200);
    expect(c.byFloors).toBe(200);
    expect(c.maximum).toBe(200);
    expect(c.limitedBy).toBe("buildability");
  });

  it("calcArea «Polígono» uses the polygon surface (polygonPlotArea)", () => {
    // surface 80; ceiling 160; footprint 40; ×1=40
    const c = calculateCapacity(data({ cadastralPlotArea: "100", polygonPlotArea: "80", buildability: "2", maxOccupancy: "50", floors: "PB", calcArea: "Polígono" }))!;
    expect(c.surface).toBe(80);
    expect(c.buildableArea).toBe(160);
    expect(c.footprint).toBe(40);
    expect(c.byFloors).toBe(40);
    expect(c.maximum).toBe(40);
    expect(c.limitedBy).toBe("occupancy-floors");
  });

  it.each(["Catastral", "Topográfico", ""])("calcArea %j uses the Catastro surface (cadastralPlotArea)", (area) => {
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
  ])("floors %s multiplies the footprint by %i", (floors, n) => {
    // huge buildability so it never limits; footprint = 100×10/100 = 10
    const c = calculateCapacity(data({ cadastralPlotArea: "100", buildability: "100", maxOccupancy: "10", floors, calcArea: "Catastral" }))!;
    expect(c.footprint).toBe(10);
    expect(c.byFloors).toBe(10 * n);
    expect(c.maximum).toBe(10 * n);
    expect(c.limitedBy).toBe("occupancy-floors");
  });

  it("accepts decimals with a comma", () => {
    // 99,4 × 1,5 = 149,1; footprint 99,4×70/100 = 69,58; ×3 = 208,74
    const c = calculateCapacity(data({ cadastralPlotArea: "99,4", buildability: "1,5", maxOccupancy: "70", floors: "PB+2", calcArea: "Catastral" }))!;
    expect(c.buildableArea).toBeCloseTo(149.1, 6);
    expect(c.footprint).toBeCloseTo(69.58, 6);
    expect(c.byFloors).toBeCloseTo(208.74, 6);
    expect(c.maximum).toBeCloseTo(149.1, 6);
    expect(c.limitedBy).toBe("buildability");
  });

  describe("minimum plot and existing", () => {
    const base = { cadastralPlotArea: "100", buildability: "2", maxOccupancy: "50", floors: "PB+2", calcArea: "Catastral" } as const;
    it("does not meet it if the surface is smaller than the minimum plot", () => {
      const c = calculateCapacity(data({ ...base, minPlot: "150" }))!;
      expect(c.minPlot).toBe(150);
      expect(c.meetsMinPlot).toBe(false);
    });
    it("meets it if the surface equals the minimum plot", () => {
      const c = calculateCapacity(data({ ...base, minPlot: "100" }))!;
      expect(c.meetsMinPlot).toBe(true);
    });
    it("compares with the chosen calculation surface (Polígono)", () => {
      const c = calculateCapacity(data({ ...base, polygonPlotArea: "90", calcArea: "Polígono", minPlot: "95" }))!;
      expect(c.meetsMinPlot).toBe(false);
    });
    it("without a minimum plot: minPlot and meetsMinPlot are null", () => {
      const c = calculateCapacity(data(base))!;
      expect(c.minPlot).toBeNull();
      expect(c.meetsMinPlot).toBeNull();
    });
    it("without built surface: existing is null", () => {
      expect(calculateCapacity(data(base))!.existing).toBeNull();
    });
  });

  describe("returns null if an essential datum is missing", () => {
    const full = { cadastralPlotArea: "100", polygonPlotArea: "90", buildability: "2", maxOccupancy: "50", floors: "PB+2", calcArea: "Catastral" } as const;
    it("the complete case calculates", () => {
      expect(calculateCapacity(data(full))).not.toBeNull();
    });
    it("without the Catastro surface", () => {
      expect(calculateCapacity(data({ ...full, cadastralPlotArea: "" }))).toBeNull();
    });
    it("calcArea Polígono without polygon surface", () => {
      expect(calculateCapacity(data({ ...full, calcArea: "Polígono", polygonPlotArea: "" }))).toBeNull();
    });
    it("without buildability", () => {
      expect(calculateCapacity(data({ ...full, buildability: "" }))).toBeNull();
    });
    it("without occupancy", () => {
      expect(calculateCapacity(data({ ...full, maxOccupancy: "" }))).toBeNull();
    });
    it("without number of floors", () => {
      expect(calculateCapacity(data({ ...full, floors: "" }))).toBeNull();
    });
    it("non-numeric value in buildability", () => {
      expect(calculateCapacity(data({ ...full, buildability: "abc" }))).toBeNull();
    });
    it("empty data list", () => {
      expect(calculateCapacity([])).toBeNull();
    });
  });

  it("does not mutate the input data", () => {
    const d = data({ cadastralPlotArea: "100", buildability: "2", maxOccupancy: "50", floors: "PB+2" });
    const copyOf = JSON.parse(JSON.stringify(d));
    calculateCapacity(d);
    expect(d).toEqual(copyOf);
  });
});

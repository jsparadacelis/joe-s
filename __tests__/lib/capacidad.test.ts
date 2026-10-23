import { calcularCapacidad, formatearNumero, parseNumero } from "@/lib/capacidad";
import type { DatoTecnico } from "@/lib/datos-tecnicos";

const IDS = ["sc", "spc", "spp", "edif", "ocup", "plantas", "pmin", "scalc"] as const;

/** Datos con solo los ids que usa el cálculo; los no indicados quedan vacíos. */
function datos(v: Partial<Record<(typeof IDS)[number], string>>): DatoTecnico[] {
  return IDS.map((id) => ({ id, valor: v[id] ?? "", original: null, verificado: false }));
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
    expect(parseNumero(entrada)).toBe(esperado);
  });

  it.each([[""], ["   "], ["abc"], ["m²"]])("%j -> null", (entrada) => {
    expect(parseNumero(entrada)).toBeNull();
  });

  it("null o undefined -> null sin lanzar", () => {
    expect(parseNumero(null as unknown as string)).toBeNull();
    expect(parseNumero(undefined as unknown as string)).toBeNull();
  });
});

describe("formatearNumero", () => {
  it("formato es-ES con coma decimal y puntos de millar", () => {
    expect(formatearNumero(12345.67, 1)).toBe("12.345,7");
    expect(formatearNumero(1.5, 1)).toBe("1,5");
  });
  it("sin decimales por defecto (redondea)", () => {
    expect(formatearNumero(99.4)).toBe("99");
    expect(formatearNumero(99.6)).toBe("100");
  });
  it("los decimales sobrantes no se rellenan con ceros", () => {
    expect(formatearNumero(150, 1)).toBe("150");
  });
  it("null -> «—»", () => {
    expect(formatearNumero(null)).toBe("—");
    expect(formatearNumero(null, 2)).toBe("—");
  });
  it("cero es un número, no «—»", () => {
    expect(formatearNumero(0)).toBe("0");
  });
});

describe("calcularCapacidad", () => {
  it("limita ocupación × plantas cuando el techo por edificabilidad es mayor", () => {
    // superficie 100; techo 100×2=200; huella 100×50/100=50; ×3 plantas=150
    const c = calcularCapacidad(datos({ spc: "100", edif: "2", ocup: "50", plantas: "PB+2", scalc: "Catastral", sc: "60", pmin: "80" }));
    expect(c).not.toBeNull();
    expect(c!.superficie).toBe(100);
    expect(c!.techo).toBe(200);
    expect(c!.huella).toBe(50);
    expect(c!.porPlantas).toBe(150);
    expect(c!.maximo).toBe(150);
    expect(c!.limita).toBe("Ocupación × plantas");
    expect(c!.existente).toBe(60);
    expect(c!.parcelaMinima).toBe(80);
    expect(c!.cumpleParcelaMinima).toBe(true);
  });

  it("limita edificabilidad cuando el techo es menor", () => {
    // techo 100×1=100; huella 60; ×2=120
    const c = calcularCapacidad(datos({ spc: "100", edif: "1", ocup: "60", plantas: "PB+1", scalc: "Catastral" }))!;
    expect(c.techo).toBe(100);
    expect(c.huella).toBe(60);
    expect(c.porPlantas).toBe(120);
    expect(c.maximo).toBe(100);
    expect(c.limita).toBe("Edificabilidad");
  });

  it("empate entre techo y huella × plantas: limita «Edificabilidad»", () => {
    // techo 200; huella 50 ×4 = 200
    const c = calcularCapacidad(datos({ spc: "100", edif: "2", ocup: "50", plantas: "PB+3", scalc: "Catastral" }))!;
    expect(c.techo).toBe(200);
    expect(c.porPlantas).toBe(200);
    expect(c.maximo).toBe(200);
    expect(c.limita).toBe("Edificabilidad");
  });

  it("scalc «Polígono» usa la superficie del polígono (spp)", () => {
    // superficie 80; techo 160; huella 40; ×1=40
    const c = calcularCapacidad(datos({ spc: "100", spp: "80", edif: "2", ocup: "50", plantas: "PB", scalc: "Polígono" }))!;
    expect(c.superficie).toBe(80);
    expect(c.techo).toBe(160);
    expect(c.huella).toBe(40);
    expect(c.porPlantas).toBe(40);
    expect(c.maximo).toBe(40);
    expect(c.limita).toBe("Ocupación × plantas");
  });

  it.each(["Catastral", "Topográfico", ""])("scalc %j usa la superficie del Catastro (spc)", (scalc) => {
    const c = calcularCapacidad(datos({ spc: "100", spp: "80", edif: "2", ocup: "50", plantas: "PB", scalc }))!;
    expect(c.superficie).toBe(100);
  });

  it.each([
    ["PB", 1],
    ["PB+1", 2],
    ["PB+2", 3],
    ["PB+3", 4],
    ["PB+4", 5],
    ["PB+5", 6],
  ])("plantas %s multiplica la huella por %i", (plantas, n) => {
    // edificabilidad enorme para que nunca limite; huella = 100×10/100 = 10
    const c = calcularCapacidad(datos({ spc: "100", edif: "100", ocup: "10", plantas, scalc: "Catastral" }))!;
    expect(c.huella).toBe(10);
    expect(c.porPlantas).toBe(10 * n);
    expect(c.maximo).toBe(10 * n);
    expect(c.limita).toBe("Ocupación × plantas");
  });

  it("acepta decimales con coma", () => {
    // 99,4 × 1,5 = 149,1; huella 99,4×70/100 = 69,58; ×3 = 208,74
    const c = calcularCapacidad(datos({ spc: "99,4", edif: "1,5", ocup: "70", plantas: "PB+2", scalc: "Catastral" }))!;
    expect(c.techo).toBeCloseTo(149.1, 6);
    expect(c.huella).toBeCloseTo(69.58, 6);
    expect(c.porPlantas).toBeCloseTo(208.74, 6);
    expect(c.maximo).toBeCloseTo(149.1, 6);
    expect(c.limita).toBe("Edificabilidad");
  });

  describe("parcela mínima y existente", () => {
    const base = { spc: "100", edif: "2", ocup: "50", plantas: "PB+2", scalc: "Catastral" } as const;
    it("no cumple si la superficie es menor que la parcela mínima", () => {
      const c = calcularCapacidad(datos({ ...base, pmin: "150" }))!;
      expect(c.parcelaMinima).toBe(150);
      expect(c.cumpleParcelaMinima).toBe(false);
    });
    it("cumple si la superficie es igual a la parcela mínima", () => {
      const c = calcularCapacidad(datos({ ...base, pmin: "100" }))!;
      expect(c.cumpleParcelaMinima).toBe(true);
    });
    it("compara con la superficie de cálculo elegida (Polígono)", () => {
      const c = calcularCapacidad(datos({ ...base, spp: "90", scalc: "Polígono", pmin: "95" }))!;
      expect(c.cumpleParcelaMinima).toBe(false);
    });
    it("sin parcela mínima: parcelaMinima y cumple son null", () => {
      const c = calcularCapacidad(datos(base))!;
      expect(c.parcelaMinima).toBeNull();
      expect(c.cumpleParcelaMinima).toBeNull();
    });
    it("sin superficie construida: existente es null", () => {
      expect(calcularCapacidad(datos(base))!.existente).toBeNull();
    });
  });

  describe("devuelve null si falta un dato imprescindible", () => {
    const completo = { spc: "100", spp: "90", edif: "2", ocup: "50", plantas: "PB+2", scalc: "Catastral" } as const;
    it("el caso completo calcula", () => {
      expect(calcularCapacidad(datos(completo))).not.toBeNull();
    });
    it("sin superficie del Catastro", () => {
      expect(calcularCapacidad(datos({ ...completo, spc: "" }))).toBeNull();
    });
    it("scalc Polígono sin superficie del polígono", () => {
      expect(calcularCapacidad(datos({ ...completo, scalc: "Polígono", spp: "" }))).toBeNull();
    });
    it("sin edificabilidad", () => {
      expect(calcularCapacidad(datos({ ...completo, edif: "" }))).toBeNull();
    });
    it("sin ocupación", () => {
      expect(calcularCapacidad(datos({ ...completo, ocup: "" }))).toBeNull();
    });
    it("sin número de plantas", () => {
      expect(calcularCapacidad(datos({ ...completo, plantas: "" }))).toBeNull();
    });
    it("valor no numérico en la edificabilidad", () => {
      expect(calcularCapacidad(datos({ ...completo, edif: "abc" }))).toBeNull();
    });
    it("lista de datos vacía", () => {
      expect(calcularCapacidad([])).toBeNull();
    });
  });

  it("no muta los datos de entrada", () => {
    const d = datos({ spc: "100", edif: "2", ocup: "50", plantas: "PB+2" });
    const copia = JSON.parse(JSON.stringify(d));
    calcularCapacidad(d);
    expect(d).toEqual(copia);
  });
});

import { FASES } from "@/lib/fases";
import {
  ETIQUETA_MOTIVO,
  ETIQUETA_SEMAFORO,
  obtenerPlanTiempos,
  porcentajeConsumo,
  semaforoConsumo,
  type MotivoPausa,
  type Semaforo,
} from "@/lib/tiempos";

const ISO = /^\d{4}-\d{2}-\d{2}$/;
const esFechaIso = (s: string) => ISO.test(s) && !Number.isNaN(Date.parse(s)) && new Date(s).toISOString().startsWith(s);

describe("porcentajeConsumo", () => {
  it.each([
    [0, 5, 0],
    [1, 5, 20],
    [4, 5, 80],
    [5, 5, 100],
    [6, 5, 120],
    [3, 2, 150],
    [1, 3, 33],
    [2, 3, 67],
    [29, 36, 81],
    [30, 36, 83],
    [4, 3, 133],
  ])("%i activas de %i de plan = %i %%", (activas, plan, esperado) => {
    expect(porcentajeConsumo(activas, plan)).toBe(esperado);
  });

  it("redondea al entero más cercano (0,5 sube)", () => {
    expect(porcentajeConsumo(1, 8)).toBe(13); // 12,5
    expect(porcentajeConsumo(1, 6)).toBe(17); // 16,67
    expect(porcentajeConsumo(1, 7)).toBe(14); // 14,28
  });

  it("plan 0 o negativo devuelve 0 (sin dividir entre cero)", () => {
    expect(porcentajeConsumo(3, 0)).toBe(0);
    expect(porcentajeConsumo(0, 0)).toBe(0);
    expect(porcentajeConsumo(3, -2)).toBe(0);
    expect(Number.isFinite(porcentajeConsumo(5, 0))).toBe(true);
  });

  it("no limita por encima del 100 %", () => {
    expect(porcentajeConsumo(10, 2)).toBe(500);
  });
});

describe("semaforoConsumo: fronteras", () => {
  it.each<[string, number, number, Semaforo]>([
    ["plan 5: 3 activas = 60 %", 3, 5, "verde"],
    ["plan 5: 4 activas = 80 % exacto", 4, 5, "ambar"],
    ["plan 5: 5 activas = 100 % (igual al plan)", 5, 5, "ambar"],
    ["plan 5: 6 activas = 120 %", 6, 5, "rojo"],
    ["plan 10: 7 activas = 70 %", 7, 10, "verde"],
    ["plan 10: 8 activas = 80 % exacto", 8, 10, "ambar"],
    ["plan 10: 9 activas = 90 %", 9, 10, "ambar"],
    ["plan 10: 10 activas = 100 %", 10, 10, "ambar"],
    ["plan 10: 11 activas = 110 %", 11, 10, "rojo"],
    ["plan 36: 28 activas = 77,8 %", 28, 36, "verde"],
    ["plan 36: 29 activas = 80,6 %", 29, 36, "ambar"],
    ["plan 36: 35 activas = 97 %", 35, 36, "ambar"],
    ["plan 36: 36 activas = 100 %", 36, 36, "ambar"],
    ["plan 36: 37 activas = 102,8 %", 37, 36, "rojo"],
    ["plan 3: 2 activas = 66,7 %", 2, 3, "verde"],
    ["plan 2: 1 activa = 50 %", 1, 2, "verde"],
    ["plan 2: 2 activas = 100 %", 2, 2, "ambar"],
    ["plan 2: 3 activas = 150 %", 3, 2, "rojo"],
    ["fase futura: 0 activas con plan", 0, 6, "verde"],
    ["plan 0 sin activas", 0, 0, "verde"],
    ["plan 0 con activas", 3, 0, "verde"],
    ["plan negativo", 2, -1, "verde"],
  ])("%s", (_n, activas, plan, esperado) => {
    expect(semaforoConsumo(activas, plan)).toBe(esperado);
  });

  it("79 % es verde, 80 % es ámbar y 101 % es rojo (plan 100 para ver el porcentaje exacto)", () => {
    expect(semaforoConsumo(79, 100)).toBe("verde");
    expect(semaforoConsumo(80, 100)).toBe("ambar");
    expect(semaforoConsumo(99, 100)).toBe("ambar");
    expect(semaforoConsumo(100, 100)).toBe("ambar");
    expect(semaforoConsumo(101, 100)).toBe("rojo");
  });

  it("el rojo se decide con el valor real, no con el porcentaje redondeado (100,4 % sigue siendo rojo)", () => {
    // 501/500 = 100,2 % redondea a 100 %, pero supera el plan
    expect(porcentajeConsumo(501, 500)).toBe(100);
    expect(semaforoConsumo(501, 500)).toBe("rojo");
  });

  it("el ámbar se decide con el valor real (79,6 % redondea a 80 % pero sigue en verde)", () => {
    // 199/250 = 79,6 %
    expect(porcentajeConsumo(199, 250)).toBe(80);
    expect(semaforoConsumo(199, 250)).toBe("verde");
  });
});

describe("etiquetas", () => {
  it("ETIQUETA_SEMAFORO tiene los textos exactos", () => {
    expect(ETIQUETA_SEMAFORO).toEqual({ verde: "En plazo", ambar: "Atención", rojo: "Plan superado" });
  });

  it("ETIQUETA_MOTIVO tiene los textos exactos", () => {
    const esperado: Record<MotivoPausa, string> = {
      "espera-cliente": "Espera del cliente",
      "espera-organismo": "Espera de organismo",
      "decision-interna": "Decisión interna",
      otra: "Otra",
    };
    expect(ETIQUETA_MOTIVO).toEqual(esperado);
  });
});

describe("obtenerPlanTiempos", () => {
  it("PRY-EJ-001: siete fases 1..7 en orden con plan, activas y pausa del plan de la tarea", async () => {
    const p = await obtenerPlanTiempos("PRY-EJ-001");
    expect(p).not.toBeNull();
    expect(p!.codigo).toBe("PRY-EJ-001");
    expect(p!.faseActual).toBe(3);
    expect(p!.fases.map((f) => f.fase)).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(p!.fases.map((f) => f.planSemanas)).toEqual([2, 3, 5, 6, 8, 36, 4]);
    expect(p!.fases.map((f) => f.activasSemanas)).toEqual([3, 4, 4, 0, 0, 0, 0]);
    expect(p!.fases.map((f) => f.pausaSemanas)).toEqual([0, 3, 1, 0, 0, 0, 0]);
  });

  it("PRY-EJ-001: totales del servicio (11 activas, 64 de plan, 4 de pausa, 15 de calendario, +1 de desviación)", async () => {
    const p = (await obtenerPlanTiempos("PRY-EJ-001"))!;
    expect(p.totalActivasSemanas).toBe(11);
    expect(p.totalPlanSemanas).toBe(64);
    expect(p.totalPausaSemanas).toBe(4);
    expect(p.calendarioSemanas).toBe(15);
    expect(p.desviacionSemanas).toBe(1);
  });

  it("PRY-EJ-001: sin pausa activa y con 2 pausas en el historial", async () => {
    const p = (await obtenerPlanTiempos("PRY-EJ-001"))!;
    expect(p.pausaActiva).toBeNull();
    expect(p.pausas).toHaveLength(2);
  });

  it("PRY-EJ-001: las semanas de las pausas del historial suman las de pausa", async () => {
    const p = (await obtenerPlanTiempos("PRY-EJ-001"))!;
    expect(p.pausas.reduce((s, x) => s + x.semanas, 0)).toBe(p.totalPausaSemanas);
  });

  it("PRY-EJ-002 (fase 0) no tiene plan: null", async () => {
    expect(await obtenerPlanTiempos("PRY-EJ-002")).toBeNull();
  });

  it("PRY-EJ-003: fase 6 con plan, activas y pausa del plan de la tarea", async () => {
    const p = (await obtenerPlanTiempos("PRY-EJ-003"))!;
    expect(p).not.toBeNull();
    expect(p.codigo).toBe("PRY-EJ-003");
    expect(p.faseActual).toBe(6);
    expect(p.fases.map((f) => f.fase)).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(p.fases.map((f) => f.planSemanas)).toEqual([2, 3, 5, 6, 8, 36, 4]);
    expect(p.fases.map((f) => f.activasSemanas)).toEqual([2, 3, 5, 6, 8, 30, 0]);
    expect(p.fases.map((f) => f.pausaSemanas)).toEqual([0, 0, 0, 1, 0, 2, 0]);
  });

  it("PRY-EJ-003: tiene pausa activa por espera de organismo con reanudación posterior al inicio", async () => {
    const p = (await obtenerPlanTiempos("PRY-EJ-003"))!;
    expect(p.pausaActiva).not.toBeNull();
    expect(p.pausaActiva!.motivo).toBe("espera-organismo");
    expect(esFechaIso(p.pausaActiva!.desde)).toBe(true);
    expect(esFechaIso(p.pausaActiva!.reanudacionPrevista)).toBe(true);
    expect(p.pausaActiva!.reanudacionPrevista > p.pausaActiva!.desde).toBe(true);
  });

  it.each(["PRY-NO-EXISTE", "", "pry-ej-001"])("código inexistente %j devuelve null", async (c) => {
    expect(await obtenerPlanTiempos(c)).toBeNull();
  });

  it("devuelve copias: mutar el resultado no altera la siguiente consulta", async () => {
    const a = (await obtenerPlanTiempos("PRY-EJ-001"))!;
    a.fases[0].activasSemanas = 999;
    a.pausas.pop();
    a.totalActivasSemanas = 999;
    const b = (await obtenerPlanTiempos("PRY-EJ-001"))!;
    expect(b.fases[0].activasSemanas).toBe(3);
    expect(b.pausas).toHaveLength(2);
    expect(b.totalActivasSemanas).toBe(11);
  });
});

describe("coherencia de los datos de ejemplo", () => {
  const codigos = ["PRY-EJ-001", "PRY-EJ-003"];

  it.each(codigos)("%s: ids de fase únicos, ordenados y con nombre en FASES", async (c) => {
    const p = (await obtenerPlanTiempos(c))!;
    const ids = p.fases.map((f) => f.fase);
    expect(new Set(ids).size).toBe(7);
    expect(ids).toEqual([...ids].sort((a, b) => a - b));
    for (const id of ids) expect(FASES[id].nombre.length).toBeGreaterThan(0);
    expect(ids).not.toContain(0);
  });

  it.each(codigos)("%s: semanas enteras y no negativas, plan positivo", async (c) => {
    const p = (await obtenerPlanTiempos(c))!;
    for (const f of p.fases) {
      expect(Number.isInteger(f.planSemanas) && f.planSemanas > 0).toBe(true);
      expect(Number.isInteger(f.activasSemanas) && f.activasSemanas >= 0).toBe(true);
      expect(Number.isInteger(f.pausaSemanas) && f.pausaSemanas >= 0).toBe(true);
    }
  });

  it.each(codigos)("%s: fechas ISO válidas y historial de más reciente a más antiguo", async (c) => {
    const p = (await obtenerPlanTiempos(c))!;
    for (const x of p.pausas) {
      expect(esFechaIso(x.desde)).toBe(true);
      if (x.hasta !== null) {
        expect(esFechaIso(x.hasta)).toBe(true);
        expect(x.hasta >= x.desde).toBe(true);
      }
      expect(x.semanas).toBeGreaterThanOrEqual(0);
      expect(Object.keys(ETIQUETA_MOTIVO)).toContain(x.motivo);
      expect([1, 2, 3, 4, 5, 6, 7]).toContain(x.fase);
    }
    const desdes = p.pausas.map((x) => x.desde);
    expect(desdes).toEqual([...desdes].sort().reverse());
  });

  it.each(codigos)("%s: datos ficticios (código PRY-EJ-NNN, sin correos ni teléfonos)", async (c) => {
    const p = (await obtenerPlanTiempos(c))!;
    expect(p.codigo).toMatch(/^PRY-EJ-\d{3}$/);
    expect(JSON.stringify(p)).not.toMatch(/@|\b\d{9}\b/);
  });
});

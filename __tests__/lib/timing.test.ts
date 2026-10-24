import { PHASES } from "@/lib/phases";
import {
  REASON_LABEL,
  TRAFFIC_LIGHT_LABEL,
  fetchTimingPlan,
  consumptionPercent,
  consumptionTrafficLight,
  type PauseReason,
  type TrafficLight,
} from "@/lib/timing";

const ISO = /^\d{4}-\d{2}-\d{2}$/;
const isIsoDate = (s: string) => ISO.test(s) && !Number.isNaN(Date.parse(s)) && new Date(s).toISOString().startsWith(s);

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
  ])("%i activas de %i de plan = %i %%", (active, plan, esperado) => {
    expect(consumptionPercent(active, plan)).toBe(esperado);
  });

  it("redondea al entero más cercano (0,5 sube)", () => {
    expect(consumptionPercent(1, 8)).toBe(13); // 12,5
    expect(consumptionPercent(1, 6)).toBe(17); // 16,67
    expect(consumptionPercent(1, 7)).toBe(14); // 14,28
  });

  it("plan 0 o negativo devuelve 0 (sin dividir entre cero)", () => {
    expect(consumptionPercent(3, 0)).toBe(0);
    expect(consumptionPercent(0, 0)).toBe(0);
    expect(consumptionPercent(3, -2)).toBe(0);
    expect(Number.isFinite(consumptionPercent(5, 0))).toBe(true);
  });

  it("no limita por encima del 100 %", () => {
    expect(consumptionPercent(10, 2)).toBe(500);
  });
});

describe("semaforoConsumo: fronteras", () => {
  it.each<[string, number, number, TrafficLight]>([
    ["plan 5: 3 activas = 60 %", 3, 5, "green"],
    ["plan 5: 4 activas = 80 % exacto", 4, 5, "amber"],
    ["plan 5: 5 activas = 100 % (igual al plan)", 5, 5, "amber"],
    ["plan 5: 6 activas = 120 %", 6, 5, "red"],
    ["plan 10: 7 activas = 70 %", 7, 10, "green"],
    ["plan 10: 8 activas = 80 % exacto", 8, 10, "amber"],
    ["plan 10: 9 activas = 90 %", 9, 10, "amber"],
    ["plan 10: 10 activas = 100 %", 10, 10, "amber"],
    ["plan 10: 11 activas = 110 %", 11, 10, "red"],
    ["plan 36: 28 activas = 77,8 %", 28, 36, "green"],
    ["plan 36: 29 activas = 80,6 %", 29, 36, "amber"],
    ["plan 36: 35 activas = 97 %", 35, 36, "amber"],
    ["plan 36: 36 activas = 100 %", 36, 36, "amber"],
    ["plan 36: 37 activas = 102,8 %", 37, 36, "red"],
    ["plan 3: 2 activas = 66,7 %", 2, 3, "green"],
    ["plan 2: 1 activa = 50 %", 1, 2, "green"],
    ["plan 2: 2 activas = 100 %", 2, 2, "amber"],
    ["plan 2: 3 activas = 150 %", 3, 2, "red"],
    ["fase futura: 0 activas con plan", 0, 6, "green"],
    ["plan 0 sin activas", 0, 0, "green"],
    ["plan 0 con activas", 3, 0, "green"],
    ["plan negativo", 2, -1, "green"],
  ])("%s", (_n, active, plan, esperado) => {
    expect(consumptionTrafficLight(active, plan)).toBe(esperado);
  });

  it("79 % es verde, 80 % es ámbar y 101 % es rojo (plan 100 para ver el porcentaje exacto)", () => {
    expect(consumptionTrafficLight(79, 100)).toBe("green");
    expect(consumptionTrafficLight(80, 100)).toBe("amber");
    expect(consumptionTrafficLight(99, 100)).toBe("amber");
    expect(consumptionTrafficLight(100, 100)).toBe("amber");
    expect(consumptionTrafficLight(101, 100)).toBe("red");
  });

  it("el rojo se decide con el valor real, no con el porcentaje redondeado (100,4 % sigue siendo rojo)", () => {
    // 501/500 = 100,2 % redondea a 100 %, pero supera el plan
    expect(consumptionPercent(501, 500)).toBe(100);
    expect(consumptionTrafficLight(501, 500)).toBe("red");
  });

  it("el ámbar se decide con el valor real (79,6 % redondea a 80 % pero sigue en verde)", () => {
    // 199/250 = 79,6 %
    expect(consumptionPercent(199, 250)).toBe(80);
    expect(consumptionTrafficLight(199, 250)).toBe("green");
  });
});

describe("etiquetas", () => {
  it("ETIQUETA_SEMAFORO tiene los textos exactos", () => {
    expect(TRAFFIC_LIGHT_LABEL).toEqual({ green: "En plazo", amber: "Atención", red: "Plan superado" });
  });

  it("ETIQUETA_MOTIVO tiene los textos exactos", () => {
    const esperado: Record<PauseReason, string> = {
      "client-wait": "Espera del cliente",
      "authority-wait": "Espera de organismo",
      "internal-decision": "Decisión interna",
      other: "Otra",
    };
    expect(REASON_LABEL).toEqual(esperado);
  });
});

describe("obtenerPlanTiempos", () => {
  it("PRY-EJ-001: siete fases 1..7 en orden con plan, activas y pausa del plan de la tarea", async () => {
    const p = await fetchTimingPlan("PRY-EJ-001");
    expect(p).not.toBeNull();
    expect(p!.code).toBe("PRY-EJ-001");
    expect(p!.currentPhase).toBe(3);
    expect(p!.phases.map((f) => f.phase)).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(p!.phases.map((f) => f.plannedWeeks)).toEqual([2, 3, 5, 6, 8, 36, 4]);
    expect(p!.phases.map((f) => f.activeWeeks)).toEqual([3, 4, 4, 0, 0, 0, 0]);
    expect(p!.phases.map((f) => f.pausedWeeks)).toEqual([0, 3, 1, 0, 0, 0, 0]);
  });

  it("PRY-EJ-001: totales del servicio (11 activas, 64 de plan, 4 de pausa, 15 de calendario, +1 de desviación)", async () => {
    const p = (await fetchTimingPlan("PRY-EJ-001"))!;
    expect(p.totalActiveWeeks).toBe(11);
    expect(p.totalPlannedWeeks).toBe(64);
    expect(p.totalPausedWeeks).toBe(4);
    expect(p.calendarioSemanas).toBe(15);
    expect(p.deviationWeeks).toBe(1);
  });

  it("PRY-EJ-001: sin pausa activa y con 2 pausas en el historial", async () => {
    const p = (await fetchTimingPlan("PRY-EJ-001"))!;
    expect(p.activePause).toBeNull();
    expect(p.pauses).toHaveLength(2);
  });

  it("PRY-EJ-001: las semanas de las pausas del historial suman las de pausa", async () => {
    const p = (await fetchTimingPlan("PRY-EJ-001"))!;
    expect(p.pauses.reduce((s, x) => s + x.weeks, 0)).toBe(p.totalPausedWeeks);
  });

  it("PRY-EJ-002 (fase 0) no tiene plan: null", async () => {
    expect(await fetchTimingPlan("PRY-EJ-002")).toBeNull();
  });

  it("PRY-EJ-003: fase 6 con plan, activas y pausa del plan de la tarea", async () => {
    const p = (await fetchTimingPlan("PRY-EJ-003"))!;
    expect(p).not.toBeNull();
    expect(p.code).toBe("PRY-EJ-003");
    expect(p.currentPhase).toBe(6);
    expect(p.phases.map((f) => f.phase)).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(p.phases.map((f) => f.plannedWeeks)).toEqual([2, 3, 5, 6, 8, 36, 4]);
    expect(p.phases.map((f) => f.activeWeeks)).toEqual([2, 3, 5, 6, 8, 30, 0]);
    expect(p.phases.map((f) => f.pausedWeeks)).toEqual([0, 0, 0, 1, 0, 2, 0]);
  });

  it("PRY-EJ-003: tiene pausa activa por espera de organismo con reanudación posterior al inicio", async () => {
    const p = (await fetchTimingPlan("PRY-EJ-003"))!;
    expect(p.activePause).not.toBeNull();
    expect(p.activePause!.motivo).toBe("authority-wait");
    expect(isIsoDate(p.activePause!.from)).toBe(true);
    expect(isIsoDate(p.activePause!.expectedResumption)).toBe(true);
    expect(p.activePause!.expectedResumption > p.activePause!.from).toBe(true);
  });

  it.each(["PRY-NO-EXISTE", "", "pry-ej-001"])("código inexistente %j devuelve null", async (c) => {
    expect(await fetchTimingPlan(c)).toBeNull();
  });

  it("devuelve copias: mutar el resultado no altera la siguiente consulta", async () => {
    const a = (await fetchTimingPlan("PRY-EJ-001"))!;
    a.phases[0].activeWeeks = 999;
    a.pauses.pop();
    a.totalActiveWeeks = 999;
    const b = (await fetchTimingPlan("PRY-EJ-001"))!;
    expect(b.phases[0].activeWeeks).toBe(3);
    expect(b.pauses).toHaveLength(2);
    expect(b.totalActiveWeeks).toBe(11);
  });
});

describe("coherencia de los datos de ejemplo", () => {
  const codes = ["PRY-EJ-001", "PRY-EJ-003", "PRY-EJ-004"];

  it.each(codes)("%s: ids de fase únicos, ordenados y con nombre en FASES", async (c) => {
    const p = (await fetchTimingPlan(c))!;
    const ids = p.phases.map((f) => f.phase);
    expect(new Set(ids).size).toBe(7);
    expect(ids).toEqual([...ids].sort((a, b) => a - b));
    for (const id of ids) expect(PHASES[id].name.length).toBeGreaterThan(0);
    expect(ids).not.toContain(0);
  });

  it.each(codes)("%s: semanas enteras y no negativas, plan positivo", async (c) => {
    const p = (await fetchTimingPlan(c))!;
    for (const f of p.phases) {
      expect(Number.isInteger(f.plannedWeeks) && f.plannedWeeks > 0).toBe(true);
      expect(Number.isInteger(f.activeWeeks) && f.activeWeeks >= 0).toBe(true);
      expect(Number.isInteger(f.pausedWeeks) && f.pausedWeeks >= 0).toBe(true);
    }
  });

  it.each(codes)("%s: fechas ISO válidas y historial de más reciente a más antiguo", async (c) => {
    const p = (await fetchTimingPlan(c))!;
    for (const x of p.pauses) {
      expect(isIsoDate(x.from)).toBe(true);
      if (x.to !== null) {
        expect(isIsoDate(x.to)).toBe(true);
        expect(x.to >= x.from).toBe(true);
      }
      expect(x.weeks).toBeGreaterThanOrEqual(0);
      expect(Object.keys(REASON_LABEL)).toContain(x.motivo);
      expect([1, 2, 3, 4, 5, 6, 7]).toContain(x.phase);
    }
    const desdes = p.pauses.map((x) => x.from);
    expect(desdes).toEqual([...desdes].sort().reverse());
  });

  it.each(codes)("%s: datos ficticios (código PRY-EJ-NNN, sin correos ni teléfonos)", async (c) => {
    const p = (await fetchTimingPlan(c))!;
    expect(p.code).toMatch(/^PRY-EJ-\d{3}$/);
    expect(JSON.stringify(p)).not.toMatch(/@|\b\d{9}\b/);
  });
});

describe("obtenerPlanTiempos · PRY-EJ-004 (RGB-29)", () => {
  it("tiene plan de siete fases 1..7 con la fase actual 2", async () => {
    const p = (await fetchTimingPlan("PRY-EJ-004"))!;
    expect(p).not.toBeNull();
    expect(p.code).toBe("PRY-EJ-004");
    expect(p.currentPhase).toBe(2);
    expect(p.phases.map((f) => f.phase)).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(p.phases.map((f) => f.plannedWeeks)).toEqual([2, 3, 5, 6, 8, 36, 4]);
  });

  it("solo hay semanas activas en las fases hasta la actual", async () => {
    const p = (await fetchTimingPlan("PRY-EJ-004"))!;
    for (const f of p.phases.filter((x) => x.phase > p.currentPhase)) {
      expect(f.activeWeeks).toBe(0);
      expect(f.pausedWeeks).toBe(0);
    }
    expect(p.phases[0].activeWeeks).toBeGreaterThan(0);
  });

  it("los totales coinciden con la suma de las fases y el calendario es activas + pausa", async () => {
    const p = (await fetchTimingPlan("PRY-EJ-004"))!;
    const sum = (k: "plannedWeeks" | "activeWeeks" | "pausedWeeks") => p.phases.reduce((a, f) => a + f[k], 0);
    expect(p.totalPlannedWeeks).toBe(sum("plannedWeeks"));
    expect(p.totalActiveWeeks).toBe(sum("activeWeeks"));
    expect(p.totalPausedWeeks).toBe(sum("pausedWeeks"));
    expect(p.calendarioSemanas).toBe(p.totalActiveWeeks + p.totalPausedWeeks);
    expect(Number.isInteger(p.deviationWeeks)).toBe(true);
  });

  it("las semanas del historial de pausas suman las de pausa y no hay pausa activa inconsistente", async () => {
    const p = (await fetchTimingPlan("PRY-EJ-004"))!;
    expect(p.pauses.reduce((a, x) => a + x.weeks, 0)).toBe(p.totalPausedWeeks);
    if (p.activePause) expect(p.pauses.some((x) => x.to === null)).toBe(true);
    else expect(p.pauses.every((x) => x.to !== null)).toBe(true);
  });
});

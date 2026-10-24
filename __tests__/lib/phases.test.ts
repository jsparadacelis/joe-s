import { PHASES, phaseState, modoFase, parsePhaseId, type PhaseId } from "@/lib/phases";

const IDS: PhaseId[] = [0, 1, 2, 3, 4, 5, 6, 7];

describe("FASES", () => {
  it("tiene 8 fases con ids 0..7 en orden", () => {
    expect(PHASES).toHaveLength(8);
    expect(PHASES.map((f) => f.id)).toEqual(IDS);
  });

  it("usa los nombres del PRD en español", () => {
    expect(PHASES.map((f) => f.name)).toEqual([
      "Oportunidad",
      "Inicio",
      "Briefing y concepto",
      "Anteproyecto",
      "Proyecto básico",
      "Proyecto de ejecución",
      "Obra",
      "Cierre",
    ]);
  });

  it.each(IDS)("la fase %i tiene entregable y promueve no vacíos", (id) => {
    const f = PHASES[id];
    expect(f.deliverable.trim().length).toBeGreaterThan(0);
    expect(f.promueve.trim().length).toBeGreaterThan(0);
  });

  it("los nombres de fase no se repiten", () => {
    expect(new Set(PHASES.map((f) => f.name)).size).toBe(8);
  });
});

describe("estadoFase y modoFase (8x8)", () => {
  const combos = IDS.flatMap((phase) => IDS.map((current) => [phase, current] as const));

  it.each(combos)("fase %i con actual %i", (phase, current) => {
    const state = phase < current ? "done" : phase === current ? "current" : "upcoming";
    const mode = phase < current ? "read-only" : phase === current ? "edit" : "preview";
    expect(phaseState(phase, current)).toBe(state);
    expect(modoFase(phase, current)).toBe(mode);
  });

  it("para cada fase actual hay exactamente una fase en edición", () => {
    for (const current of IDS) {
      expect(IDS.filter((f) => modoFase(f, current) === "edit")).toEqual([current]);
    }
  });
});

describe("parseFaseId", () => {
  it.each(["0", "1", "2", "3", "4", "5", "6", "7"])("acepta %j", (raw) => {
    expect(parsePhaseId(raw)).toBe(Number(raw));
  });

  it.each(["", "8", "-1", "01", "1.5", "abc", " 3", "3 ", "+3", "3e0", "0x3", "10"])(
    "rechaza %j",
    (raw) => {
      expect(parsePhaseId(raw)).toBeNull();
    },
  );
});

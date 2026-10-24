import { PHASES, phaseState, phaseMode, parsePhaseId, type PhaseId } from "@/lib/phases";

const IDS: PhaseId[] = [0, 1, 2, 3, 4, 5, 6, 7];

describe("PHASES", () => {
  it("has 8 phases with ids 0..7 in order", () => {
    expect(PHASES).toHaveLength(8);
    expect(PHASES.map((f) => f.id)).toEqual(IDS);
  });

  it("uses the PRD names in Spanish", () => {
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

  it.each(IDS)("phase %i has non-empty deliverable and promoter", (id) => {
    const f = PHASES[id];
    expect(f.deliverable.trim().length).toBeGreaterThan(0);
    expect(f.promoter.trim().length).toBeGreaterThan(0);
  });

  it("phase names are not repeated", () => {
    expect(new Set(PHASES.map((f) => f.name)).size).toBe(8);
  });
});

describe("phaseState and phaseMode (8x8)", () => {
  const combinations = IDS.flatMap((phase) => IDS.map((current) => [phase, current] as const));

  it.each(combinations)("phase %i with current %i", (phase, current) => {
    const state = phase < current ? "done" : phase === current ? "current" : "upcoming";
    const mode = phase < current ? "read-only" : phase === current ? "edit" : "preview";
    expect(phaseState(phase, current)).toBe(state);
    expect(phaseMode(phase, current)).toBe(mode);
  });

  it("for each current phase there is exactly one phase in edit mode", () => {
    for (const current of IDS) {
      expect(IDS.filter((f) => phaseMode(f, current) === "edit")).toEqual([current]);
    }
  });
});

describe("parsePhaseId", () => {
  it.each(["0", "1", "2", "3", "4", "5", "6", "7"])("accepts %j", (raw) => {
    expect(parsePhaseId(raw)).toBe(Number(raw));
  });

  it.each(["", "8", "-1", "01", "1.5", "abc", " 3", "3 ", "+3", "3e0", "0x3", "10"])(
    "rejects %j",
    (raw) => {
      expect(parsePhaseId(raw)).toBeNull();
    },
  );
});

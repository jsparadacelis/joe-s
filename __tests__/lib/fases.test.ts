import { FASES, estadoFase, modoFase, parseFaseId, type FaseId } from "@/lib/fases";

const IDS: FaseId[] = [0, 1, 2, 3, 4, 5, 6, 7];

describe("FASES", () => {
  it("tiene 8 fases con ids 0..7 en orden", () => {
    expect(FASES).toHaveLength(8);
    expect(FASES.map((f) => f.id)).toEqual(IDS);
  });

  it("usa los nombres del PRD en español", () => {
    expect(FASES.map((f) => f.nombre)).toEqual([
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
    const f = FASES[id];
    expect(f.entregable.trim().length).toBeGreaterThan(0);
    expect(f.promueve.trim().length).toBeGreaterThan(0);
  });

  it("los nombres de fase no se repiten", () => {
    expect(new Set(FASES.map((f) => f.nombre)).size).toBe(8);
  });
});

describe("estadoFase y modoFase (8x8)", () => {
  const combos = IDS.flatMap((fase) => IDS.map((actual) => [fase, actual] as const));

  it.each(combos)("fase %i con actual %i", (fase, actual) => {
    const estado = fase < actual ? "hecha" : fase === actual ? "actual" : "vista";
    const modo = fase < actual ? "solo-lectura" : fase === actual ? "edicion" : "vista-previa";
    expect(estadoFase(fase, actual)).toBe(estado);
    expect(modoFase(fase, actual)).toBe(modo);
  });

  it("para cada fase actual hay exactamente una fase en edición", () => {
    for (const actual of IDS) {
      expect(IDS.filter((f) => modoFase(f, actual) === "edicion")).toEqual([actual]);
    }
  });
});

describe("parseFaseId", () => {
  it.each(["0", "1", "2", "3", "4", "5", "6", "7"])("acepta %j", (raw) => {
    expect(parseFaseId(raw)).toBe(Number(raw));
  });

  it.each(["", "8", "-1", "01", "1.5", "abc", " 3", "3 ", "+3", "3e0", "0x3", "10"])(
    "rechaza %j",
    (raw) => {
      expect(parseFaseId(raw)).toBeNull();
    },
  );
});

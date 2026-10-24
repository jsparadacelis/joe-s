import {
  DEFINITIONS,
  DATA_GROUPS,
  countEdited,
  countPending,
  isValidCadastralReference,
  isEdited,
  markAllVerified,
  fetchTechnicalData,
  fetchSavedTechnicalData,
  requery,
  restoreDatum,
  type TechnicalDatum,
} from "@/lib/technical-data";

const RESIDENTIAL_REF = "1234567DG3413S0001AB";
const OTHER_REF = "ABCDEFGH123456789012";

const PLOT_IDS = ["address", "municipality", "propertyClass", "use", "year", "builtArea", "cadastralPlotArea", "polygonPlotArea", "coords", "altitude", "slope", "slopeType"];
const CONDITION_IDS = ["climateZone", "seismicAcceleration", "kCoefficient", "windZone", "snowZone", "pvProduction"];
const PLANNING_IDS = ["buildability", "maxOccupancy", "maxHeight", "floors", "streetSetback", "boundarySetback", "minPlot", "calcArea"];
const IDS = [...PLOT_IDS, ...CONDITION_IDS, ...PLANNING_IDS];

const def = (id: string) => DEFINITIONS.find((d) => d.id === id)!;
const datum = (over: Partial<TechnicalDatum> = {}): TechnicalDatum => ({
  id: "address",
  value: "CL PRUEBA 1",
  original: "CL PRUEBA 1",
  verified: false,
  ...over,
});

describe("GRUPOS", () => {
  it("son tres, en orden, con id, nombre y descripción del borrador", () => {
    expect(DATA_GROUPS.map((g) => [g.id, g.name])).toEqual([
      ["plot", "Parcela"],
      ["conditions", "Condiciones técnicas"],
      ["planning", "Planeamiento"],
    ]);
    expect(DATA_GROUPS.map((g) => g.description)).toEqual([
      "Catastro, INSPIRE y Open-Meteo",
      "Tablas del CTE y la NCSE-02, PVGIS",
      "Manual, desde la ficha urbanística del municipio",
    ]);
  });
});

describe("DEFINICIONES", () => {
  it("son 26, con los ids del plan en orden (parcela, condiciones, planeamiento)", () => {
    expect(DEFINITIONS.map((d) => d.id)).toEqual(IDS);
    expect(DEFINITIONS).toHaveLength(26);
  });

  it("recuento por grupo 12 / 6 / 8 y cada dato pertenece al grupo de sus ids", () => {
    const de = (g: string) => DEFINITIONS.filter((d) => d.group === g).map((d) => d.id);
    expect(de("plot")).toEqual(PLOT_IDS);
    expect(de("conditions")).toEqual(CONDITION_IDS);
    expect(de("planning")).toEqual(PLANNING_IDS);
  });

  it("etiquetas del borrador", () => {
    expect(DEFINITIONS.map((d) => d.label)).toEqual([
      "Dirección", "Municipio", "Clase", "Uso catastral", "Año de construcción", "Superficie construida",
      "Sup. de parcela (Catastro)", "Sup. de parcela (polígono)", "Coordenadas", "Altitud", "Pendiente", "Tipo de pendiente",
      "Zona climática", "Aceleración sísmica básica", "Coeficiente K", "Zona de viento", "Zona de clima invernal (nieve)", "Producción fotovoltaica",
      "Edificabilidad", "Ocupación máxima", "Altura máxima", "Número de plantas", "Retranqueo a vial", "Retranqueo a lindes", "Parcela mínima", "Superficie de cálculo",
    ]);
  });

  it("tipos: lista, número o texto según el borrador", () => {
    const lists = ["propertyClass", "use", "slopeType", "climateZone", "seismicAcceleration", "kCoefficient", "windZone", "snowZone", "floors", "calcArea"];
    const numbers = ["year", "builtArea", "cadastralPlotArea", "polygonPlotArea", "altitude", "slope", "pvProduction", "buildability", "maxOccupancy", "maxHeight", "streetSetback", "boundarySetback", "minPlot"];
    const texts = ["address", "municipality", "coords"];
    for (const id of lists) expect(def(id).type).toBe("list");
    for (const id of numbers) expect(def(id).type).toBe("number");
    for (const id of texts) expect(def(id).type).toBe("text");
    expect(lists.length + numbers.length + texts.length).toBe(26);
  });

  it("solo las listas tienen opciones", () => {
    for (const d of DEFINITIONS) {
      if (d.type === "list") expect(d.options && d.options.length).toBeGreaterThan(0);
      else expect(d.options).toBeUndefined();
    }
  });

  it("orígenes del borrador", () => {
    const origin = Object.fromEntries(DEFINITIONS.map((d) => [d.id, d.origin]));
    expect(origin).toMatchObject({
      address: "Catastro", municipality: "Catastro", propertyClass: "Catastro", use: "Catastro", year: "Catastro", builtArea: "Catastro", cadastralPlotArea: "Catastro",
      polygonPlotArea: "INSPIRE · calculado", coords: "Catastro (CPMRC)", altitude: "Open-Meteo", slope: "Calculado", slopeType: "Calculado",
      climateZone: "CTE DB-HE · Anejo B", seismicAcceleration: "NCSE-02 · Anejo 1", kCoefficient: "NCSE-02 · Anejo 1", windZone: "CTE DB-SE-AE", snowZone: "CTE DB-SE-AE", pvProduction: "PVGIS",
    });
    for (const id of PLANNING_IDS) expect(origin[id]).toBe("Manual");
  });

  it("unidades del borrador", () => {
    const unit = (id: string) => def(id).unit;
    expect(unit("builtArea")).toBe("m²");
    expect(unit("cadastralPlotArea")).toBe("m²");
    expect(unit("polygonPlotArea")).toBe("m²");
    expect(unit("altitude")).toBe("m");
    expect(unit("slope")).toBe("%");
    expect(unit("pvProduction")).toBe("kWh/kWp·año");
    expect(unit("buildability")).toBe("m²t/m²s");
    expect(unit("maxOccupancy")).toBe("%");
    expect(unit("maxHeight")).toBe("m");
    expect(unit("streetSetback")).toBe("m");
    expect(unit("boundarySetback")).toBe("m");
    expect(unit("minPlot")).toBe("m²");
    expect(unit("year")).toBeFalsy();
  });

  it("opciones literales del borrador", () => {
    expect(def("propertyClass").options).toEqual(["Urbano", "Rústico"]);
    expect(def("kCoefficient").options).toEqual(["1,0", "1,1", "1,2", "1,3"]);
    expect(def("windZone").options).toEqual(["A", "B", "C"]);
    expect(def("snowZone").options).toEqual(["1", "2", "3", "4", "5", "6", "7"]);
    expect(def("floors").options).toEqual(["PB", "PB+1", "PB+2", "PB+3", "PB+4", "PB+5"]);
    expect(def("calcArea").options).toEqual(["Catastral", "Polígono", "Topográfico"]);
    expect(def("slopeType").options).toEqual([
      "Llana (< 3 %)", "Suave (3–10 %)", "Moderada (10–20 %)", "Pronunciada (20–35 %)", "Muy pronunciada (> 35 %)",
    ]);
    expect(def("use").options).toEqual([
      "Residencial", "Industrial", "Oficinas", "Comercial", "Almacén y estacionamiento", "Ocio y hostelería",
      "Sanidad y beneficencia", "Cultural", "Deportivo", "Religioso", "Espectáculos", "Edificio singular", "Suelo sin edificar",
    ]);
    expect(def("climateZone").options).toEqual(["α3", "A2", "A3", "A4", "B2", "B3", "B4", "C1", "C2", "C3", "C4", "D1", "D2", "D3", "E1"]);
  });

  it("aceleración sísmica: «< 0,04 g» y de 0,04 g a 0,24 g (22 opciones)", () => {
    const ab = def("seismicAcceleration").options!;
    const expected = ["< 0,04 g", ...Array.from({ length: 21 }, (_, i) => `0,${String(4 + i).padStart(2, "0")} g`)];
    expect(ab).toHaveLength(22);
    expect(ab[0]).toBe("< 0,04 g");
    expect(ab[1]).toBe("0,04 g");
    expect(ab[21]).toBe("0,24 g");
    expect(ab).toEqual(expected);
  });
});

describe("estaEditado", () => {
  it("falso si el valor coincide con el original", () => {
    expect(isEdited(datum())).toBe(false);
  });
  it("verdadero si el valor difiere del original", () => {
    expect(isEdited(datum({ value: "OTRA" }))).toBe(true);
  });
  it("verdadero si se vacía un dato que tenía original", () => {
    expect(isEdited(datum({ value: "" }))).toBe(true);
  });
  it("un dato manual (original null) nunca está editado", () => {
    expect(isEdited(datum({ original: null, value: "algo" }))).toBe(false);
    expect(isEdited(datum({ original: null, value: "" }))).toBe(false);
  });
  it("original vacío y valor escrito cuenta como editado", () => {
    expect(isEdited(datum({ original: "", value: "x" }))).toBe(true);
  });
});

describe("contarPendientes / contarEditados", () => {
  const list = [
    datum({ id: "a", verified: true }),
    datum({ id: "b", value: "cambiado" }),
    datum({ id: "c", original: null, value: "manual", verified: true }),
    datum({ id: "d", value: "otro", verified: true }),
  ];
  it("pendientes = sin verificar", () => {
    expect(countPending(list)).toBe(1);
    expect(countPending([])).toBe(0);
  });
  it("editados = con original y valor distinto (los manuales no cuentan)", () => {
    expect(countEdited(list)).toBe(2);
    expect(countEdited([])).toBe(0);
  });
});

describe("restaurarDato", () => {
  it("devuelve el valor original y conserva el resto, sin mutar", () => {
    const d = datum({ value: "CAMBIADO", verified: true });
    const r = restoreDatum(d);
    expect(r).toEqual({ id: "address", value: "CL PRUEBA 1", original: "CL PRUEBA 1", verified: true });
    expect(d.value).toBe("CAMBIADO");
    expect(isEdited(r)).toBe(false);
  });
  it("con original vacío restaura a vacío", () => {
    expect(restoreDatum(datum({ original: "", value: "x" })).value).toBe("");
  });
  it("sin original (manual) no cambia el valor", () => {
    const d = datum({ original: null, value: "manual" });
    expect(restoreDatum(d)).toEqual(d);
  });
});

describe("marcarTodoVerificado", () => {
  it("marca todos y devuelve una copia sin mutar el original", () => {
    const original = [datum({ id: "a" }), datum({ id: "b", verified: true, value: "x" })];
    const r = markAllVerified(original);
    expect(r.every((d) => d.verified)).toBe(true);
    expect(r.map((d) => [d.id, d.value])).toEqual([["a", "CL PRUEBA 1"], ["b", "x"]]);
    expect(original[0].verified).toBe(false);
    expect(r).not.toBe(original);
    expect(r[0]).not.toBe(original[0]);
    expect(countPending(r)).toBe(0);
  });
  it("lista vacía devuelve lista vacía", () => {
    expect(markAllVerified([])).toEqual([]);
  });
});

describe("esReferenciaCatastralValida", () => {
  it.each([RESIDENTIAL_REF, OTHER_REF, "abcdefgh123456789012", `  ${RESIDENTIAL_REF}  `])("acepta %j", (ref) => {
    expect(isValidCadastralReference(ref)).toBe(true);
  });
  it.each([
    ["19 caracteres", "1234567DG3413S0001A"],
    ["21 caracteres", "1234567DG3413S0001ABC"],
    ["símbolo", "1234567DG3413S0001A!"],
    ["espacio interior", "1234567DG3413 S0001A"],
    ["vacía", ""],
    ["solo espacios", "                    "],
  ])("rechaza %s", (_n, ref) => {
    expect(isValidCadastralReference(ref)).toBe(false);
  });
});

describe("reconsultar", () => {
  const current: TechnicalDatum[] = [
    datum({ id: "address", value: "CL EDITADA 9", original: "CL VIEJA 1", verified: true }),
    datum({ id: "municipality", value: "MUNI VIEJO", original: "MUNI VIEJO", verified: true }),
    datum({ id: "buildability", value: "1,5", original: null, verified: true }),
    datum({ id: "calcArea", value: "Polígono", original: null, verified: false }),
  ];
  const incoming: TechnicalDatum[] = [
    datum({ id: "address", value: "CL NUEVA 2", original: "CL NUEVA 2" }),
    datum({ id: "municipality", value: "MUNI NUEVO", original: "MUNI NUEVO" }),
    datum({ id: "buildability", value: "", original: null }),
    datum({ id: "calcArea", value: "Catastral", original: null }),
  ];

  it("sustituye los datos de origen por los nuevos, con su original y sin verificar", () => {
    const r = requery(current, incoming);
    const byId = (id: string) => r.find((d) => d.id === id)!;
    expect(byId("address")).toEqual({ id: "address", value: "CL NUEVA 2", original: "CL NUEVA 2", verified: false });
    expect(byId("municipality")).toEqual({ id: "municipality", value: "MUNI NUEVO", original: "MUNI NUEVO", verified: false });
    expect(isEdited(byId("address"))).toBe(false);
  });

  it("conserva los datos manuales tal como estaban (valor y verificado)", () => {
    const r = requery(current, incoming);
    expect(r.find((d) => d.id === "buildability")).toEqual({ id: "buildability", value: "1,5", original: null, verified: true });
    expect(r.find((d) => d.id === "calcArea")).toEqual({ id: "calcArea", value: "Polígono", original: null, verified: false });
  });

  it("devuelve un dato por id de los nuevos, en su orden, sin mutar las entradas", () => {
    const currentCopy = JSON.parse(JSON.stringify(current));
    const incomingCopy = JSON.parse(JSON.stringify(incoming));
    const r = requery(current, incoming);
    expect(r.map((d) => d.id)).toEqual(["address", "municipality", "buildability", "calcArea"]);
    expect(current).toEqual(currentCopy);
    expect(incoming).toEqual(incomingCopy);
  });

  it("un dato que no estaba en el estado actual se toma de los nuevos", () => {
    const r = requery([], incoming);
    expect(r).toEqual(incoming);
  });
});

describe("obtenerDatosTecnicos", () => {
  it("referencia residencial: valores de ejemplo del borrador", async () => {
    const r = await fetchTechnicalData(RESIDENTIAL_REF);
    expect(r.cadastralReference).toBe(RESIDENTIAL_REF);
    const v = Object.fromEntries(r.data.map((d) => [d.id, d.value]));
    expect(v).toMatchObject({
      address: "CL EJEMPLO 12", municipality: "VIC (BARCELONA)", propertyClass: "Urbano", use: "Residencial", year: "1958",
      builtArea: "142", cadastralPlotArea: "96", polygonPlotArea: "99,4", coords: "41,93 N · 2,25 E", altitude: "490", slope: "2", slopeType: "Llana (< 3 %)",
      climateZone: "D2", seismicAcceleration: "< 0,04 g", kCoefficient: "1,0", windZone: "C", snowZone: "2", pvProduction: "1390",
    });
  });

  it("otra referencia válida: valores de ejemplo industriales", async () => {
    const r = await fetchTechnicalData(OTHER_REF);
    expect(r.cadastralReference).toBe(OTHER_REF);
    const v = Object.fromEntries(r.data.map((d) => [d.id, d.value]));
    expect(v).toMatchObject({
      address: "PG EJEMPLO 4", municipality: "SABADELL (BARCELONA)", use: "Industrial", year: "1987", builtArea: "1240", cadastralPlotArea: "3150", polygonPlotArea: "3122",
      climateZone: "C2", seismicAcceleration: "0,04 g", pvProduction: "1420",
    });
  });

  it("26 datos en el orden de DEFINICIONES, con fecha de consulta ISO", async () => {
    const r = await fetchTechnicalData(RESIDENTIAL_REF);
    expect(r.data.map((d) => d.id)).toEqual(DEFINITIONS.map((d) => d.id));
    expect(r.queriedOn).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("los datos de origen guardan original = valor y llegan sin verificar", async () => {
    for (const ref of [RESIDENTIAL_REF, OTHER_REF]) {
      const r = await fetchTechnicalData(ref);
      for (const d of r.data.filter((x) => def(x.id).group !== "planning")) {
        expect(d.original).toBe(d.value);
        expect(d.value).not.toBe("");
        expect(d.verified).toBe(false);
        if (def(d.id).type === "list") expect(def(d.id).options).toContain(d.value);
      }
      expect(countEdited(r.data)).toBe(0);
    }
  });

  it("planeamiento vacío salvo scalc = «Catastral», con original null y sin verificar", async () => {
    const r = await fetchTechnicalData(RESIDENTIAL_REF);
    for (const d of r.data.filter((x) => def(x.id).group === "planning")) {
      expect(d.original).toBeNull();
      expect(d.verified).toBe(false);
      expect(d.value).toBe(d.id === "calcArea" ? "Catastral" : "");
    }
  });

  it("devuelve copias: modificar el resultado no afecta a la siguiente consulta", async () => {
    const a = await fetchTechnicalData(RESIDENTIAL_REF);
    a.data[0].value = "MUTADO";
    a.data[0].verified = true;
    a.data.pop();
    const b = await fetchTechnicalData(RESIDENTIAL_REF);
    expect(b.data).toHaveLength(26);
    expect(b.data[0].value).toBe("CL EJEMPLO 12");
    expect(b.data[0].verified).toBe(false);
  });

  it("datos ficticios: sin correos ni teléfonos", async () => {
    const r = await fetchTechnicalData(RESIDENTIAL_REF);
    expect(JSON.stringify(r)).not.toMatch(/@|\b\d{9}\b/);
  });
});

describe("obtenerDatosTecnicosGuardados", () => {
  it("PRY-EJ-004 aún no tiene datos: null", async () => {
    expect(await fetchSavedTechnicalData("PRY-EJ-004")).toBeNull();
  });
  it("PRY-EJ-002 y códigos desconocidos: null", async () => {
    expect(await fetchSavedTechnicalData("PRY-EJ-002")).toBeNull();
    expect(await fetchSavedTechnicalData("PRY-EJ-003")).toBeNull();
    expect(await fetchSavedTechnicalData("NO-EXISTE")).toBeNull();
    expect(await fetchSavedTechnicalData("")).toBeNull();
  });
  it("PRY-EJ-001: datos completos, verificados y con exactamente 2 editados", async () => {
    const r = await fetchSavedTechnicalData("PRY-EJ-001");
    expect(r).not.toBeNull();
    expect(isValidCadastralReference(r!.cadastralReference)).toBe(true);
    expect(r!.queriedOn).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(r!.data.map((d) => d.id)).toEqual(IDS);
    expect(countPending(r!.data)).toBe(0);
    expect(countEdited(r!.data)).toBe(2);
  });
  it("devuelve copias", async () => {
    const a = (await fetchSavedTechnicalData("PRY-EJ-001"))!;
    a.data[0].value = "MUTADO";
    a.data.length = 0;
    const b = (await fetchSavedTechnicalData("PRY-EJ-001"))!;
    expect(b.data).toHaveLength(26);
    expect(b.data[0].value).not.toBe("MUTADO");
  });
});

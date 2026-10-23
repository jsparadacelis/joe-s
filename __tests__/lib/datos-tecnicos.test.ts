import {
  DEFINICIONES,
  GRUPOS,
  contarEditados,
  contarPendientes,
  esReferenciaCatastralValida,
  estaEditado,
  marcarTodoVerificado,
  obtenerDatosTecnicos,
  obtenerDatosTecnicosGuardados,
  reconsultar,
  restaurarDato,
  type DatoTecnico,
} from "@/lib/datos-tecnicos";

const REF_RESIDENCIAL = "1234567DG3413S0001AB";
const REF_OTRA = "ABCDEFGH123456789012";

const IDS_PARCELA = ["dir", "muni", "clase", "uso", "anyo", "sc", "spc", "spp", "coords", "alt", "pend", "pendcat"];
const IDS_CONDICIONES = ["zc", "ab", "k", "viento", "nieve", "fv"];
const IDS_PLANEAMIENTO = ["edif", "ocup", "altura", "plantas", "retv", "retl", "pmin", "scalc"];
const IDS = [...IDS_PARCELA, ...IDS_CONDICIONES, ...IDS_PLANEAMIENTO];

const def = (id: string) => DEFINICIONES.find((d) => d.id === id)!;
const dato = (over: Partial<DatoTecnico> = {}): DatoTecnico => ({
  id: "dir",
  valor: "CL PRUEBA 1",
  original: "CL PRUEBA 1",
  verificado: false,
  ...over,
});

describe("GRUPOS", () => {
  it("son tres, en orden, con id, nombre y descripción del borrador", () => {
    expect(GRUPOS.map((g) => [g.id, g.nombre])).toEqual([
      ["parcela", "Parcela"],
      ["condiciones", "Condiciones técnicas"],
      ["planeamiento", "Planeamiento"],
    ]);
    expect(GRUPOS.map((g) => g.descripcion)).toEqual([
      "Catastro, INSPIRE y Open-Meteo",
      "Tablas del CTE y la NCSE-02, PVGIS",
      "Manual, desde la ficha urbanística del municipio",
    ]);
  });
});

describe("DEFINICIONES", () => {
  it("son 26, con los ids del plan en orden (parcela, condiciones, planeamiento)", () => {
    expect(DEFINICIONES.map((d) => d.id)).toEqual(IDS);
    expect(DEFINICIONES).toHaveLength(26);
  });

  it("recuento por grupo 12 / 6 / 8 y cada dato pertenece al grupo de sus ids", () => {
    const de = (g: string) => DEFINICIONES.filter((d) => d.grupo === g).map((d) => d.id);
    expect(de("parcela")).toEqual(IDS_PARCELA);
    expect(de("condiciones")).toEqual(IDS_CONDICIONES);
    expect(de("planeamiento")).toEqual(IDS_PLANEAMIENTO);
  });

  it("etiquetas del borrador", () => {
    expect(DEFINICIONES.map((d) => d.etiqueta)).toEqual([
      "Dirección", "Municipio", "Clase", "Uso catastral", "Año de construcción", "Superficie construida",
      "Sup. de parcela (Catastro)", "Sup. de parcela (polígono)", "Coordenadas", "Altitud", "Pendiente", "Tipo de pendiente",
      "Zona climática", "Aceleración sísmica básica", "Coeficiente K", "Zona de viento", "Zona de clima invernal (nieve)", "Producción fotovoltaica",
      "Edificabilidad", "Ocupación máxima", "Altura máxima", "Número de plantas", "Retranqueo a vial", "Retranqueo a lindes", "Parcela mínima", "Superficie de cálculo",
    ]);
  });

  it("tipos: lista, número o texto según el borrador", () => {
    const listas = ["clase", "uso", "pendcat", "zc", "ab", "k", "viento", "nieve", "plantas", "scalc"];
    const numeros = ["anyo", "sc", "spc", "spp", "alt", "pend", "fv", "edif", "ocup", "altura", "retv", "retl", "pmin"];
    const textos = ["dir", "muni", "coords"];
    for (const id of listas) expect(def(id).tipo).toBe("lista");
    for (const id of numeros) expect(def(id).tipo).toBe("numero");
    for (const id of textos) expect(def(id).tipo).toBe("texto");
    expect(listas.length + numeros.length + textos.length).toBe(26);
  });

  it("solo las listas tienen opciones", () => {
    for (const d of DEFINICIONES) {
      if (d.tipo === "lista") expect(d.opciones && d.opciones.length).toBeGreaterThan(0);
      else expect(d.opciones).toBeUndefined();
    }
  });

  it("orígenes del borrador", () => {
    const origen = Object.fromEntries(DEFINICIONES.map((d) => [d.id, d.origen]));
    expect(origen).toMatchObject({
      dir: "Catastro", muni: "Catastro", clase: "Catastro", uso: "Catastro", anyo: "Catastro", sc: "Catastro", spc: "Catastro",
      spp: "INSPIRE · calculado", coords: "Catastro (CPMRC)", alt: "Open-Meteo", pend: "Calculado", pendcat: "Calculado",
      zc: "CTE DB-HE · Anejo B", ab: "NCSE-02 · Anejo 1", k: "NCSE-02 · Anejo 1", viento: "CTE DB-SE-AE", nieve: "CTE DB-SE-AE", fv: "PVGIS",
    });
    for (const id of IDS_PLANEAMIENTO) expect(origen[id]).toBe("Manual");
  });

  it("unidades del borrador", () => {
    const unidad = (id: string) => def(id).unidad;
    expect(unidad("sc")).toBe("m²");
    expect(unidad("spc")).toBe("m²");
    expect(unidad("spp")).toBe("m²");
    expect(unidad("alt")).toBe("m");
    expect(unidad("pend")).toBe("%");
    expect(unidad("fv")).toBe("kWh/kWp·año");
    expect(unidad("edif")).toBe("m²t/m²s");
    expect(unidad("ocup")).toBe("%");
    expect(unidad("altura")).toBe("m");
    expect(unidad("retv")).toBe("m");
    expect(unidad("retl")).toBe("m");
    expect(unidad("pmin")).toBe("m²");
    expect(unidad("anyo")).toBeFalsy();
  });

  it("opciones literales del borrador", () => {
    expect(def("clase").opciones).toEqual(["Urbano", "Rústico"]);
    expect(def("k").opciones).toEqual(["1,0", "1,1", "1,2", "1,3"]);
    expect(def("viento").opciones).toEqual(["A", "B", "C"]);
    expect(def("nieve").opciones).toEqual(["1", "2", "3", "4", "5", "6", "7"]);
    expect(def("plantas").opciones).toEqual(["PB", "PB+1", "PB+2", "PB+3", "PB+4", "PB+5"]);
    expect(def("scalc").opciones).toEqual(["Catastral", "Polígono", "Topográfico"]);
    expect(def("pendcat").opciones).toEqual([
      "Llana (< 3 %)", "Suave (3–10 %)", "Moderada (10–20 %)", "Pronunciada (20–35 %)", "Muy pronunciada (> 35 %)",
    ]);
    expect(def("uso").opciones).toEqual([
      "Residencial", "Industrial", "Oficinas", "Comercial", "Almacén y estacionamiento", "Ocio y hostelería",
      "Sanidad y beneficencia", "Cultural", "Deportivo", "Religioso", "Espectáculos", "Edificio singular", "Suelo sin edificar",
    ]);
    expect(def("zc").opciones).toEqual(["α3", "A2", "A3", "A4", "B2", "B3", "B4", "C1", "C2", "C3", "C4", "D1", "D2", "D3", "E1"]);
  });

  it("aceleración sísmica: «< 0,04 g» y de 0,04 g a 0,24 g (22 opciones)", () => {
    const ab = def("ab").opciones!;
    const esperado = ["< 0,04 g", ...Array.from({ length: 21 }, (_, i) => `0,${String(4 + i).padStart(2, "0")} g`)];
    expect(ab).toHaveLength(22);
    expect(ab[0]).toBe("< 0,04 g");
    expect(ab[1]).toBe("0,04 g");
    expect(ab[21]).toBe("0,24 g");
    expect(ab).toEqual(esperado);
  });
});

describe("estaEditado", () => {
  it("falso si el valor coincide con el original", () => {
    expect(estaEditado(dato())).toBe(false);
  });
  it("verdadero si el valor difiere del original", () => {
    expect(estaEditado(dato({ valor: "OTRA" }))).toBe(true);
  });
  it("verdadero si se vacía un dato que tenía original", () => {
    expect(estaEditado(dato({ valor: "" }))).toBe(true);
  });
  it("un dato manual (original null) nunca está editado", () => {
    expect(estaEditado(dato({ original: null, valor: "algo" }))).toBe(false);
    expect(estaEditado(dato({ original: null, valor: "" }))).toBe(false);
  });
  it("original vacío y valor escrito cuenta como editado", () => {
    expect(estaEditado(dato({ original: "", valor: "x" }))).toBe(true);
  });
});

describe("contarPendientes / contarEditados", () => {
  const lista = [
    dato({ id: "a", verificado: true }),
    dato({ id: "b", valor: "cambiado" }),
    dato({ id: "c", original: null, valor: "manual", verificado: true }),
    dato({ id: "d", valor: "otro", verificado: true }),
  ];
  it("pendientes = sin verificar", () => {
    expect(contarPendientes(lista)).toBe(1);
    expect(contarPendientes([])).toBe(0);
  });
  it("editados = con original y valor distinto (los manuales no cuentan)", () => {
    expect(contarEditados(lista)).toBe(2);
    expect(contarEditados([])).toBe(0);
  });
});

describe("restaurarDato", () => {
  it("devuelve el valor original y conserva el resto, sin mutar", () => {
    const d = dato({ valor: "CAMBIADO", verificado: true });
    const r = restaurarDato(d);
    expect(r).toEqual({ id: "dir", valor: "CL PRUEBA 1", original: "CL PRUEBA 1", verificado: true });
    expect(d.valor).toBe("CAMBIADO");
    expect(estaEditado(r)).toBe(false);
  });
  it("con original vacío restaura a vacío", () => {
    expect(restaurarDato(dato({ original: "", valor: "x" })).valor).toBe("");
  });
  it("sin original (manual) no cambia el valor", () => {
    const d = dato({ original: null, valor: "manual" });
    expect(restaurarDato(d)).toEqual(d);
  });
});

describe("marcarTodoVerificado", () => {
  it("marca todos y devuelve una copia sin mutar el original", () => {
    const original = [dato({ id: "a" }), dato({ id: "b", verificado: true, valor: "x" })];
    const r = marcarTodoVerificado(original);
    expect(r.every((d) => d.verificado)).toBe(true);
    expect(r.map((d) => [d.id, d.valor])).toEqual([["a", "CL PRUEBA 1"], ["b", "x"]]);
    expect(original[0].verificado).toBe(false);
    expect(r).not.toBe(original);
    expect(r[0]).not.toBe(original[0]);
    expect(contarPendientes(r)).toBe(0);
  });
  it("lista vacía devuelve lista vacía", () => {
    expect(marcarTodoVerificado([])).toEqual([]);
  });
});

describe("esReferenciaCatastralValida", () => {
  it.each([REF_RESIDENCIAL, REF_OTRA, "abcdefgh123456789012", `  ${REF_RESIDENCIAL}  `])("acepta %j", (ref) => {
    expect(esReferenciaCatastralValida(ref)).toBe(true);
  });
  it.each([
    ["19 caracteres", "1234567DG3413S0001A"],
    ["21 caracteres", "1234567DG3413S0001ABC"],
    ["símbolo", "1234567DG3413S0001A!"],
    ["espacio interior", "1234567DG3413 S0001A"],
    ["vacía", ""],
    ["solo espacios", "                    "],
  ])("rechaza %s", (_n, ref) => {
    expect(esReferenciaCatastralValida(ref)).toBe(false);
  });
});

describe("reconsultar", () => {
  const actual: DatoTecnico[] = [
    dato({ id: "dir", valor: "CL EDITADA 9", original: "CL VIEJA 1", verificado: true }),
    dato({ id: "muni", valor: "MUNI VIEJO", original: "MUNI VIEJO", verificado: true }),
    dato({ id: "edif", valor: "1,5", original: null, verificado: true }),
    dato({ id: "scalc", valor: "Polígono", original: null, verificado: false }),
  ];
  const nuevos: DatoTecnico[] = [
    dato({ id: "dir", valor: "CL NUEVA 2", original: "CL NUEVA 2" }),
    dato({ id: "muni", valor: "MUNI NUEVO", original: "MUNI NUEVO" }),
    dato({ id: "edif", valor: "", original: null }),
    dato({ id: "scalc", valor: "Catastral", original: null }),
  ];

  it("sustituye los datos de origen por los nuevos, con su original y sin verificar", () => {
    const r = reconsultar(actual, nuevos);
    const por = (id: string) => r.find((d) => d.id === id)!;
    expect(por("dir")).toEqual({ id: "dir", valor: "CL NUEVA 2", original: "CL NUEVA 2", verificado: false });
    expect(por("muni")).toEqual({ id: "muni", valor: "MUNI NUEVO", original: "MUNI NUEVO", verificado: false });
    expect(estaEditado(por("dir"))).toBe(false);
  });

  it("conserva los datos manuales tal como estaban (valor y verificado)", () => {
    const r = reconsultar(actual, nuevos);
    expect(r.find((d) => d.id === "edif")).toEqual({ id: "edif", valor: "1,5", original: null, verificado: true });
    expect(r.find((d) => d.id === "scalc")).toEqual({ id: "scalc", valor: "Polígono", original: null, verificado: false });
  });

  it("devuelve un dato por id de los nuevos, en su orden, sin mutar las entradas", () => {
    const copiaActual = JSON.parse(JSON.stringify(actual));
    const copiaNuevos = JSON.parse(JSON.stringify(nuevos));
    const r = reconsultar(actual, nuevos);
    expect(r.map((d) => d.id)).toEqual(["dir", "muni", "edif", "scalc"]);
    expect(actual).toEqual(copiaActual);
    expect(nuevos).toEqual(copiaNuevos);
  });

  it("un dato que no estaba en el estado actual se toma de los nuevos", () => {
    const r = reconsultar([], nuevos);
    expect(r).toEqual(nuevos);
  });
});

describe("obtenerDatosTecnicos", () => {
  it("referencia residencial: valores de ejemplo del borrador", async () => {
    const r = await obtenerDatosTecnicos(REF_RESIDENCIAL);
    expect(r.referenciaCatastral).toBe(REF_RESIDENCIAL);
    const v = Object.fromEntries(r.datos.map((d) => [d.id, d.valor]));
    expect(v).toMatchObject({
      dir: "CL EJEMPLO 12", muni: "VIC (BARCELONA)", clase: "Urbano", uso: "Residencial", anyo: "1958",
      sc: "142", spc: "96", spp: "99,4", coords: "41,93 N · 2,25 E", alt: "490", pend: "2", pendcat: "Llana (< 3 %)",
      zc: "D2", ab: "< 0,04 g", k: "1,0", viento: "C", nieve: "2", fv: "1390",
    });
  });

  it("otra referencia válida: valores de ejemplo industriales", async () => {
    const r = await obtenerDatosTecnicos(REF_OTRA);
    expect(r.referenciaCatastral).toBe(REF_OTRA);
    const v = Object.fromEntries(r.datos.map((d) => [d.id, d.valor]));
    expect(v).toMatchObject({
      dir: "PG EJEMPLO 4", muni: "SABADELL (BARCELONA)", uso: "Industrial", anyo: "1987", sc: "1240", spc: "3150", spp: "3122",
      zc: "C2", ab: "0,04 g", fv: "1420",
    });
  });

  it("26 datos en el orden de DEFINICIONES, con fecha de consulta ISO", async () => {
    const r = await obtenerDatosTecnicos(REF_RESIDENCIAL);
    expect(r.datos.map((d) => d.id)).toEqual(DEFINICIONES.map((d) => d.id));
    expect(r.consultadoEl).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("los datos de origen guardan original = valor y llegan sin verificar", async () => {
    for (const ref of [REF_RESIDENCIAL, REF_OTRA]) {
      const r = await obtenerDatosTecnicos(ref);
      for (const d of r.datos.filter((x) => def(x.id).grupo !== "planeamiento")) {
        expect(d.original).toBe(d.valor);
        expect(d.valor).not.toBe("");
        expect(d.verificado).toBe(false);
        if (def(d.id).tipo === "lista") expect(def(d.id).opciones).toContain(d.valor);
      }
      expect(contarEditados(r.datos)).toBe(0);
    }
  });

  it("planeamiento vacío salvo scalc = «Catastral», con original null y sin verificar", async () => {
    const r = await obtenerDatosTecnicos(REF_RESIDENCIAL);
    for (const d of r.datos.filter((x) => def(x.id).grupo === "planeamiento")) {
      expect(d.original).toBeNull();
      expect(d.verificado).toBe(false);
      expect(d.valor).toBe(d.id === "scalc" ? "Catastral" : "");
    }
  });

  it("devuelve copias: modificar el resultado no afecta a la siguiente consulta", async () => {
    const a = await obtenerDatosTecnicos(REF_RESIDENCIAL);
    a.datos[0].valor = "MUTADO";
    a.datos[0].verificado = true;
    a.datos.pop();
    const b = await obtenerDatosTecnicos(REF_RESIDENCIAL);
    expect(b.datos).toHaveLength(26);
    expect(b.datos[0].valor).toBe("CL EJEMPLO 12");
    expect(b.datos[0].verificado).toBe(false);
  });

  it("datos ficticios: sin correos ni teléfonos", async () => {
    const r = await obtenerDatosTecnicos(REF_RESIDENCIAL);
    expect(JSON.stringify(r)).not.toMatch(/@|\b\d{9}\b/);
  });
});

describe("obtenerDatosTecnicosGuardados", () => {
  it("PRY-EJ-004 aún no tiene datos: null", async () => {
    expect(await obtenerDatosTecnicosGuardados("PRY-EJ-004")).toBeNull();
  });
  it("PRY-EJ-002 y códigos desconocidos: null", async () => {
    expect(await obtenerDatosTecnicosGuardados("PRY-EJ-002")).toBeNull();
    expect(await obtenerDatosTecnicosGuardados("PRY-EJ-003")).toBeNull();
    expect(await obtenerDatosTecnicosGuardados("NO-EXISTE")).toBeNull();
    expect(await obtenerDatosTecnicosGuardados("")).toBeNull();
  });
  it("PRY-EJ-001: datos completos, verificados y con exactamente 2 editados", async () => {
    const r = await obtenerDatosTecnicosGuardados("PRY-EJ-001");
    expect(r).not.toBeNull();
    expect(esReferenciaCatastralValida(r!.referenciaCatastral)).toBe(true);
    expect(r!.consultadoEl).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(r!.datos.map((d) => d.id)).toEqual(IDS);
    expect(contarPendientes(r!.datos)).toBe(0);
    expect(contarEditados(r!.datos)).toBe(2);
  });
  it("devuelve copias", async () => {
    const a = (await obtenerDatosTecnicosGuardados("PRY-EJ-001"))!;
    a.datos[0].valor = "MUTADO";
    a.datos.length = 0;
    const b = (await obtenerDatosTecnicosGuardados("PRY-EJ-001"))!;
    expect(b.datos).toHaveLength(26);
    expect(b.datos[0].valor).not.toBe("MUTADO");
  });
});

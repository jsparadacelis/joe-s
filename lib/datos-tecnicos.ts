/**
 * Datos técnicos del inmueble (RGB-29).
 * Las firmas exportadas son el contrato con la API: cuando existan RGB-24, RGB-27 y
 * RGB-28 se sustituye el bloque «DATOS DE EJEMPLO» por el cliente de la API sin tocar
 * los componentes. El front nunca llama a servicios externos.
 */

export type GrupoId = "parcela" | "condiciones" | "planeamiento";
export type TipoDato = "texto" | "numero" | "lista";

export interface Grupo {
  id: GrupoId;
  nombre: string;
  descripcion: string;
}

export interface DefinicionDato {
  id: string;
  grupo: GrupoId;
  etiqueta: string;
  tipo: TipoDato;
  origen: string;
  unidad?: string;
  opciones?: readonly string[];
}

/** `original` null: dato manual (no viene de ninguna consulta). */
export interface DatoTecnico {
  id: string;
  valor: string;
  original: string | null;
  verificado: boolean;
}

export interface DatosTecnicos {
  referenciaCatastral: string;
  /** Fecha ISO yyyy-mm-dd. */
  consultadoEl: string | null;
  datos: DatoTecnico[];
}

export const GRUPOS: readonly Grupo[] = [
  { id: "parcela", nombre: "Parcela", descripcion: "Catastro, INSPIRE y Open-Meteo" },
  { id: "condiciones", nombre: "Condiciones técnicas", descripcion: "Tablas del CTE y la NCSE-02, PVGIS" },
  { id: "planeamiento", nombre: "Planeamiento", descripcion: "Manual, desde la ficha urbanística del municipio" },
];

const USOS = [
  "Residencial", "Industrial", "Oficinas", "Comercial", "Almacén y estacionamiento", "Ocio y hostelería",
  "Sanidad y beneficencia", "Cultural", "Deportivo", "Religioso", "Espectáculos", "Edificio singular", "Suelo sin edificar",
] as const;
const ZONAS = ["α3", "A2", "A3", "A4", "B2", "B3", "B4", "C1", "C2", "C3", "C4", "D1", "D2", "D3", "E1"] as const;
// «< 0,04 g» y de 0,04 g a 0,24 g en pasos de 0,01.
const ACELERACIONES = [
  "< 0,04 g",
  ...Array.from({ length: 21 }, (_, i) => `0,${String(4 + i).padStart(2, "0")} g`),
] as const;
const PENDIENTES = [
  "Llana (< 3 %)", "Suave (3–10 %)", "Moderada (10–20 %)", "Pronunciada (20–35 %)", "Muy pronunciada (> 35 %)",
] as const;

export const DEFINICIONES: readonly DefinicionDato[] = [
  { id: "dir", grupo: "parcela", etiqueta: "Dirección", tipo: "texto", origen: "Catastro" },
  { id: "muni", grupo: "parcela", etiqueta: "Municipio", tipo: "texto", origen: "Catastro" },
  { id: "clase", grupo: "parcela", etiqueta: "Clase", tipo: "lista", origen: "Catastro", opciones: ["Urbano", "Rústico"] },
  { id: "uso", grupo: "parcela", etiqueta: "Uso catastral", tipo: "lista", origen: "Catastro", opciones: USOS },
  { id: "anyo", grupo: "parcela", etiqueta: "Año de construcción", tipo: "numero", origen: "Catastro" },
  { id: "sc", grupo: "parcela", etiqueta: "Superficie construida", tipo: "numero", origen: "Catastro", unidad: "m²" },
  { id: "spc", grupo: "parcela", etiqueta: "Sup. de parcela (Catastro)", tipo: "numero", origen: "Catastro", unidad: "m²" },
  { id: "spp", grupo: "parcela", etiqueta: "Sup. de parcela (polígono)", tipo: "numero", origen: "INSPIRE · calculado", unidad: "m²" },
  { id: "coords", grupo: "parcela", etiqueta: "Coordenadas", tipo: "texto", origen: "Catastro (CPMRC)" },
  { id: "alt", grupo: "parcela", etiqueta: "Altitud", tipo: "numero", origen: "Open-Meteo", unidad: "m" },
  { id: "pend", grupo: "parcela", etiqueta: "Pendiente", tipo: "numero", origen: "Calculado", unidad: "%" },
  { id: "pendcat", grupo: "parcela", etiqueta: "Tipo de pendiente", tipo: "lista", origen: "Calculado", opciones: PENDIENTES },
  { id: "zc", grupo: "condiciones", etiqueta: "Zona climática", tipo: "lista", origen: "CTE DB-HE · Anejo B", opciones: ZONAS },
  { id: "ab", grupo: "condiciones", etiqueta: "Aceleración sísmica básica", tipo: "lista", origen: "NCSE-02 · Anejo 1", opciones: ACELERACIONES },
  { id: "k", grupo: "condiciones", etiqueta: "Coeficiente K", tipo: "lista", origen: "NCSE-02 · Anejo 1", opciones: ["1,0", "1,1", "1,2", "1,3"] },
  { id: "viento", grupo: "condiciones", etiqueta: "Zona de viento", tipo: "lista", origen: "CTE DB-SE-AE", opciones: ["A", "B", "C"] },
  { id: "nieve", grupo: "condiciones", etiqueta: "Zona de clima invernal (nieve)", tipo: "lista", origen: "CTE DB-SE-AE", opciones: ["1", "2", "3", "4", "5", "6", "7"] },
  { id: "fv", grupo: "condiciones", etiqueta: "Producción fotovoltaica", tipo: "numero", origen: "PVGIS", unidad: "kWh/kWp·año" },
  { id: "edif", grupo: "planeamiento", etiqueta: "Edificabilidad", tipo: "numero", origen: "Manual", unidad: "m²t/m²s" },
  { id: "ocup", grupo: "planeamiento", etiqueta: "Ocupación máxima", tipo: "numero", origen: "Manual", unidad: "%" },
  { id: "altura", grupo: "planeamiento", etiqueta: "Altura máxima", tipo: "numero", origen: "Manual", unidad: "m" },
  { id: "plantas", grupo: "planeamiento", etiqueta: "Número de plantas", tipo: "lista", origen: "Manual", opciones: ["PB", "PB+1", "PB+2", "PB+3", "PB+4", "PB+5"] },
  { id: "retv", grupo: "planeamiento", etiqueta: "Retranqueo a vial", tipo: "numero", origen: "Manual", unidad: "m" },
  { id: "retl", grupo: "planeamiento", etiqueta: "Retranqueo a lindes", tipo: "numero", origen: "Manual", unidad: "m" },
  { id: "pmin", grupo: "planeamiento", etiqueta: "Parcela mínima", tipo: "numero", origen: "Manual", unidad: "m²" },
  { id: "scalc", grupo: "planeamiento", etiqueta: "Superficie de cálculo", tipo: "lista", origen: "Manual", opciones: ["Catastral", "Polígono", "Topográfico"] },
];

// ---- Funciones puras ----

export function estaEditado(d: DatoTecnico): boolean {
  return d.original !== null && d.valor !== d.original;
}

export function contarPendientes(datos: DatoTecnico[]): number {
  return datos.filter((d) => !d.verificado).length;
}

export function contarEditados(datos: DatoTecnico[]): number {
  return datos.filter(estaEditado).length;
}

export function restaurarDato(d: DatoTecnico): DatoTecnico {
  return d.original === null ? d : { ...d, valor: d.original };
}

export function marcarTodoVerificado(datos: DatoTecnico[]): DatoTecnico[] {
  return datos.map((d) => ({ ...d, verificado: true }));
}

export function esReferenciaCatastralValida(ref: string): boolean {
  return /^[0-9A-Za-z]{20}$/.test(ref.trim());
}

const GRUPO_POR_ID = new Map(DEFINICIONES.map((d) => [d.id, d.grupo]));

/** Manual = del grupo Planeamiento; un id desconocido se considera manual si no tiene original. */
function esManual(d: DatoTecnico): boolean {
  const grupo = GRUPO_POR_ID.get(d.id);
  return grupo ? grupo === "planeamiento" : d.original === null;
}

/**
 * Datos de origen nuevos (sin verificar); los manuales (planeamiento) del estado actual se conservan.
 * Los de parcela y condiciones son de origen aunque se hayan introducido a mano tras un fallo de la consulta.
 */
export function reconsultar(actual: DatoTecnico[], nuevos: DatoTecnico[]): DatoTecnico[] {
  const previos = new Map(actual.map((d) => [d.id, d]));
  return nuevos.map((n) => {
    const previo = previos.get(n.id);
    return previo && esManual(previo) ? { ...previo } : { ...n };
  });
}

// ---- DATOS DE EJEMPLO (ficticios; sustituible por el cliente de la API) ----

type Valores = Readonly<Record<string, string>>;

const RESIDENCIAL: Valores = {
  dir: "CL EJEMPLO 12", muni: "VIC (BARCELONA)", clase: "Urbano", uso: "Residencial", anyo: "1958", sc: "142", spc: "96",
  spp: "99,4", coords: "41,93 N · 2,25 E", alt: "490", pend: "2", pendcat: "Llana (< 3 %)",
  zc: "D2", ab: "< 0,04 g", k: "1,0", viento: "C", nieve: "2", fv: "1390",
};
const INDUSTRIAL: Valores = {
  dir: "PG EJEMPLO 4", muni: "SABADELL (BARCELONA)", clase: "Urbano", uso: "Industrial", anyo: "1987", sc: "1240", spc: "3150",
  spp: "3122", coords: "41,55 N · 2,10 E", alt: "190", pend: "1", pendcat: "Llana (< 3 %)",
  zc: "C2", ab: "0,04 g", k: "1,0", viento: "C", nieve: "2", fv: "1420",
};
const PLANEAMIENTO_EJEMPLO: Valores = {
  edif: "1,5", ocup: "70", altura: "10,5", plantas: "PB+2", retv: "0", retl: "0", pmin: "80", scalc: "Catastral",
};

const REFERENCIA_RESIDENCIAL = "1234567DG3413S0001AB";
const FECHA_CONSULTA = "2026-10-18";

function construir(origen: Valores, manual: Valores, verificado: boolean): DatoTecnico[] {
  return DEFINICIONES.map((d) => {
    if (d.grupo === "planeamiento") {
      return { id: d.id, valor: manual[d.id] ?? "", original: null, verificado };
    }
    const valor = origen[d.id] ?? "";
    return { id: d.id, valor, original: valor, verificado };
  });
}

function copia(d: DatosTecnicos): DatosTecnicos {
  return { ...d, datos: d.datos.map((x) => ({ ...x })) };
}

// ---- Funciones públicas (mismas firmas que el cliente de la API) ----

export async function obtenerDatosTecnicos(referenciaCatastral: string): Promise<DatosTecnicos> {
  const ref = referenciaCatastral.trim();
  const origen = ref.toUpperCase() === REFERENCIA_RESIDENCIAL ? RESIDENCIAL : INDUSTRIAL;
  return {
    referenciaCatastral: ref,
    consultadoEl: FECHA_CONSULTA,
    datos: construir(origen, { scalc: "Catastral" }, false),
  };
}

export async function obtenerDatosTecnicosGuardados(codigo: string): Promise<DatosTecnicos | null> {
  if (codigo !== "PRY-EJ-001") return null;
  const datos = construir(RESIDENCIAL, PLANEAMIENTO_EJEMPLO, true);
  // Dos datos de origen corregidos a mano, conservando su valor original.
  const editar = (id: string, valor: string) => {
    const d = datos.find((x) => x.id === id);
    if (d) d.valor = valor;
  };
  editar("sc", "138");
  editar("spp", "98");
  return copia({ referenciaCatastral: REFERENCIA_RESIDENCIAL, consultadoEl: FECHA_CONSULTA, datos });
}

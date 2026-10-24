/**
 * Technical data of the property (RGB-29).
 * The exported signatures are the contract with the API: once RGB-24, RGB-27 and
 * RGB-28 exist the "SAMPLE DATA" block is replaced by the API client without touching
 * the components. The front end never calls external services.
 */

export type DataGroupId = "plot" | "conditions" | "planning";
export type DatumType = "text" | "number" | "list";

export interface DataGroup {
  id: DataGroupId;
  name: string;
  description: string;
}

export interface DatumDefinition {
  id: string;
  group: DataGroupId;
  label: string;
  type: DatumType;
  origin: string;
  unit?: string;
  options?: readonly string[];
}

/** `original` null: manual datum (does not come from any query). */
export interface TechnicalDatum {
  id: string;
  value: string;
  original: string | null;
  verified: boolean;
}

export interface TechnicalData {
  cadastralReference: string;
  /** ISO date yyyy-mm-dd. */
  queriedOn: string | null;
  data: TechnicalDatum[];
}

export const DATA_GROUPS: readonly DataGroup[] = [
  { id: "plot", name: "Parcela", description: "Catastro, INSPIRE y Open-Meteo" },
  { id: "conditions", name: "Condiciones técnicas", description: "Tablas del CTE y la NCSE-02, PVGIS" },
  { id: "planning", name: "Planeamiento", description: "Manual, desde la ficha urbanística del municipio" },
];

const USES = [
  "Residencial", "Industrial", "Oficinas", "Comercial", "Almacén y estacionamiento", "Ocio y hostelería",
  "Sanidad y beneficencia", "Cultural", "Deportivo", "Religioso", "Espectáculos", "Edificio singular", "Suelo sin edificar",
] as const;
const ZONES = ["α3", "A2", "A3", "A4", "B2", "B3", "B4", "C1", "C2", "C3", "C4", "D1", "D2", "D3", "E1"] as const;
// «< 0,04 g» and from 0,04 g to 0,24 g in steps of 0,01.
const ACCELERATIONS = [
  "< 0,04 g",
  ...Array.from({ length: 21 }, (_, i) => `0,${String(4 + i).padStart(2, "0")} g`),
] as const;
const SLOPE_TYPES = [
  "Llana (< 3 %)", "Suave (3–10 %)", "Moderada (10–20 %)", "Pronunciada (20–35 %)", "Muy pronunciada (> 35 %)",
] as const;

export const DEFINITIONS: readonly DatumDefinition[] = [
  { id: "address", group: "plot", label: "Dirección", type: "text", origin: "Catastro" },
  { id: "municipality", group: "plot", label: "Municipio", type: "text", origin: "Catastro" },
  { id: "propertyClass", group: "plot", label: "Clase", type: "list", origin: "Catastro", options: ["Urbano", "Rústico"] },
  { id: "use", group: "plot", label: "Uso catastral", type: "list", origin: "Catastro", options: USES },
  { id: "year", group: "plot", label: "Año de construcción", type: "number", origin: "Catastro" },
  { id: "builtArea", group: "plot", label: "Superficie construida", type: "number", origin: "Catastro", unit: "m²" },
  { id: "cadastralPlotArea", group: "plot", label: "Sup. de parcela (Catastro)", type: "number", origin: "Catastro", unit: "m²" },
  { id: "polygonPlotArea", group: "plot", label: "Sup. de parcela (polígono)", type: "number", origin: "INSPIRE · calculado", unit: "m²" },
  { id: "coords", group: "plot", label: "Coordenadas", type: "text", origin: "Catastro (CPMRC)" },
  { id: "altitude", group: "plot", label: "Altitud", type: "number", origin: "Open-Meteo", unit: "m" },
  { id: "slope", group: "plot", label: "Pendiente", type: "number", origin: "Calculado", unit: "%" },
  { id: "slopeType", group: "plot", label: "Tipo de pendiente", type: "list", origin: "Calculado", options: SLOPE_TYPES },
  { id: "climateZone", group: "conditions", label: "Zona climática", type: "list", origin: "CTE DB-HE · Anejo B", options: ZONES },
  { id: "seismicAcceleration", group: "conditions", label: "Aceleración sísmica básica", type: "list", origin: "NCSE-02 · Anejo 1", options: ACCELERATIONS },
  { id: "kCoefficient", group: "conditions", label: "Coeficiente K", type: "list", origin: "NCSE-02 · Anejo 1", options: ["1,0", "1,1", "1,2", "1,3"] },
  { id: "windZone", group: "conditions", label: "Zona de viento", type: "list", origin: "CTE DB-SE-AE", options: ["A", "B", "C"] },
  { id: "snowZone", group: "conditions", label: "Zona de clima invernal (nieve)", type: "list", origin: "CTE DB-SE-AE", options: ["1", "2", "3", "4", "5", "6", "7"] },
  { id: "pvProduction", group: "conditions", label: "Producción fotovoltaica", type: "number", origin: "PVGIS", unit: "kWh/kWp·año" },
  { id: "buildability", group: "planning", label: "Edificabilidad", type: "number", origin: "Manual", unit: "m²t/m²s" },
  { id: "maxOccupancy", group: "planning", label: "Ocupación máxima", type: "number", origin: "Manual", unit: "%" },
  { id: "maxHeight", group: "planning", label: "Altura máxima", type: "number", origin: "Manual", unit: "m" },
  { id: "floors", group: "planning", label: "Número de plantas", type: "list", origin: "Manual", options: ["PB", "PB+1", "PB+2", "PB+3", "PB+4", "PB+5"] },
  { id: "streetSetback", group: "planning", label: "Retranqueo a vial", type: "number", origin: "Manual", unit: "m" },
  { id: "boundarySetback", group: "planning", label: "Retranqueo a lindes", type: "number", origin: "Manual", unit: "m" },
  { id: "minPlot", group: "planning", label: "Parcela mínima", type: "number", origin: "Manual", unit: "m²" },
  { id: "calcArea", group: "planning", label: "Superficie de cálculo", type: "list", origin: "Manual", options: ["Catastral", "Polígono", "Topográfico"] },
];

// ---- Pure functions ----

export function isEdited(d: TechnicalDatum): boolean {
  return d.original !== null && d.value !== d.original;
}

export function countPending(data: TechnicalDatum[]): number {
  return data.filter((d) => !d.verified).length;
}

export function countEdited(data: TechnicalDatum[]): number {
  return data.filter(isEdited).length;
}

export function restoreDatum(d: TechnicalDatum): TechnicalDatum {
  return d.original === null ? d : { ...d, value: d.original };
}

export function markAllVerified(data: TechnicalDatum[]): TechnicalDatum[] {
  return data.map((d) => ({ ...d, verified: true }));
}

export function isValidCadastralReference(ref: string): boolean {
  return /^[0-9A-Za-z]{20}$/.test(ref.trim());
}

const GROUP_BY_ID = new Map(DEFINITIONS.map((d) => [d.id, d.group]));

/** Manual = from the Planning group; an unknown id is considered manual if it has no original. */
function isManual(d: TechnicalDatum): boolean {
  const group = GROUP_BY_ID.get(d.id);
  return group ? group === "planning" : d.original === null;
}

/**
 * New origin data (unverified); the manual ones (planning) of the current state are kept.
 * Plot and conditions data are origin data even if entered by hand after a query failure.
 */
export function requery(current: TechnicalDatum[], incoming: TechnicalDatum[]): TechnicalDatum[] {
  const previousById = new Map(current.map((d) => [d.id, d]));
  return incoming.map((n) => {
    const previous = previousById.get(n.id);
    return previous && isManual(previous) ? { ...previous } : { ...n };
  });
}

// ---- SAMPLE DATA (fictitious; replaceable by the API client) ----

type Values = Readonly<Record<string, string>>;

const RESIDENTIAL: Values = {
  address: "CL EJEMPLO 12", municipality: "VIC (BARCELONA)", propertyClass: "Urbano", use: "Residencial", year: "1958", builtArea: "142", cadastralPlotArea: "96",
  polygonPlotArea: "99,4", coords: "41,93 N · 2,25 E", altitude: "490", slope: "2", slopeType: "Llana (< 3 %)",
  climateZone: "D2", seismicAcceleration: "< 0,04 g", kCoefficient: "1,0", windZone: "C", snowZone: "2", pvProduction: "1390",
};
const INDUSTRIAL: Values = {
  address: "PG EJEMPLO 4", municipality: "SABADELL (BARCELONA)", propertyClass: "Urbano", use: "Industrial", year: "1987", builtArea: "1240", cadastralPlotArea: "3150",
  polygonPlotArea: "3122", coords: "41,55 N · 2,10 E", altitude: "190", slope: "1", slopeType: "Llana (< 3 %)",
  climateZone: "C2", seismicAcceleration: "0,04 g", kCoefficient: "1,0", windZone: "C", snowZone: "2", pvProduction: "1420",
};
const SAMPLE_PLANNING: Values = {
  buildability: "1,5", maxOccupancy: "70", maxHeight: "10,5", floors: "PB+2", streetSetback: "0", boundarySetback: "0", minPlot: "80", calcArea: "Catastral",
};

const RESIDENTIAL_REFERENCE = "1234567DG3413S0001AB";
const QUERY_DATE = "2026-10-18";

function build(origin: Values, manual: Values, verified: boolean): TechnicalDatum[] {
  return DEFINITIONS.map((d) => {
    if (d.group === "planning") {
      return { id: d.id, value: manual[d.id] ?? "", original: null, verified };
    }
    const value = origin[d.id] ?? "";
    return { id: d.id, value, original: value, verified };
  });
}

function copyOf(d: TechnicalData): TechnicalData {
  return { ...d, data: d.data.map((x) => ({ ...x })) };
}

// ---- Public functions (same signatures as the API client) ----

export async function fetchTechnicalData(cadastralReference: string): Promise<TechnicalData> {
  const ref = cadastralReference.trim();
  const origin = ref.toUpperCase() === RESIDENTIAL_REFERENCE ? RESIDENTIAL : INDUSTRIAL;
  return {
    cadastralReference: ref,
    queriedOn: QUERY_DATE,
    data: build(origin, { calcArea: "Catastral" }, false),
  };
}

export async function fetchSavedTechnicalData(code: string): Promise<TechnicalData | null> {
  if (code !== "PRY-EJ-001") return null;
  const data = build(RESIDENTIAL, SAMPLE_PLANNING, true);
  // Two origin data corrected by hand, keeping their original value.
  const edit = (id: string, value: string) => {
    const d = data.find((x) => x.id === id);
    if (d) d.value = value;
  };
  edit("builtArea", "138");
  edit("polygonPlotArea", "98");
  return copyOf({ cadastralReference: RESIDENTIAL_REFERENCE, queriedOn: QUERY_DATE, data });
}

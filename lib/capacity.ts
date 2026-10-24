/**
 * Capacidad edificable del inmueble (RGB-29).
 * Función pura, sustituible por el servicio de cálculo del servidor (RGB-30)
 * sin tocar los componentes.
 */
import type { TechnicalDatum } from "@/lib/technical-data";

export interface Capacity {
  surface: number;
  buildableArea: number;
  footprint: number;
  byFloors: number;
  maximum: number;
  limitedBy: "buildability" | "occupancy-floors";
  existing: number | null;
  minPlot: number | null;
  meetsMinPlot: boolean | null;
}

const FLOORS: Readonly<Record<string, number>> = { PB: 1, "PB+1": 2, "PB+2": 3, "PB+3": 4, "PB+4": 5, "PB+5": 6 };

/** «1.240,5» pasa a 1240.5; vacío o no numérico pasa a null. */
export function parseNumber(v: string): number | null {
  if (typeof v !== "string") return null;
  const n = parseFloat(v.replace(/\./g, "").replace(",", "."));
  return Number.isNaN(n) ? null : n;
}

const formats = new Map<number, Intl.NumberFormat>();

/** Formato es-ES; null se muestra como «—». */
export function formatNumber(n: number | null, decimales = 0): string {
  if (n === null) return "—";
  let f = formats.get(decimales);
  if (!f) {
    f = new Intl.NumberFormat("es-ES", { maximumFractionDigits: decimales });
    formats.set(decimales, f);
  }
  return f.format(n);
}

export function calculateCapacity(data: TechnicalDatum[]): Capacity | null {
  const values = new Map(data.map((d) => [d.id, d.value]));
  const num = (id: string) => parseNumber(values.get(id) ?? "");

  const surface = values.get("calcArea") === "Polígono" ? num("polygonPlotArea") : num("cadastralPlotArea");
  const edificabilidad = num("buildability");
  const ocupacion = num("maxOccupancy");
  const plantas = FLOORS[values.get("floors") ?? ""];
  if (surface === null || edificabilidad === null || ocupacion === null || !plantas) return null;

  const buildableArea = surface * edificabilidad;
  const footprint = (surface * ocupacion) / 100;
  const byFloors = footprint * plantas;
  const minPlot = num("minPlot");

  return {
    surface,
    buildableArea,
    footprint,
    byFloors,
    maximum: Math.min(buildableArea, byFloors),
    limitedBy: buildableArea <= byFloors ? "buildability" : "occupancy-floors",
    existing: num("builtArea"),
    minPlot,
    meetsMinPlot: minPlot === null ? null : surface >= minPlot,
  };
}

/**
 * Capacidad edificable del inmueble (RGB-29).
 * Función pura, sustituible por el servicio de cálculo del servidor (RGB-30)
 * sin tocar los componentes.
 */
import type { DatoTecnico } from "@/lib/datos-tecnicos";

export interface Capacidad {
  superficie: number;
  techo: number;
  huella: number;
  porPlantas: number;
  maximo: number;
  limita: "Edificabilidad" | "Ocupación × plantas";
  existente: number | null;
  parcelaMinima: number | null;
  cumpleParcelaMinima: boolean | null;
}

const PLANTAS: Readonly<Record<string, number>> = { PB: 1, "PB+1": 2, "PB+2": 3, "PB+3": 4, "PB+4": 5, "PB+5": 6 };

/** «1.240,5» pasa a 1240.5; vacío o no numérico pasa a null. */
export function parseNumero(v: string): number | null {
  if (typeof v !== "string") return null;
  const n = parseFloat(v.replace(/\./g, "").replace(",", "."));
  return Number.isNaN(n) ? null : n;
}

const formatos = new Map<number, Intl.NumberFormat>();

/** Formato es-ES; null se muestra como «—». */
export function formatearNumero(n: number | null, decimales = 0): string {
  if (n === null) return "—";
  let f = formatos.get(decimales);
  if (!f) {
    f = new Intl.NumberFormat("es-ES", { maximumFractionDigits: decimales });
    formatos.set(decimales, f);
  }
  return f.format(n);
}

export function calcularCapacidad(datos: DatoTecnico[]): Capacidad | null {
  const valores = new Map(datos.map((d) => [d.id, d.valor]));
  const num = (id: string) => parseNumero(valores.get(id) ?? "");

  const superficie = valores.get("scalc") === "Polígono" ? num("spp") : num("spc");
  const edificabilidad = num("edif");
  const ocupacion = num("ocup");
  const plantas = PLANTAS[valores.get("plantas") ?? ""];
  if (superficie === null || edificabilidad === null || ocupacion === null || !plantas) return null;

  const techo = superficie * edificabilidad;
  const huella = (superficie * ocupacion) / 100;
  const porPlantas = huella * plantas;
  const parcelaMinima = num("pmin");

  return {
    superficie,
    techo,
    huella,
    porPlantas,
    maximo: Math.min(techo, porPlantas),
    limita: techo <= porPlantas ? "Edificabilidad" : "Ocupación × plantas",
    existente: num("sc"),
    parcelaMinima,
    cumpleParcelaMinima: parcelaMinima === null ? null : superficie >= parcelaMinima,
  };
}

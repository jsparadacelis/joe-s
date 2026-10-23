/** Colores de la escena, leídos de los tokens CSS del tema activo (nunca literales). */
export interface ColoresEscena {
  fondo: string;
  acento: string;
  borde: string;
}

/** Rampa de alturas (de la cota más baja a la más alta), también definida por tokens. */
export type RampaAlturas = readonly [string, string, string, string];

const TOKENS_RAMPA = ["--relieve-bajo", "--relieve-medio-bajo", "--relieve-medio-alto", "--relieve-alto"] as const;

function leer(estilo: CSSStyleDeclaration, token: string): string {
  return estilo.getPropertyValue(token).trim();
}

/** Lee fondo, acento y borde del documento. En entornos sin estilos (tests) devuelve cadenas vacías. */
export function leerColoresEscena(raiz: Element = document.documentElement): ColoresEscena {
  const estilo = getComputedStyle(raiz);
  return { fondo: leer(estilo, "--surface-2"), acento: leer(estilo, "--point"), borde: leer(estilo, "--line") };
}

/** Lee la rampa de alturas de los tokens `--relieve-*`. */
export function leerRampaAlturas(raiz: Element = document.documentElement): RampaAlturas {
  const estilo = getComputedStyle(raiz);
  const [a, b, c, d] = TOKENS_RAMPA.map((t) => leer(estilo, t));
  return [a, b, c, d];
}

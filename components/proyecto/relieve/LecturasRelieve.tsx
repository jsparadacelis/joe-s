import type { Exageracion, Relieve } from "@/lib/relieve";
import type { Lecturas } from "@/lib/relieve-lecturas";

export type LecturasRelieveProps = {
  lecturas: Lecturas | null;
  ventana: Relieve["ventana"];
  exageracion: Exageracion;
};

const numero = (valor: number, decimales = 0) =>
  new Intl.NumberFormat("es-ES", { minimumFractionDigits: decimales, maximumFractionDigits: decimales }).format(valor);

function Lectura({ etiqueta, valor }: { etiqueta: string; valor: string }) {
  return (
    <div className="flex flex-col gap-0.5 rounded-base bg-surface-2 px-3 py-2">
      <dt className="text-xs text-muted">{etiqueta}</dt>
      <dd className="text-s font-medium tabular-nums">{valor}</dd>
    </div>
  );
}

export function LecturasRelieve({ lecturas, ventana, exageracion }: LecturasRelieveProps) {
  const [x0, y0, x1, y1] = ventana;
  return (
    <dl className="grid grid-cols-2 gap-2 md:grid-cols-3">
      {lecturas ? (
        <>
          <Lectura etiqueta="Superficie del polígono" valor={`${numero(lecturas.superficie)} m²`} />
          <Lectura
            etiqueta="Altitud en la parcela"
            valor={`${numero(lecturas.alturaMin, 1)}–${numero(lecturas.alturaMax, 1)} m`}
          />
          <Lectura etiqueta="Desnivel" valor={`${numero(lecturas.desnivel, 1)} m`} />
          <Lectura etiqueta="Pendiente media" valor={`${numero(lecturas.pendienteMedia, 1)} %`} />
        </>
      ) : null}
      <Lectura etiqueta="Vista" valor={`${numero(x1 - x0)} × ${numero(y1 - y0)} m`} />
      <Lectura etiqueta="Relieve" valor={`×${exageracion} vertical`} />
    </dl>
  );
}

"use client";

import { Minus, Plus, RotateCcw } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Notice } from "@/components/ui/Notice";
import { Panel } from "@/components/ui/Panel";
import { esReferenciaCatastralValida } from "@/lib/datos-tecnicos";
import { obtenerRelieve, type Exageracion, type LadoMaximo, type Margen, type Relieve } from "@/lib/relieve";
import { leerColoresEscena } from "@/lib/relieve-colores";
import type { Escena } from "@/lib/relieve-escena";
import { calcularLecturas } from "@/lib/relieve-lecturas";
import { AvisosRelieve } from "./AvisosRelieve";
import { ControlesRelieve, type AtajoRelieve } from "./ControlesRelieve";
import { LecturasRelieve } from "./LecturasRelieve";

export type VisorRelieveProps = {
  /** Referencia catastral de la ficha del proyecto (puede estar vacía). */
  referenciaInicial: string;
  /** Inyectable en tests; por defecto, el servicio de relieve. */
  obtener?: typeof obtenerRelieve;
};

type Estado = "reposo" | "cargando" | "listo" | "sin-webgl" | "error";

const REFERENCIA_RUSTICA = "08187A005001230000OK";
const REFERENCIA_RESIDENCIAL = "9876543DF3897N0001XY";
const ID_ERROR_REFERENCIA = "relieve-error-referencia";
const AYUDA_TECLADO = "Usa las flechas para girar; los botones + y − acercan y alejan";

export function VisorRelieve({ referenciaInicial, obtener = obtenerRelieve }: VisorRelieveProps) {
  const [referencia, setReferencia] = useState(referenciaInicial);
  const [margen, setMargen] = useState<Margen>(25);
  const [ladoMaximo, setLadoMaximo] = useState<LadoMaximo>(200);
  const [exageracion, setExageracion] = useState<Exageracion>(2);
  const [relieve, setRelieve] = useState<Relieve | null>(null);
  const [estado, setEstado] = useState<Estado>("reposo");
  const [errorReferencia, setErrorReferencia] = useState(false);

  const lienzo = useRef<HTMLDivElement>(null);
  const escena = useRef<Escena | null>(null);
  const exageracionActual = useRef<Exageracion>(exageracion);
  /** Identifica la última consulta; las anteriores y las posteriores al desmontaje se descartan. */
  const solicitud = useRef(0);

  // Al desmontar, invalida cualquier consulta en curso.
  useEffect(() => {
    const contador = solicitud;
    return () => {
      contador.current++;
    };
  }, []);

  const consultar = useCallback(
    async (opciones: { referencia: string; margen: Margen; ladoMaximo: LadoMaximo }) => {
      const id = ++solicitud.current;
      setEstado("cargando");
      try {
        const nuevo = await obtener(opciones);
        if (id !== solicitud.current) return;
        setRelieve(nuevo);
      } catch {
        if (id === solicitud.current) setEstado("error");
      }
    },
    [obtener],
  );

  // Ciclo de vida de la escena: una por relieve; el cleanup la libera antes de montar la siguiente.
  useEffect(() => {
    if (!relieve) return;
    const contenedor = lienzo.current;
    if (!contenedor) return;
    let cancelado = false;
    let montada: Escena | null = null;

    import("@/lib/relieve-escena")
      .then(({ montarEscena }) => {
        if (cancelado) return;
        montada = montarEscena(contenedor, relieve, exageracionActual.current, leerColoresEscena());
        escena.current = montada;
        setEstado("listo");
      })
      .catch(() => {
        if (!cancelado) setEstado("sin-webgl");
      });

    return () => {
      cancelado = true;
      montada?.liberar();
      if (escena.current === montada) escena.current = null;
    };
  }, [relieve]);

  useEffect(() => {
    exageracionActual.current = exageracion;
    escena.current?.actualizarExageracion(exageracion);
  }, [exageracion]);

  const lecturas = useMemo(() => (relieve ? calcularLecturas(relieve) : null), [relieve]);

  const ver = () => {
    if (!esReferenciaCatastralValida(referencia)) {
      setErrorReferencia(true);
      return;
    }
    setErrorReferencia(false);
    void consultar({ referencia: referencia.trim(), margen, ladoMaximo });
  };

  // Con un relieve mostrado, cambiar el recorte o el lado vuelve a pedirlo al servicio.
  const cambiarVentana = (nuevo: { margen: Margen; ladoMaximo: LadoMaximo }) => {
    setMargen(nuevo.margen);
    setLadoMaximo(nuevo.ladoMaximo);
    if (relieve) void consultar({ referencia: relieve.referencia, ...nuevo });
  };

  const atajos: readonly AtajoRelieve[] = [
    { id: "ficha", etiqueta: "La de la ficha", referencia: referenciaInicial },
    { id: "rustica", etiqueta: "Parcela rústica grande (simulada)", referencia: REFERENCIA_RUSTICA },
    { id: "residencial", etiqueta: "Parcela residencial (simulada)", referencia: REFERENCIA_RESIDENCIAL },
  ];

  const mostrarLienzo = relieve !== null && estado !== "sin-webgl";

  return (
    <Panel title="Relieve 3D del terreno" description="Consulta de solo lectura: no guarda nada en el proyecto.">
      <ControlesRelieve
        referencia={referencia}
        margen={margen}
        ladoMaximo={ladoMaximo}
        exageracion={exageracion}
        atajos={atajos}
        idError={errorReferencia ? ID_ERROR_REFERENCIA : undefined}
        onReferencia={setReferencia}
        onMargen={(m) => cambiarVentana({ margen: m, ladoMaximo })}
        onLadoMaximo={(l) => cambiarVentana({ margen, ladoMaximo: l })}
        onExageracion={setExageracion}
        onAtajo={setReferencia}
        onVer={ver}
      />

      <div aria-live="polite" className="flex flex-col gap-2">
        {errorReferencia ? (
          <div id={ID_ERROR_REFERENCIA}>
            <Notice tone="bad">La referencia catastral debe tener 20 caracteres.</Notice>
          </div>
        ) : null}
        {estado === "cargando" ? <Notice>Cargando el visor 3D…</Notice> : null}
        {estado === "error" ? (
          <Notice tone="bad">No se pudo obtener el relieve. Inténtalo de nuevo.</Notice>
        ) : null}
        {estado === "sin-webgl" ? (
          <Notice tone="warn">Este navegador no puede mostrar el modelo 3D (WebGL no disponible).</Notice>
        ) : null}
        {relieve === null && estado === "reposo" && !errorReferencia ? (
          <Notice>Escribe una referencia catastral de 20 caracteres y pulsa «Ver relieve».</Notice>
        ) : null}
      </div>

      {mostrarLienzo ? (
        <div className="flex flex-col gap-1.5">
          <div className="relative">
            <div
              ref={lienzo}
              role="img"
              aria-label={`Relieve 3D del terreno de ${relieve.referencia}`}
              tabIndex={0}
              className="h-[460px] w-full overflow-hidden rounded-base border border-hair bg-surface-2"
            />
            <div className="absolute right-3 top-3 flex gap-1.5">
              <Button size="sm" aria-label="Restablecer vista" onClick={() => escena.current?.reiniciar()}>
                <RotateCcw size={14} aria-hidden="true" />
                Restablecer
              </Button>
              <Button size="sm" aria-label="Acercar" onClick={() => escena.current?.acercar()}>
                <Plus size={14} aria-hidden="true" />
              </Button>
              <Button size="sm" aria-label="Alejar" onClick={() => escena.current?.alejar()}>
                <Minus size={14} aria-hidden="true" />
              </Button>
            </div>
            <span
              aria-hidden="true"
              className="pointer-events-none absolute bottom-3 left-3 rounded-base bg-surface px-2 py-0.5 text-xs text-muted"
            >
              ↑ N
            </span>
          </div>
          <p className="text-xs text-muted">{AYUDA_TECLADO}</p>
        </div>
      ) : null}

      {relieve ? (
        <>
          <LecturasRelieve lecturas={lecturas} ventana={relieve.ventana} exageracion={exageracion} />
          <AvisosRelieve
            recortada={relieve.recortada}
            parcelaCortada={relieve.parcelaCortada}
            fuente={relieve.fuente}
            hayLecturas={lecturas !== null}
          />
        </>
      ) : null}
    </Panel>
  );
}

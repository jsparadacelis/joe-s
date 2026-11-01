"use client";

import { Minus, Plus, RotateCcw } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Notice } from "@/components/ui/Notice";
import { Panel } from "@/components/ui/Panel";
import { ApiError } from "@/lib/api";
import { isSampleProject } from "@/lib/projects";
import { reliefFetcherFor } from "@/lib/relief-api";
import { isValidCadastralReference } from "@/lib/technical-data";
import { type Exaggeration, type MaxSide, type Margin, type Relief, type ReliefOptions } from "@/lib/relief";
import { readSceneColors } from "@/lib/relief-colors";
import type { ReliefScene } from "@/lib/relief-scene";
import { calculateReadings } from "@/lib/relief-readings";
import { ReliefNotices } from "./ReliefNotices";
import { ReliefControls, type ReliefShortcut } from "./ReliefControls";
import { ReliefReadings } from "./ReliefReadings";

export type ReliefViewerProps = {
  /** Cadastral reference from the project sheet (may be empty). */
  initialReference: string;
  /** Project the viewer belongs to: PRY-EJ-* samples use the synthetic terrain, the rest the relief service. */
  projectCode: string;
  /** Injectable in tests; by default, `reliefFetcherFor(projectCode)`. */
  fetcher?: (options: ReliefOptions) => Promise<Relief>;
};

type ViewerState = "idle" | "loading" | "ready" | "no-webgl" | "error";

const RURAL_REFERENCE = "08187A005001230000OK";
const RESIDENTIAL_REFERENCE = "9876543DF3897N0001XY";
const REFERENCE_ERROR_ID = "relief-reference-error";
const REFERENCE_LENGTH_ERROR = "La referencia catastral debe tener 20 caracteres.";
const GENERIC_ERROR = "No se pudo obtener el relieve. Inténtalo de nuevo.";
const KEYBOARD_HINT = "Usa las flechas para girar; los botones + y − acercan y alejan";

export function ReliefViewer({ projectCode, initialReference, fetcher: injectedFetcher }: ReliefViewerProps) {
  const fetcher = useMemo(() => injectedFetcher ?? reliefFetcherFor(projectCode), [injectedFetcher, projectCode]);
  const [reference, setReference] = useState(initialReference);
  const [margin, setMargin] = useState<Margin>(25);
  const [maxSide, setMaxSide] = useState<MaxSide>(200);
  const [exaggeration, setExaggeration] = useState<Exaggeration>(2);
  const [relief, setRelief] = useState<Relief | null>(null);
  const [state, setState] = useState<ViewerState>("idle");
  /** Message shown next to the reference field (local validation, or 422/404 from the service). */
  const [referenceError, setReferenceError] = useState<string | null>(null);
  /** Any other failure of the service (503, network, malformed response). */
  const [serviceError, setServiceError] = useState<string | null>(null);

  const canvasHost = useRef<HTMLDivElement>(null);
  const scene = useRef<ReliefScene | null>(null);
  const currentExaggeration = useRef<Exaggeration>(exaggeration);
  /** Identifies the latest query; earlier ones and ones after unmounting are discarded. */
  const requestId = useRef(0);

  // On unmount, invalidate any query in flight.
  useEffect(() => {
    const counter = requestId;
    return () => {
      counter.current++;
    };
  }, []);

  const query = useCallback(
    async (options: { reference: string; margin: Margin; maxSide: MaxSide }) => {
      const id = ++requestId.current;
      setState("loading");
      setReferenceError(null);
      setServiceError(null);
      try {
        const next = await fetcher(options);
        if (id !== requestId.current) return;
        setRelief(next);
      } catch (error) {
        if (id !== requestId.current) return;
        if (error instanceof ApiError && (error.status === 422 || error.status === 404)) {
          setReferenceError(error.message);
        } else {
          setServiceError(error instanceof ApiError ? error.message : GENERIC_ERROR);
        }
        setState("error");
      }
    },
    [fetcher],
  );

  // Scene lifecycle: one per relief; the cleanup releases it before mounting the next one.
  useEffect(() => {
    if (!relief) return;
    const host = canvasHost.current;
    if (!host) return;
    let cancelled = false;
    let mounted: ReliefScene | null = null;

    import("@/lib/relief-scene")
      .then(({ mountScene }) => {
        if (cancelled) return;
        mounted = mountScene(host, relief, currentExaggeration.current, readSceneColors());
        scene.current = mounted;
        setState("ready");
      })
      .catch(() => {
        if (!cancelled) setState("no-webgl");
      });

    return () => {
      cancelled = true;
      mounted?.release();
      if (scene.current === mounted) scene.current = null;
    };
  }, [relief]);

  useEffect(() => {
    currentExaggeration.current = exaggeration;
    scene.current?.updateExaggeration(exaggeration);
  }, [exaggeration]);

  const readings = useMemo(() => (relief ? calculateReadings(relief) : null), [relief]);

  const viewRelief = () => {
    const trimmed = reference.trim();
    setReference(trimmed);
    if (!isValidCadastralReference(trimmed)) {
      setReferenceError(REFERENCE_LENGTH_ERROR);
      setServiceError(null);
      return;
    }
    void query({ reference: trimmed, margin, maxSide });
  };

  // With a relief shown, changing the margin or the side asks the service again.
  const changeViewWindow = (next: { margin: Margin; maxSide: MaxSide }) => {
    setMargin(next.margin);
    setMaxSide(next.maxSide);
    if (relief) void query({ reference: relief.reference, ...next });
  };

  // The simulated references only exist in the synthetic terrain, not in Catastro.
  const shortcuts: readonly ReliefShortcut[] = [
    { id: "sheet", label: "La de la ficha", reference: initialReference },
    ...(isSampleProject(projectCode)
      ? [
          { id: "rural", label: "Parcela rústica grande (simulada)", reference: RURAL_REFERENCE },
          { id: "residential", label: "Parcela residencial (simulada)", reference: RESIDENTIAL_REFERENCE },
        ]
      : []),
  ];

  const showCanvas = relief !== null && state !== "no-webgl";

  return (
    <Panel title="Relieve 3D del terreno" description="Consulta de solo lectura: no guarda nada en el proyecto.">
      <ReliefControls
        reference={reference}
        margin={margin}
        maxSide={maxSide}
        exaggeration={exaggeration}
        shortcuts={shortcuts}
        errorId={referenceError !== null ? REFERENCE_ERROR_ID : undefined}
        onReference={setReference}
        onMargin={(m) => changeViewWindow({ margin: m, maxSide })}
        onMaxSide={(l) => changeViewWindow({ margin, maxSide: l })}
        onExaggeration={setExaggeration}
        onShortcut={setReference}
        onView={viewRelief}
      />

      <div aria-live="polite" className="flex flex-col gap-2">
        {referenceError !== null ? (
          <div id={REFERENCE_ERROR_ID}>
            <Notice tone="bad">{referenceError}</Notice>
          </div>
        ) : null}
        {state === "loading" ? <Notice>Cargando relieve…</Notice> : null}
        {serviceError !== null ? <Notice tone="bad">{serviceError}</Notice> : null}
        {state === "no-webgl" ? (
          <Notice tone="warn">Este navegador no puede mostrar el modelo 3D (WebGL no disponible).</Notice>
        ) : null}
        {relief === null && state === "idle" && referenceError === null ? (
          <Notice>Escribe una referencia catastral de 20 caracteres y pulsa «Ver relieve».</Notice>
        ) : null}
      </div>

      {showCanvas ? (
        <div className="flex flex-col gap-1.5">
          <div className="relative">
            <div
              ref={canvasHost}
              role="img"
              aria-label={`Relieve 3D del terreno de ${relief.reference}`}
              tabIndex={0}
              className="h-[460px] w-full overflow-hidden rounded-base border border-hair bg-surface-2"
            />
            <div className="absolute right-3 top-3 flex gap-1.5">
              <Button size="sm" aria-label="Restablecer vista" onClick={() => scene.current?.reset()}>
                <RotateCcw size={14} aria-hidden="true" />
                Restablecer
              </Button>
              <Button size="sm" aria-label="Acercar" onClick={() => scene.current?.zoomIn()}>
                <Plus size={14} aria-hidden="true" />
              </Button>
              <Button size="sm" aria-label="Alejar" onClick={() => scene.current?.zoomOut()}>
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
          <p className="text-xs text-muted">{KEYBOARD_HINT}</p>
        </div>
      ) : null}

      {relief ? (
        <>
          <ReliefReadings readings={readings} viewWindow={relief.viewWindow} exaggeration={exaggeration} />
          <ReliefNotices
            clamped={relief.clamped}
            plotClipped={relief.plotClipped}
            source={relief.source}
            hasReadings={readings !== null}
            noDataCells={relief.noDataCells}
          />
        </>
      ) : null}
    </Panel>
  );
}

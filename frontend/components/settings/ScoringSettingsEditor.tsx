"use client";

import { useCallback, useEffect, useId, useRef, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/Button";
import { Notice } from "@/components/ui/Notice";
import { Panel } from "@/components/ui/Panel";
import { ApiError } from "@/lib/api";
import {
  CRITERIA,
  CRITERION_LABELS,
  MAX_THRESHOLD,
  MAX_WEIGHT,
  MIN_THRESHOLD,
  fetchScoringSettings,
  saveScoringSettings,
  validateScoringSettings,
  type Criterion,
  type ScoringSettings,
} from "@/lib/scoring";

export interface ScoringSettingsEditorProps {
  fetcher?: () => Promise<ScoringSettings>;
  saver?: (settings: ScoringSettings) => Promise<void>;
}

const HELP =
  "Los cambios se aplican a las puntuaciones que se guarden a partir de ahora; las puntuaciones ya guardadas no cambian. Quedan en el registro de auditoría.";
const UNEXPECTED_MESSAGE = "Ocurrió un error inesperado. Inténtalo de nuevo.";
const INPUT_CLASS = "w-full rounded-base border bg-surface px-2.5 py-1.5 text-s text-ink tabular-nums";

const defaultFetcher = () => fetchScoringSettings();
const defaultSaver = (settings: ScoringSettings) => saveScoringSettings(settings);

type WeightDraft = Record<Criterion, string>;

/** Empty or non-numeric text becomes NaN so that validation rejects it (Number("") would be 0). */
const parseField = (text: string): number => (text.trim() === "" ? NaN : Number(text));

const toDrafts = (settings: ScoringSettings) => ({
  weights: Object.fromEntries(CRITERIA.map((c) => [c, String(settings.weights[c])])) as WeightDraft,
  threshold: String(settings.threshold),
});

export function ScoringSettingsEditor({ fetcher = defaultFetcher, saver = defaultSaver }: ScoringSettingsEditorProps) {
  const idPrefix = useId();
  const [saved, setSaved] = useState<ScoringSettings | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [weightDrafts, setWeightDrafts] = useState<WeightDraft | null>(null);
  const [thresholdDraft, setThresholdDraft] = useState("");
  const [weightsError, setWeightsError] = useState<string | undefined>();
  const [thresholdError, setThresholdError] = useState<string | undefined>();
  const [formError, setFormError] = useState<string | undefined>();
  const [saving, setSaving] = useState(false);
  const [announcement, setAnnouncement] = useState("");

  const weightRefs = useRef<Partial<Record<Criterion, HTMLInputElement | null>>>({});
  const thresholdRef = useRef<HTMLInputElement | null>(null);
  const lastFocused = useRef<HTMLInputElement | null>(null);
  const alertRef = useRef<HTMLDivElement | null>(null);
  const pendingAlertFocus = useRef(false);

  useEffect(() => {
    let cancelled = false;
    fetcher().then(
      (settings) => {
        if (cancelled) return;
        const drafts = toDrafts(settings);
        setSaved(settings);
        setWeightDrafts(drafts.weights);
        setThresholdDraft(drafts.threshold);
        setLoadError(null);
      },
      (error: unknown) => {
        if (!cancelled) setLoadError(error instanceof ApiError ? error.message : UNEXPECTED_MESSAGE);
      },
    );
    return () => {
      cancelled = true;
    };
  }, [fetcher, attempt]);

  useEffect(() => {
    if (!pendingAlertFocus.current) return;
    pendingAlertFocus.current = false;
    alertRef.current?.focus();
  });

  const retry = useCallback(() => {
    setLoadError(null);
    setAttempt((n) => n + 1);
  }, []);

  if (loadError !== null) {
    return (
      <div className="flex flex-col items-start gap-3">
        <Notice tone="bad">{loadError}</Notice>
        <Button onClick={retry}>Reintentar</Button>
      </div>
    );
  }
  if (!saved || !weightDrafts) {
    return <p className="text-s text-muted">Cargando ajustes de scoring…</p>;
  }

  const current: ScoringSettings = {
    weights: Object.fromEntries(CRITERIA.map((c) => [c, parseField(weightDrafts[c])])) as ScoringSettings["weights"],
    threshold: parseField(thresholdDraft),
  };
  const changed =
    !Object.is(current.threshold, saved.threshold) || CRITERIA.some((c) => !Object.is(current.weights[c], saved.weights[c]));

  const weightsErrorId = `${idPrefix}-weights-error`;
  const thresholdErrorId = `${idPrefix}-threshold-error`;

  /** The focused Guardar becomes disabled while saving, which would drop focus to <body>: return it to the edited field. */
  const restoreFocus = (fallback?: HTMLInputElement | null) => (lastFocused.current ?? fallback)?.focus();

  function edited() {
    setAnnouncement("");
    setFormError(undefined);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving) return;
    const errors = validateScoringSettings(current);
    setWeightsError(errors.weights);
    setThresholdError(errors.threshold);
    setFormError(undefined);
    if (errors.weights || errors.threshold) {
      (errors.weights && errors.weightsField ? weightRefs.current[errors.weightsField] : thresholdRef.current)?.focus();
      return;
    }

    setSaving(true);
    try {
      await saver(current);
      setSaved(current);
      setAnnouncement("Ajustes de scoring guardados.");
      restoreFocus(weightRefs.current[CRITERIA[0]]);
    } catch (error) {
      const message = error instanceof ApiError ? error.message : UNEXPECTED_MESSAGE;
      if (error instanceof ApiError && error.code === "invalid_weights") {
        setWeightsError(message);
        restoreFocus(weightRefs.current[CRITERIA[0]]);
      } else if (error instanceof ApiError && error.code === "invalid_threshold") {
        setThresholdError(message);
        thresholdRef.current?.focus();
      } else {
        setFormError(message);
        pendingAlertFocus.current = true;
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <Panel title="Scoring de oportunidades" description={HELP}>
      <form aria-label="Ajustes de scoring" aria-busy={saving} noValidate onSubmit={handleSubmit} className="flex flex-col gap-4">
        <fieldset className="flex min-w-0 flex-col gap-2.5">
          <legend className="mb-2 text-m font-medium">Pesos de los criterios</legend>
          <div className="grid grid-cols-[repeat(auto-fit,minmax(9rem,1fr))] gap-2.5">
            {CRITERIA.map((criterion) => (
              <label key={criterion} className="flex flex-col gap-1 text-xs text-muted">
                <span>{`Peso de ${CRITERION_LABELS[criterion]}`}</span>
                <input
                  ref={(el) => {
                    weightRefs.current[criterion] = el;
                  }}
                  type="number"
                  inputMode="decimal"
                  min={0}
                  max={MAX_WEIGHT}
                  step="any"
                  className={`${INPUT_CLASS} ${weightsError ? "border-bad" : "border-hair"}`}
                  value={weightDrafts[criterion]}
                  onChange={(e) => {
                    const next = e.target.value;
                    edited();
                    setWeightsError(undefined);
                    setWeightDrafts((drafts) => (drafts ? { ...drafts, [criterion]: next } : drafts));
                  }}
                  onFocus={(e) => {
                    lastFocused.current = e.currentTarget;
                  }}
                  aria-invalid={weightsError ? true : undefined}
                  aria-describedby={weightsError ? weightsErrorId : undefined}
                />
              </label>
            ))}
          </div>
          {weightsError ? (
            <p id={weightsErrorId} role="alert" className="text-s text-bad">
              {weightsError}
            </p>
          ) : null}
        </fieldset>

        <div className="flex flex-col gap-1">
          <label className="flex w-56 flex-col gap-1 text-xs text-muted">
            <span>Umbral de recomendación</span>
            <input
              ref={thresholdRef}
              type="number"
              inputMode="numeric"
              min={MIN_THRESHOLD}
              max={MAX_THRESHOLD}
              step={1}
              className={`${INPUT_CLASS} ${thresholdError ? "border-bad" : "border-hair"}`}
              value={thresholdDraft}
              onChange={(e) => {
                edited();
                setThresholdError(undefined);
                setThresholdDraft(e.target.value);
              }}
              onFocus={(e) => {
                lastFocused.current = e.currentTarget;
              }}
              aria-invalid={thresholdError ? true : undefined}
              aria-describedby={thresholdError ? thresholdErrorId : undefined}
            />
          </label>
          <p className="text-xs text-muted">Entero de 1 a 100: una nota igual o superior se recomienda perseguir.</p>
          {thresholdError ? (
            <p id={thresholdErrorId} role="alert" className="text-s text-bad">
              {thresholdError}
            </p>
          ) : null}
        </div>

        {formError ? (
          <div
            ref={alertRef}
            role="alert"
            tabIndex={-1}
            className="rounded-base bg-bad-soft px-3 py-2.5 text-s text-bad focus-visible:outline-2 focus-visible:outline-point"
          >
            {formError}
          </div>
        ) : null}

        <div className="flex items-center gap-3">
          <Button type="submit" variant="primary" size="sm" disabled={!changed || saving}>
            Guardar scoring
          </Button>
        </div>
        <div aria-live="polite" className="text-s text-ok">
          {announcement}
        </div>
      </form>
    </Panel>
  );
}

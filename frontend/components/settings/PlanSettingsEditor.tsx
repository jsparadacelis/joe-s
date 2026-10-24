"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Notice } from "@/components/ui/Notice";
import { Panel } from "@/components/ui/Panel";
import { ApiError } from "@/lib/api";
import { PHASES } from "@/lib/phases";
import {
  MAX_FACTOR,
  MAX_WEEKS,
  MIN_FACTOR,
  PROJECT_TYPES,
  PROJECT_TYPE_LABELS,
  SCALES,
  SCALE_LABELS,
  fetchPlanSettings,
  updateScaleFactor,
  updateTemplate,
  validateFactor,
  validateWeeks,
  type PlanSettings,
  type ProjectType,
  type Scale,
} from "@/lib/plan-settings";

export interface PlanSettingsUpdater {
  updateTemplate(type: ProjectType, weeks: number[]): Promise<void>;
  updateScaleFactor(scale: Scale, factor: number): Promise<void>;
}

export interface PlanSettingsEditorProps {
  fetcher?: () => Promise<PlanSettings>;
  updater?: PlanSettingsUpdater;
}

const HELP = "Los cambios se aplican a los planes que se generen a partir de ahora y quedan en el registro de auditoría.";
const UNEXPECTED_MESSAGE = "Ocurrió un error inesperado. Inténtalo de nuevo.";
const WEEK_PHASES = PHASES.filter((phase) => phase.id >= 1);
const INPUT_CLASS =
  "w-full rounded-base border bg-surface px-2.5 py-1.5 text-s text-ink tabular-nums disabled:bg-surface-2 disabled:text-muted";

const defaultFetcher = () => fetchPlanSettings();
const defaultUpdater: PlanSettingsUpdater = { updateTemplate, updateScaleFactor };

type RowKey = `template:${ProjectType}` | `scale:${Scale}`;

/** Empty or non-numeric text becomes NaN so that validation rejects it (Number("") would be 0). */
function parseField(text: string): number {
  return text.trim() === "" ? NaN : Number(text);
}

const sameNumbers = (a: readonly number[], b: readonly number[]) => a.length === b.length && a.every((n, i) => Object.is(n, b[i]));

function errorMessage(error: unknown): string {
  return error instanceof ApiError ? error.message : UNEXPECTED_MESSAGE;
}

const toTextTemplates = (templates: PlanSettings["templates"]) =>
  Object.fromEntries(PROJECT_TYPES.map((type) => [type, templates[type].map(String)])) as Record<ProjectType, string[]>;
const toTextFactors = (factors: PlanSettings["scaleFactors"]) =>
  Object.fromEntries(SCALES.map((scale) => [scale, String(factors[scale])])) as Record<Scale, string>;

export function PlanSettingsEditor({ fetcher = defaultFetcher, updater = defaultUpdater }: PlanSettingsEditorProps) {
  const idPrefix = useId();
  const [saved, setSaved] = useState<PlanSettings | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [templateDrafts, setTemplateDrafts] = useState<Record<ProjectType, string[]> | null>(null);
  const [factorDrafts, setFactorDrafts] = useState<Record<Scale, string> | null>(null);
  const [errors, setErrors] = useState<Partial<Record<RowKey, string>>>({});
  const [saving, setSaving] = useState<Partial<Record<RowKey, boolean>>>({});
  const [announcement, setAnnouncement] = useState("");
  // Per row: its fieldset and the last field that had focus, to restore focus after a save.
  const rowRefs = useRef<Partial<Record<RowKey, HTMLFieldSetElement | null>>>({});
  const lastFocused = useRef<Partial<Record<RowKey, HTMLInputElement>>>({});

  useEffect(() => {
    let cancelled = false;
    fetcher().then(
      (settings) => {
        if (cancelled) return;
        setSaved(settings);
        setTemplateDrafts(toTextTemplates(settings.templates));
        setFactorDrafts(toTextFactors(settings.scaleFactors));
        setLoadError(null);
      },
      (error: unknown) => {
        if (!cancelled) setLoadError(errorMessage(error));
      },
    );
    return () => {
      cancelled = true;
    };
  }, [fetcher, attempt]);

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
  if (!saved || !templateDrafts || !factorDrafts) {
    return <p className="text-s text-muted">Cargando ajustes del plan…</p>;
  }

  const setError = (key: RowKey, message: string | undefined) =>
    setErrors((current) => ({ ...current, [key]: message }));

  /** Shared save flow: validate, call the API, then mark the row as saved or show why it failed. */
  async function save(key: RowKey, validationError: string | null, send: () => Promise<void>, onSaved: () => void, success: string) {
    if (validationError) {
      setError(key, validationError);
      return;
    }
    setSaving((current) => ({ ...current, [key]: true }));
    try {
      await send();
      onSaved();
      setError(key, undefined);
      setAnnouncement(success);
      restoreFocus(key);
    } catch (error) {
      setError(key, errorMessage(error));
      restoreFocus(key);
    } finally {
      setSaving((current) => ({ ...current, [key]: false }));
    }
  }

  /** The focused Guardar becomes disabled while saving, which would drop focus to <body>: return it to the edited field. */
  function restoreFocus(key: RowKey) {
    (lastFocused.current[key] ?? rowRefs.current[key]?.querySelector("input"))?.focus();
  }

  const saveTemplate = (type: ProjectType) => {
    const weeks = templateDrafts[type].map(parseField);
    return save(
      `template:${type}`,
      validateWeeks(weeks),
      () => updater.updateTemplate(type, weeks),
      () => setSaved((current) => (current ? { ...current, templates: { ...current.templates, [type]: weeks } } : current)),
      `Plantilla de ${PROJECT_TYPE_LABELS[type]} guardada.`,
    );
  };

  const saveFactor = (scale: Scale) => {
    const factor = parseField(factorDrafts[scale]);
    return save(
      `scale:${scale}`,
      validateFactor(factor),
      () => updater.updateScaleFactor(scale, factor),
      () => setSaved((current) => (current ? { ...current, scaleFactors: { ...current.scaleFactors, [scale]: factor } } : current)),
      `Factor de escala ${SCALE_LABELS[scale]} guardado.`,
    );
  };

  const errorId = (key: RowKey) => `${idPrefix}-${key.replace(":", "-")}-error`;
  const invalidProps = (key: RowKey) =>
    errors[key] ? { "aria-invalid": true as const, "aria-describedby": errorId(key) } : {};
  /** Props shared by every field of a row: remember focus for after a save. */
  const fieldProps = (key: RowKey) => ({
    onFocus: (e: React.FocusEvent<HTMLInputElement>) => {
      lastFocused.current[key] = e.currentTarget;
    },
    ...invalidProps(key),
  });
  const borderClass = (key: RowKey) => (errors[key] ? "border-bad" : "border-hair");
  const rowError = (key: RowKey) =>
    errors[key] ? (
      <p id={errorId(key)} role="alert" className="text-s text-bad">
        {errors[key]}
      </p>
    ) : null;

  return (
    <div className="flex flex-col gap-4">
      <p className="text-s text-muted">{HELP}</p>

      <Panel title="Plantillas de semanas por tipología">
        <div className="flex flex-col">
          {PROJECT_TYPES.map((type, rowIndex) => {
            const key: RowKey = `template:${type}`;
            const weeks = templateDrafts[type].map(parseField);
            const total = validateWeeks(weeks) === null ? `${weeks.reduce((sum, w) => sum + w, 0)} semanas` : "—";
            const changed = !sameNumbers(weeks, saved.templates[type]);
            return (
              <fieldset key={type} ref={(el) => { rowRefs.current[key] = el; }} className={`flex min-w-0 flex-col gap-2.5 py-3 ${rowIndex > 0 ? "border-t border-hair" : ""}`}>
                <legend className="mb-2 text-m font-medium">{PROJECT_TYPE_LABELS[type]}</legend>
                <div className="grid grid-cols-[repeat(auto-fit,minmax(5.5rem,1fr))] gap-2.5">
                  {WEEK_PHASES.map((phase, index) => (
                    <label key={phase.id} className="flex flex-col gap-1 text-xs text-muted">
                      <span>
                        Fase {phase.id}: {phase.name}
                      </span>
                      <input
                        type="number"
                        inputMode="numeric"
                        min={1}
                        max={MAX_WEEKS}
                        step={1}
                        className={`${INPUT_CLASS} ${borderClass(key)}`}
                        value={templateDrafts[type][index]}
                        onChange={(e) => {
                          const next = e.target.value;
                          setAnnouncement("");
                          setTemplateDrafts((current) =>
                            current ? { ...current, [type]: current[type].map((v, i) => (i === index ? next : v)) } : current,
                          );
                        }}
                        {...fieldProps(key)}
                      />
                    </label>
                  ))}
                </div>
                <div className="flex flex-wrap items-center gap-3">
                  <span className="text-s tabular-nums">Total: {total}</span>
                  <Button variant="primary" size="sm" disabled={!changed || saving[key]} onClick={() => saveTemplate(type)}>
                    Guardar
                  </Button>
                </div>
                {rowError(key)}
              </fieldset>
            );
          })}
        </div>
      </Panel>

      <Panel title="Factores de escala">
        <div className="flex flex-col">
          {SCALES.map((scale, rowIndex) => {
            const key: RowKey = `scale:${scale}`;
            const changed = !Object.is(parseField(factorDrafts[scale]), saved.scaleFactors[scale]);
            return (
              <fieldset key={scale} ref={(el) => { rowRefs.current[key] = el; }} className={`flex min-w-0 flex-col gap-2.5 py-3 ${rowIndex > 0 ? "border-t border-hair" : ""}`}>
                <legend className="mb-2 text-m font-medium">{SCALE_LABELS[scale]}</legend>
                <div className="flex flex-wrap items-end gap-3">
                  <label className="flex w-48 flex-col gap-1 text-xs text-muted">
                    <span>Factor de escala {SCALE_LABELS[scale]}</span>
                    <input
                      type="number"
                      inputMode="decimal"
                      min={MIN_FACTOR}
                      max={MAX_FACTOR}
                      step="any"
                      className={`${INPUT_CLASS} ${borderClass(key)}`}
                      value={factorDrafts[scale]}
                      onChange={(e) => {
                        const next = e.target.value;
                        setAnnouncement("");
                        setFactorDrafts((current) => (current ? { ...current, [scale]: next } : current));
                      }}
                      {...fieldProps(key)}
                    />
                  </label>
                  <Button variant="primary" size="sm" disabled={!changed || saving[key]} onClick={() => saveFactor(scale)}>
                    Guardar
                  </Button>
                </div>
                {rowError(key)}
              </fieldset>
            );
          })}
        </div>
      </Panel>

      <div aria-live="polite" className="text-s text-ok">
        {announcement}
      </div>
    </div>
  );
}

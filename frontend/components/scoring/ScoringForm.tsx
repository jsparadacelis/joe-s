"use client";

import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { ScoringHistory } from "@/components/scoring/ScoringHistory";
import { Button } from "@/components/ui/Button";
import { Panel } from "@/components/ui/Panel";
import { StatusChip } from "@/components/ui/StatusChip";
import { ApiError } from "@/lib/api";
import {
  CRITERIA,
  CRITERION_LABELS,
  MAX_RATING,
  MIN_RATING,
  RECOMMENDATION_LABELS,
  computeScore,
  formatScore,
  formatScoredAt,
  recommend,
  saveScoring,
  type Criterion,
  type Ratings,
  type Scoring,
  type ScoringHistoryEntry,
  type ScoringRecord,
  type ScoringSettings,
} from "@/lib/scoring";

export interface ScoringFormProps {
  code: string;
  /** Weights and threshold in force: they drive the live score; the server recalculates on save. */
  settings: ScoringSettings;
  /** The latest scoring with its history, or `null` when there is none yet. */
  initial: Scoring | null;
  /** Saves a scoring; replaceable in tests. */
  save?: (ratings: Ratings) => Promise<ScoringRecord>;
}

type Draft = Record<Criterion, string>;
type FocusTarget = "alert" | "submit";

const UNEXPECTED_MESSAGE = "Ocurrió un error inesperado. Inténtalo de nuevo.";
const DECISION_TEXT = "La decisión de perseguir la oportunidad es de la persona; la recomendación no cambia el estado del proyecto.";
const RATING_OPTIONS = Array.from({ length: MAX_RATING - MIN_RATING + 1 }, (_, i) => String(MIN_RATING + i));
const CONTROL = "w-full rounded-base border bg-surface px-3 py-2 text-m text-ink";

const toDraft = (ratings: Ratings | undefined): Draft =>
  Object.fromEntries(CRITERIA.map((c) => [c, ratings ? String(ratings[c]) : ""])) as Draft;

const isCriterion = (value: string | undefined): value is Criterion => (CRITERIA as readonly string[]).includes(value ?? "");

export function ScoringForm({ code, settings, initial, save }: ScoringFormProps) {
  const idPrefix = useId();
  const [draft, setDraft] = useState<Draft>(() => toDraft(initial?.ratings));
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<Criterion, string>>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [latest, setLatest] = useState<ScoringRecord | null>(initial);
  const [history, setHistory] = useState<ScoringHistoryEntry[]>(initial?.history ?? []);
  const [announcement, setAnnouncement] = useState("");

  const submitting = useRef(false);
  const pending = useRef<FocusTarget | null>(null);
  const selectRefs = useRef<Partial<Record<Criterion, HTMLSelectElement | null>>>({});
  const alertRef = useRef<HTMLDivElement>(null);
  const submitRef = useRef<HTMLButtonElement>(null);

  // Focus moves after the render that creates (or re-enables) the target.
  useEffect(() => {
    const target = pending.current;
    if (!target || saving) return;
    pending.current = null;
    (target === "alert" ? alertRef.current : submitRef.current)?.focus();
  });

  const complete = CRITERIA.every((c) => draft[c] !== "");
  const liveRatings = complete ? (Object.fromEntries(CRITERIA.map((c) => [c, Number(draft[c])])) as Ratings) : null;
  const liveScore = liveRatings ? computeScore(liveRatings, settings.weights) : null;
  const liveRecommendation = liveScore === null ? null : recommend(liveScore, settings.threshold);

  const doSave = save ?? ((ratings: Ratings) => saveScoring(code, ratings));

  const errorId = (c: Criterion) => `${idPrefix}-${c}-error`;

  function rate(criterion: Criterion, value: string) {
    setDraft((current) => ({ ...current, [criterion]: value }));
    setFieldErrors((current) => (current[criterion] ? { ...current, [criterion]: undefined } : current));
    setAnnouncement("");
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting.current) return;
    setFormError(null);

    const missing = CRITERIA.find((c) => draft[c] === "");
    if (missing) {
      setFieldErrors({ [missing]: `Puntúa el criterio «${CRITERION_LABELS[missing]}» de 1 a 5.` });
      selectRefs.current[missing]?.focus();
      return;
    }
    setFieldErrors({});

    submitting.current = true;
    setSaving(true);
    try {
      const saved = await doSave(liveRatings as Ratings);
      setLatest(saved);
      setHistory((current) => [
        { version: saved.version, score: saved.score, recommendation: saved.recommendation, scoredAt: saved.scoredAt },
        ...current,
      ]);
      setAnnouncement(`Puntuación guardada: versión ${saved.version}, nota ${formatScore(saved.score)}.`);
      pending.current = "submit";
    } catch (error) {
      const field = error instanceof ApiError && error.code === "invalid_ratings" && isCriterion(error.field) ? error.field : null;
      if (error instanceof ApiError && field) {
        setFieldErrors({ [field]: error.message });
        selectRefs.current[field]?.focus();
      } else {
        setFormError(error instanceof ApiError ? error.message : UNEXPECTED_MESSAGE);
        pending.current = "alert";
      }
    } finally {
      submitting.current = false;
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-col gap-3.5">
      <Panel
        title="Puntuación de la oportunidad"
        description="Valora cada criterio de 1 a 5: 1 es la peor valoración y 5 la mejor."
      >
        <form aria-label="Puntuar oportunidad" aria-busy={saving} noValidate onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="grid gap-4 md:grid-cols-2">
            {CRITERIA.map((criterion) => {
              const error = fieldErrors[criterion];
              const controlId = `${idPrefix}-${criterion}`;
              return (
                <div key={criterion} className="flex flex-col gap-1.5">
                  <label htmlFor={controlId} className="text-s font-medium">
                    {CRITERION_LABELS[criterion]}
                  </label>
                  <select
                    id={controlId}
                    ref={(el) => {
                      selectRefs.current[criterion] = el;
                    }}
                    name={criterion}
                    required
                    value={draft[criterion]}
                    onChange={(e) => rate(criterion, e.target.value)}
                    aria-invalid={error ? true : undefined}
                    aria-describedby={error ? errorId(criterion) : undefined}
                    className={`${CONTROL} ${error ? "border-bad" : "border-hair"}`}
                  >
                    <option value="">Selecciona</option>
                    {RATING_OPTIONS.map((value) => (
                      <option key={value} value={value}>
                        {value}
                      </option>
                    ))}
                  </select>
                  {error ? (
                    <p id={errorId(criterion)} role="alert" className="text-s text-bad">
                      {error}
                    </p>
                  ) : null}
                </div>
              );
            })}
          </div>

          <div aria-live="polite" className="flex flex-col gap-1.5 rounded-base bg-surface-2 p-3.5">
            {liveScore === null || liveRecommendation === null ? (
              <p className="text-s text-muted">Completa los siete criterios para ver la nota.</p>
            ) : (
              <>
                <p className="text-l font-semibold tabular-nums">{`Nota: ${formatScore(liveScore)} sobre 100`}</p>
                <p className="text-m font-medium">{`Recomendación: ${RECOMMENDATION_LABELS[liveRecommendation]}`}</p>
              </>
            )}
            <p className="text-s text-muted">{`Umbral de recomendación: ${settings.threshold}`}</p>
            <p className="text-s text-muted">{DECISION_TEXT}</p>
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
            <Button ref={submitRef} type="submit" variant="primary" disabled={saving}>
              {saving ? "Guardando…" : "Guardar puntuación"}
            </Button>
          </div>
        </form>
      </Panel>

      <div aria-live="polite" className="text-s text-ok">
        {announcement}
      </div>

      {latest ? (
        <section aria-labelledby={`${idPrefix}-latest`} className="flex min-w-0 flex-col gap-3 rounded-base border border-hair bg-surface p-[18px]">
          <h2 id={`${idPrefix}-latest`} className="text-l font-semibold">
            Última puntuación
          </h2>
          <div className="flex flex-wrap items-center gap-3">
            <StatusChip tone="neutral">{`Versión ${latest.version}`}</StatusChip>
            <p className="text-m font-semibold tabular-nums">{`Nota: ${formatScore(latest.score)} sobre 100`}</p>
            <p className="text-m">{`Recomendación: ${RECOMMENDATION_LABELS[latest.recommendation]}`}</p>
          </div>
          <p className="text-s text-muted">
            {`Umbral aplicado: ${latest.threshold}. Puntuado por ${latest.scoredBy} el ${formatScoredAt(latest.scoredAt)} UTC.`}
          </p>
        </section>
      ) : null}

      <ScoringHistory history={history} />
    </div>
  );
}

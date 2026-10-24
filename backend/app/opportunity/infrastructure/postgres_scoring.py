"""Postgres adapters for the scoring: they use the business transaction's connection (RLS)."""

from __future__ import annotations

from decimal import Decimal

import psycopg
from psycopg.types.json import Jsonb

from backend.app.opportunity.domain.scoring import (
    Criterion,
    NewScoring,
    Recommendation,
    ScorableProject,
    Scoring,
    ScoringSettings,
)

_COLUMNS = (
    "p.code, s.version, s.ratings, s.weights, s.threshold, s.score, s.recommendation, "
    "s.scored_by, s.scored_at"
)


def _weights_json(weights: dict[Criterion, Decimal]) -> Jsonb:
    return Jsonb({c.value: float(w) for c, w in weights.items()})


def _weights(raw: dict) -> dict[Criterion, Decimal]:
    return {c: Decimal(str(raw[c.value])) for c in Criterion}


class PostgresScoringSettings:
    def __init__(self, conn: psycopg.Connection) -> None:
        self._conn = conn

    def get(self) -> ScoringSettings | None:
        row = self._conn.execute("SELECT weights, threshold FROM scoring_settings").fetchone()
        return None if row is None else ScoringSettings(_weights(row[0]), row[1])

    def save(self, settings: ScoringSettings) -> None:
        self._conn.execute(
            "INSERT INTO scoring_settings (study_id, weights, threshold) "
            "VALUES (app_study_id()::uuid, %s, %s) "
            "ON CONFLICT (study_id) "
            "DO UPDATE SET weights = EXCLUDED.weights, threshold = EXCLUDED.threshold, "
            "updated_at = now()",
            (_weights_json(settings.weights), settings.threshold),
        )


class PostgresScorings:
    def __init__(self, conn: psycopg.Connection) -> None:
        self._conn = conn

    def get_project(self, code: str, *, lock: bool = True) -> ScorableProject | None:
        row = self._conn.execute(
            "SELECT id::text, study_id::text, code, current_phase FROM projects "
            "WHERE code = %s" + (" FOR UPDATE" if lock else ""),
            (code,),
        ).fetchone()
        return None if row is None else ScorableProject(*row)

    def add(self, new: NewScoring) -> Scoring:
        # The caller holds the project row lock, so the next version cannot be taken twice; the
        # unique (project_id, version) index is the second barrier.
        (version,) = self._conn.execute(
            "SELECT coalesce(max(version), 0) + 1 FROM opportunity_scorings "
            "WHERE project_id = %s::uuid",
            (new.project_id,),
        ).fetchone()
        self._conn.execute(
            "INSERT INTO opportunity_scorings (study_id, project_id, version, ratings, weights, "
            "threshold, score, recommendation, scored_by) "
            "VALUES (%s::uuid, %s::uuid, %s, %s, %s, %s, %s, %s, %s)",
            (
                new.study_id,
                new.project_id,
                version,
                Jsonb({c.value: r for c, r in new.ratings.items()}),
                _weights_json(new.weights),
                new.threshold,
                new.score,
                new.recommendation.value,
                new.scored_by,
            ),
        )
        return self._one(new.project_id, version)

    def latest(self, project_id: str) -> Scoring | None:
        row = self._conn.execute(
            f"SELECT {_COLUMNS} FROM opportunity_scorings s JOIN projects p ON p.id = s.project_id "
            "WHERE s.project_id = %s::uuid ORDER BY s.version DESC LIMIT 1",
            (project_id,),
        ).fetchone()
        return None if row is None else _scoring(row)

    def history(self, project_id: str) -> list[Scoring]:
        rows = self._conn.execute(
            f"SELECT {_COLUMNS} FROM opportunity_scorings s JOIN projects p ON p.id = s.project_id "
            "WHERE s.project_id = %s::uuid ORDER BY s.version DESC",
            (project_id,),
        ).fetchall()
        return [_scoring(row) for row in rows]

    def _one(self, project_id: str, version: int) -> Scoring:
        row = self._conn.execute(
            f"SELECT {_COLUMNS} FROM opportunity_scorings s JOIN projects p ON p.id = s.project_id "
            "WHERE s.project_id = %s::uuid AND s.version = %s",
            (project_id, version),
        ).fetchone()
        return _scoring(row)


def _scoring(row) -> Scoring:
    code, version, ratings, weights, threshold, score, recommendation, scored_by, scored_at = row
    return Scoring(
        project_code=code,
        version=version,
        ratings={c: ratings[c.value] for c in Criterion},
        weights=_weights(weights),
        threshold=threshold,
        score=score,
        recommendation=Recommendation(recommendation),
        scored_by=scored_by,
        scored_at=scored_at,
    )

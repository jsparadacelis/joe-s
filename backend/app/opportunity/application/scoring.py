"""Score an opportunity and edit the scoring settings of a study. Neither changes a project."""

from __future__ import annotations

from dataclasses import dataclass
from decimal import Decimal
from typing import Any

from backend.app.audit.application.record import audit
from backend.app.audit.domain.ports import AuditLog
from backend.app.opportunity.domain.errors import NotAnOpportunity, ProjectNotFound, ScoringNotFound
from backend.app.opportunity.domain.ports import ScoringRepository, ScoringSettingsRepository
from backend.app.opportunity.domain.scoring import (
    NewScoring,
    Scoring,
    ScoringSettings,
    compute_score,
    default_settings,
    recommend,
    validate_ratings,
    validate_settings,
)
from backend.app.study.domain.context import RequestContext

OPPORTUNITY_PHASE = 0


def _plain(weight: Decimal) -> str:
    """`2.50` -> "2.5", `10.0` -> "10": a stable text for the audit trail."""
    return format(weight.normalize(), "f")


def _settings_json(settings: ScoringSettings) -> dict[str, Any]:
    return {
        "weights": {c.value: _plain(w) for c, w in settings.weights.items()},
        "threshold": settings.threshold,
    }


class ScoringSettingsService:
    def __init__(self, repo: ScoringSettingsRepository, audit_log: AuditLog) -> None:
        self._repo = repo
        self._audit_log = audit_log

    def get_settings(self) -> ScoringSettings:
        return self._repo.get() or default_settings()

    def update(self, context: RequestContext, data: Any) -> None:
        new = validate_settings(data)
        old = self.get_settings()
        self._repo.save(new)
        audit(
            self._audit_log,
            context,
            entity="scoring_settings",
            entity_id="scoring",
            action="update",
            old_value=_settings_json(old),
            new_value=_settings_json(new),
        )


@dataclass(frozen=True)
class ScoringView:
    latest: Scoring
    history: list[Scoring]


class ScoringService:
    def __init__(
        self,
        scorings: ScoringRepository,
        settings: ScoringSettingsRepository,
        audit_log: AuditLog,
    ) -> None:
        self._scorings = scorings
        self._settings = settings
        self._audit_log = audit_log

    def score(self, context: RequestContext, code: str, body: Any) -> Scoring:
        """Errors in the contract's order: project, phase, ratings."""
        project = self._scorings.get_project(code)
        if project is None:
            raise ProjectNotFound(code)
        if project.current_phase != OPPORTUNITY_PHASE:
            raise NotAnOpportunity()
        ratings = validate_ratings(body.get("ratings") if isinstance(body, dict) else None)
        settings = self._settings.get() or default_settings()
        score = compute_score(ratings, settings.weights)
        saved = self._scorings.add(
            NewScoring(
                study_id=project.study_id,
                project_id=project.id,
                project_code=project.code,
                ratings=ratings,
                weights=dict(settings.weights),
                threshold=settings.threshold,
                score=score,
                recommendation=recommend(score, settings.threshold),
                scored_by=context.user_id,
            )
        )
        audit(
            self._audit_log,
            context,
            entity="opportunity_scoring",
            entity_id=code,
            action="score",
            version=saved.version,
            new_value={
                "ratings": {c.value: r for c, r in saved.ratings.items()},
                "weights": {c.value: _plain(w) for c, w in saved.weights.items()},
                "threshold": saved.threshold,
                "score": str(saved.score),
                "recommendation": saved.recommendation.value,
            },
        )
        return saved

    def read(self, code: str) -> ScoringView:
        project = self._scorings.get_project(code, lock=False)
        if project is None:
            raise ProjectNotFound(code)
        latest = self._scorings.latest(project.id)
        if latest is None:
            raise ScoringNotFound()
        return ScoringView(latest=latest, history=self._scorings.history(project.id))

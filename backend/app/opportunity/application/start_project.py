"""Start a project: confirm the plan, freeze scoring and plan, and promote to phase 1."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from backend.app.access.application.actors import decide
from backend.app.access.domain.actions import Action as Permission
from backend.app.audit.application.record import audit
from backend.app.audit.domain.event import Outcome
from backend.app.audit.domain.ports import AuditLog
from backend.app.lifecycle.application.promotion_service import PromotionService, Transition
from backend.app.lifecycle.domain.errors import IncompleteDeliverable, NoAuthority
from backend.app.opportunity.domain.errors import (
    InvalidScale,
    InvalidWeeks,
    PlanAlreadyConfirmed,
    PlanNotFound,
    ProjectNotFound,
    ProjectNotInOpportunityPhase,
)
from backend.app.opportunity.domain.ports import ProjectPlans, ScoringRepository
from backend.app.opportunity.domain.project_plan import (
    ConfirmedPlan,
    NewProjectPlan,
    ProposedPlan,
    StartableProject,
)
from backend.app.opportunity.domain.scoring import Scoring
from backend.app.study.domain.context import RequestContext

OPPORTUNITY_PHASE = 0


@dataclass(frozen=True)
class StartResult:
    transition: Transition
    plan: ProposedPlan | None


def _exit_content(
    project: StartableProject, plan: ProposedPlan, scoring: Scoring
) -> dict[str, Any]:
    """What the promotion freezes: the project data, the scoring in force and the plan."""
    scale = plan.scale.value
    return {
        "project": {
            "client": project.client,
            "location": project.location,
            "project_type": plan.project_type.value,
            "scale": scale,
        },
        "scoring": {
            "version": scoring.version,
            "ratings": {c.value: r for c, r in scoring.ratings.items()},
            "weights": {c.value: float(w) for c, w in scoring.weights.items()},
            "threshold": scoring.threshold,
            "score": float(scoring.score),
            "recommendation": scoring.recommendation.value,
        },
        "plan": {
            "project_type": plan.project_type.value,
            "scale": scale,
            "weeks": list(plan.weeks),
            "total": plan.total,
        },
    }


class StartProject:
    def __init__(
        self,
        plans: ProjectPlans,
        scorings: ScoringRepository,
        promotion: PromotionService,
        audit_log: AuditLog,
    ) -> None:
        self._plans = plans
        self._scorings = scorings
        self._promotion = promotion
        self._audit_log = audit_log

    def execute(self, context: RequestContext, code: str, scale: Any, weeks: Any) -> StartResult:
        """Business rejections are returned (and audited); only an unknown project is raised.

        Order of checks: project, phase 0, no plan yet, authority, scale, weeks, saved scoring.
        """
        project = self._plans.get_project(code)
        if project is None:
            raise ProjectNotFound(code)
        phase = project.current_phase
        if phase != OPPORTUNITY_PHASE:
            return self._reject(context, project, ProjectNotInOpportunityPhase())
        if self._plans.get(project.id) is not None:
            return self._reject(context, project, PlanAlreadyConfirmed())
        decision = decide(context, Permission.PROMOTE, project.id, phase)
        if not decision.allowed:
            return self._reject(context, project, NoAuthority(phase, list(decision.who)))
        try:
            plan = ProposedPlan.from_input(project.project_type, scale, weeks)
        except (InvalidScale, InvalidWeeks) as error:
            return self._reject(context, project, error)
        scoring = self._scorings.latest(project.id)
        if scoring is None:
            return self._reject(context, project, IncompleteDeliverable(["scoring"]))

        # Written before promoting: the promotion freezes the deliverable it finds.
        self._plans.add(
            NewProjectPlan(
                study_id=project.study_id,
                project_id=project.id,
                project_type=plan.project_type,
                scale=plan.scale,
                weeks=plan.weeks,
                confirmed_by=context.user_id,
            )
        )
        self._plans.save_exit_content(project.id, _exit_content(project, plan, scoring))
        audit(
            self._audit_log,
            context,
            entity="project_plan",
            entity_id=code,
            action="confirm",
            new_value={
                "project_type": plan.project_type.value,
                "scale": plan.scale.value,
                "weeks": list(plan.weeks),
                "total": plan.total,
                "scoring_version": scoring.version,
            },
        )
        transition = self._promotion.promote(context, code)
        if not transition.ok:
            # Unreachable while phase 0 has no deliverable validators; roll everything back.
            raise RuntimeError(f"Promotion of {code} rejected after the plan was stored")
        return StartResult(transition, plan)

    def _reject(
        self, context: RequestContext, project: StartableProject, error: Any
    ) -> StartResult:
        audit(
            self._audit_log,
            context,
            entity="project",
            entity_id=project.code,
            action="start",
            old_value={"phase": project.current_phase},
            new_value={"error": error.code},
            outcome=Outcome.REJECTED,
        )
        phase = project.current_phase
        return StartResult(Transition(False, "start", phase, phase, None, error), None)


class ProjectPlanReader:
    def __init__(self, plans: ProjectPlans) -> None:
        self._plans = plans

    def read(self, code: str) -> ConfirmedPlan:
        project = self._plans.get_project(code, lock=False)
        if project is None:
            raise ProjectNotFound(code)
        plan = self._plans.get(project.id)
        if plan is None:
            raise PlanNotFound()
        return plan

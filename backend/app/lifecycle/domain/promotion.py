"""Record of a promotion, hold or do-not-pursue decision."""

from __future__ import annotations

from dataclasses import dataclass
from enum import Enum

from backend.app.lifecycle.domain.phases import LAST_PHASE, validate_phase


class Action(str, Enum):
    PROMOTE = "promote"
    HOLD = "hold"
    DO_NOT_PURSUE = "do_not_pursue"


class PromotionOutcome(str, Enum):
    OK = "ok"
    REJECTED = "rejected"


@dataclass(frozen=True, kw_only=True)
class Promotion:
    study_id: str
    project_id: str
    action: Action
    from_phase: int
    to_phase: int | None = None
    user_id: str
    reason: str | None = None
    outcome: PromotionOutcome = PromotionOutcome.OK

    def __post_init__(self) -> None:
        validate_phase(self.from_phase)
        if self.action is Action.PROMOTE:
            if self.from_phase >= LAST_PHASE or self.to_phase != self.from_phase + 1:
                raise ValueError("promote only advances to the next phase")
            return
        if self.to_phase is not None:
            raise ValueError(f"{self.action.value} has no target phase")
        if not (self.reason or "").strip():
            raise ValueError(f"{self.action.value} requires a reason")
        if self.action is Action.DO_NOT_PURSUE and self.from_phase != 0:
            raise ValueError("do_not_pursue is only possible in phase 0 (Opportunity)")

"""Explicit safety constraints for the RL/decision-support layer."""

from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass
from typing import Iterable

from ..injury_risk_model import InjuryRiskLevel
from ..recommendation_policy import PlannedSessionType, TrainingAction as TrainingActionId
from .actions import ActionCategory, TrainingActionDefinition
from .state import AthleteState


_HIGH_IMPACT_SESSIONS = {
    PlannedSessionType.TEMPO,
    PlannedSessionType.INTERVALS,
    PlannedSessionType.HILLS,
}

_LOW_QUALITY_ALLOWED_ACTIONS = {
    TrainingActionId.RECOMMEND_RF_BIOMECHANICS_RETEST,
    TrainingActionId.RECOMMEND_SUBJECTIVE_PAIN_CHECK_IN,
    TrainingActionId.SUGGEST_COACH_REVIEW,
    TrainingActionId.SUGGEST_CLINICIAN_REVIEW,
}


@dataclass(frozen=True)
class ConstraintViolation:
    constraint_name: str
    reason: str
    safety_flag: str


@dataclass(frozen=True)
class BlockedAction:
    action_id: TrainingActionId
    reasons: tuple[str, ...]
    safety_flags: tuple[str, ...]


class SafetyConstraint(ABC):
    name: str

    @abstractmethod
    def check(self, state: AthleteState, action: TrainingActionDefinition) -> ConstraintViolation | None:
        raise NotImplementedError


class LowDataQualityConstraint(SafetyConstraint):
    name = 'low_data_quality'

    def check(self, state: AthleteState, action: TrainingActionDefinition) -> ConstraintViolation | None:
        if state.effective_data_quality >= 0.45:
            return None
        if action.action_id in _LOW_QUALITY_ALLOWED_ACTIONS:
            return None
        return ConstraintViolation(
            constraint_name=self.name,
            reason='Only reassessment or human-review actions are allowed under low data quality.',
            safety_flag='low_data_quality_gate',
        )


class HighRiskSessionConstraint(SafetyConstraint):
    name = 'high_risk_session'

    def check(self, state: AthleteState, action: TrainingActionDefinition) -> ConstraintViolation | None:
        if state.risk_forecast.overall_risk_level not in {InjuryRiskLevel.HIGH, InjuryRiskLevel.CRITICAL}:
            return None
        if action.action_id == TrainingActionId.CONTINUE_MONITORING:
            return ConstraintViolation(
                constraint_name=self.name,
                reason='Continuing the planned session is unsafe under high injury-risk states.',
                safety_flag='high_risk_continuation_blocked',
            )
        if (
            state.planned_session_type in _HIGH_IMPACT_SESSIONS
            and action.action_id in {
                TrainingActionId.REDUCE_SESSION_VOLUME,
                TrainingActionId.REDUCE_WEEKLY_VOLUME,
                TrainingActionId.REDUCE_INTENSITY,
            }
        ):
            return ConstraintViolation(
                constraint_name=self.name,
                reason='A high-impact session should be substituted or escalated under high risk, not merely trimmed.',
                safety_flag='high_impact_substitution_required',
            )
        return None


class HighPainConstraint(SafetyConstraint):
    name = 'high_pain'

    def check(self, state: AthleteState, action: TrainingActionDefinition) -> ConstraintViolation | None:
        pain_score = state.pain_status.pain_score
        if pain_score < 6.0 and not state.pain_status.modified_training:
            return None
        if action.category == ActionCategory.MAINTAIN_PLAN:
            return ConstraintViolation(
                constraint_name=self.name,
                reason='Maintaining the plan is blocked when pain is high or training is already being modified.',
                safety_flag='pain_escalation_blocked',
            )
        if action.action_id in {
            TrainingActionId.REDUCE_SESSION_VOLUME,
            TrainingActionId.REDUCE_INTENSITY,
        }:
            return ConstraintViolation(
                constraint_name=self.name,
                reason='Higher pain requires substitution, screening, or human review instead of minor reductions.',
                safety_flag='pain_requires_substitution',
            )
        return None


class ManualRestrictionConstraint(SafetyConstraint):
    name = 'manual_restriction'

    def check(self, state: AthleteState, action: TrainingActionDefinition) -> ConstraintViolation | None:
        if action.action_id not in state.restricted_actions:
            return None
        return ConstraintViolation(
            constraint_name=self.name,
            reason='This action has been restricted by a coach or clinician.',
            safety_flag='manual_override_restriction',
        )


class ConstraintEngine:
    def __init__(self, constraints: Iterable[SafetyConstraint] | None = None) -> None:
        self.constraints = tuple(constraints or default_safety_constraints())

    def filter_actions(
        self,
        state: AthleteState,
        actions: Iterable[TrainingActionDefinition],
    ) -> tuple[list[TrainingActionDefinition], list[BlockedAction]]:
        allowed: list[TrainingActionDefinition] = []
        blocked: list[BlockedAction] = []
        for action in actions:
            violations = [
                violation
                for constraint in self.constraints
                if (violation := constraint.check(state, action)) is not None
            ]
            if not violations:
                allowed.append(action)
                continue
            blocked.append(
                BlockedAction(
                    action_id=action.action_id,
                    reasons=tuple(violation.reason for violation in violations),
                    safety_flags=tuple(violation.safety_flag for violation in violations),
                )
            )
        return allowed, blocked



def default_safety_constraints() -> tuple[SafetyConstraint, ...]:
    return (
        LowDataQualityConstraint(),
        HighRiskSessionConstraint(),
        HighPainConstraint(),
        ManualRestrictionConstraint(),
    )

"""Rule-based baseline policy for the RL/decision-support layer."""

from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from datetime import datetime
from typing import Iterable

from ..recommendation_policy import SafeRecommendationPolicy, TrainingAction as TrainingActionId
from .actions import ActionCategory, TrainingActionDefinition, build_default_action_catalog
from .constraints import BlockedAction, ConstraintEngine
from .state import AthleteState


@dataclass(frozen=True)
class PolicyRecommendation:
    athlete_id: str
    timestamp: datetime
    selected_action: TrainingActionDefinition
    confidence: float
    expected_benefit: dict[str, float]
    risk_tradeoffs: dict[str, float]
    explanation: list[str] = field(default_factory=list)
    safety_flags: list[str] = field(default_factory=list)
    blocked_actions: list[BlockedAction] = field(default_factory=list)
    requires_human_review: bool = False
    validation_status: str = 'experimental'
    model_version: str = 'rule_based_intervention_policy_v0'


class InterventionPolicy(ABC):
    @abstractmethod
    def recommend_action(
        self,
        state: AthleteState,
        available_actions: Iterable[TrainingActionId] | None = None,
    ) -> PolicyRecommendation:
        raise NotImplementedError


class RuleBasedInterventionPolicy(InterventionPolicy):
    def __init__(
        self,
        action_catalog: dict[TrainingActionId, TrainingActionDefinition] | None = None,
        constraint_engine: ConstraintEngine | None = None,
        heuristic_policy: SafeRecommendationPolicy | None = None,
        model_version: str = 'rule_based_intervention_policy_v0',
    ) -> None:
        self.action_catalog = action_catalog or build_default_action_catalog()
        self.constraint_engine = constraint_engine or ConstraintEngine()
        self.heuristic_policy = heuristic_policy or SafeRecommendationPolicy()
        self.model_version = model_version

    def recommend_action(
        self,
        state: AthleteState,
        available_actions: Iterable[TrainingActionId] | None = None,
    ) -> PolicyRecommendation:
        candidate_ids = list(available_actions or self.action_catalog.keys())
        candidates = [self.action_catalog[action_id] for action_id in candidate_ids]
        allowed_actions, blocked_actions = self.constraint_engine.filter_actions(state, candidates)
        heuristic = self.heuristic_policy.recommend(state.risk_forecast, state.to_training_state())

        preferred_ids = [heuristic.primary_action.action]
        preferred_ids.extend(action.action for action in heuristic.secondary_actions)
        preferred_ids.extend([
            TrainingActionId.RECOMMEND_RF_BIOMECHANICS_RETEST,
            TrainingActionId.SUGGEST_COACH_REVIEW,
            TrainingActionId.SUGGEST_CLINICIAN_REVIEW,
        ])

        selected_action = self._select_action(preferred_ids, allowed_actions)
        if selected_action is None:
            fallback_catalog = [
                self.action_catalog[TrainingActionId.SUGGEST_COACH_REVIEW],
                self.action_catalog[TrainingActionId.SUGGEST_CLINICIAN_REVIEW],
                self.action_catalog[TrainingActionId.RECOMMEND_RF_BIOMECHANICS_RETEST],
            ]
            fallback_allowed, fallback_blocked = self.constraint_engine.filter_actions(state, fallback_catalog)
            blocked_actions.extend(fallback_blocked)
            selected_action = fallback_allowed[0] if fallback_allowed else fallback_catalog[0]

        explanation = [heuristic.primary_action.rationale]
        if selected_action.action_id != heuristic.primary_action.action:
            explanation.insert(
                0,
                'The first-choice heuristic action was blocked or unavailable, so a safer fallback was selected.',
            )
        explanation.extend(driver.explanation for driver in heuristic.contributing_factors[:2])

        safety_flags = list(dict.fromkeys(
            heuristic.safety_warnings + [flag for blocked in blocked_actions for flag in blocked.safety_flags]
        ))
        requires_human_review = (
            selected_action.requires_human_review
            or state.pain_status.pain_score >= 6.0
            or selected_action.category == ActionCategory.ESCALATION
        )

        return PolicyRecommendation(
            athlete_id=state.athlete_id,
            timestamp=state.timestamp,
            selected_action=selected_action,
            confidence=heuristic.recommendation_confidence,
            expected_benefit=self._expected_benefit(state, selected_action),
            risk_tradeoffs=self._risk_tradeoffs(selected_action, requires_human_review),
            explanation=explanation,
            safety_flags=safety_flags,
            blocked_actions=blocked_actions,
            requires_human_review=requires_human_review,
            validation_status='experimental',
            model_version=self.model_version,
        )

    @staticmethod
    def _select_action(
        preferred_ids: Iterable[TrainingActionId],
        allowed_actions: list[TrainingActionDefinition],
    ) -> TrainingActionDefinition | None:
        by_id = {action.action_id: action for action in allowed_actions}
        for action_id in preferred_ids:
            if action_id in by_id:
                return by_id[action_id]
        if not allowed_actions:
            return None
        conservative_rank = {
            TrainingActionId.RECOMMEND_RF_BIOMECHANICS_RETEST: 0,
            TrainingActionId.SUGGEST_COACH_REVIEW: 1,
            TrainingActionId.SUGGEST_CLINICIAN_REVIEW: 2,
            TrainingActionId.REPLACE_WITH_RECOVERY_DAY: 3,
            TrainingActionId.REPLACE_WITH_CROSS_TRAINING: 4,
            TrainingActionId.REPLACE_WITH_EASY_AEROBIC_RUN: 5,
            TrainingActionId.REDUCE_WEEKLY_VOLUME: 6,
        }
        return sorted(
            allowed_actions,
            key=lambda action: conservative_rank.get(action.action_id, 99),
        )[0]

    @staticmethod
    def _expected_benefit(
        state: AthleteState,
        action: TrainingActionDefinition,
    ) -> dict[str, float]:
        return {
            'short_horizon_risk_reduction': round(
                max(0.0, state.risk_forecast.overall_risk_score * (1.0 - action.expected_training_stimulus)),
                3,
            ),
            'training_continuity': round(action.expected_training_stimulus, 3),
            'data_quality_gain': 0.3 if action.action_id == TrainingActionId.RECOMMEND_RF_BIOMECHANICS_RETEST else 0.0,
        }

    @staticmethod
    def _risk_tradeoffs(
        action: TrainingActionDefinition,
        requires_human_review: bool,
    ) -> dict[str, float]:
        return {
            'training_stimulus_cost': round(1.0 - action.expected_training_stimulus, 3),
            'human_review_latency': 0.25 if requires_human_review else 0.0,
        }

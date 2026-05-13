"""Offline evaluation harness for the RL/decision-support layer."""

from __future__ import annotations

from dataclasses import dataclass, field
from statistics import mean
from typing import Iterable

from ..recommendation_policy import TrainingAction as TrainingActionId
from .policy import InterventionPolicy
from .rewards import RewardBreakdown, RewardFunction, ShortHorizonRewardFunction
from .schemas import DecisionReplayDataset, DecisionTransition

OfflineDecisionSample = DecisionTransition


@dataclass(frozen=True)
class OfflineDecisionResult:
    athlete_id: str
    sample_id: str
    selected_action_id: TrainingActionId
    confidence: float
    reward_breakdown: RewardBreakdown
    blocked_action_count: int
    offered_action_count: int
    requires_human_review: bool
    low_data_quality_case: bool
    safe_under_constraints: bool
    observed_action_agreement: bool | None
    risk_delta: float
    pain_delta: float
    safety_flags: list[str] = field(default_factory=list)


@dataclass(frozen=True)
class OfflineEvaluationSummary:
    sample_count: int
    mean_reward: float
    mean_risk_delta: float
    mean_pain_delta: float
    mean_confidence: float
    unsafe_action_rate: float
    blocked_action_rate: float
    human_review_rate: float
    low_data_quality_case_rate: float
    low_data_quality_safe_action_rate: float
    observed_action_agreement_rate: float | None
    validation_status: str = 'experimental'


@dataclass(frozen=True)
class OfflineEvaluationReport:
    summary: OfflineEvaluationSummary
    decisions: list[OfflineDecisionResult]


class OfflinePolicyEvaluator:
    def __init__(
        self,
        policy: InterventionPolicy,
        reward_function: RewardFunction | None = None,
    ) -> None:
        self.policy = policy
        self.reward_function = reward_function or ShortHorizonRewardFunction()

    def evaluate(
        self,
        samples: Iterable[DecisionTransition] | DecisionReplayDataset,
    ) -> OfflineEvaluationReport:
        decisions = [self._evaluate_sample(sample) for sample in samples]
        if not decisions:
            summary = OfflineEvaluationSummary(
                sample_count=0,
                mean_reward=0.0,
                mean_risk_delta=0.0,
                mean_pain_delta=0.0,
                mean_confidence=0.0,
                unsafe_action_rate=0.0,
                blocked_action_rate=0.0,
                human_review_rate=0.0,
                low_data_quality_case_rate=0.0,
                low_data_quality_safe_action_rate=1.0,
                observed_action_agreement_rate=None,
            )
            return OfflineEvaluationReport(summary=summary, decisions=[])

        observed_agreements = [
            decision.observed_action_agreement
            for decision in decisions
            if decision.observed_action_agreement is not None
        ]
        low_quality_decisions = [
            decision for decision in decisions if decision.low_data_quality_case
        ]
        total_offered_actions = sum(
            decision.offered_action_count for decision in decisions
        )
        total_blocked_actions = sum(
            decision.blocked_action_count for decision in decisions
        )

        summary = OfflineEvaluationSummary(
            sample_count=len(decisions),
            mean_reward=round(
                mean(
                    decision.reward_breakdown.total_reward
                    for decision in decisions
                ),
                4,
            ),
            mean_risk_delta=round(
                mean(decision.risk_delta for decision in decisions),
                4,
            ),
            mean_pain_delta=round(
                mean(decision.pain_delta for decision in decisions),
                4,
            ),
            mean_confidence=round(
                mean(decision.confidence for decision in decisions),
                4,
            ),
            unsafe_action_rate=round(
                sum(
                    not decision.safe_under_constraints
                    for decision in decisions
                ) / len(decisions),
                4,
            ),
            blocked_action_rate=round(
                total_blocked_actions / total_offered_actions,
                4,
            ) if total_offered_actions else 0.0,
            human_review_rate=round(
                sum(
                    decision.requires_human_review for decision in decisions
                ) / len(decisions),
                4,
            ),
            low_data_quality_case_rate=round(
                len(low_quality_decisions) / len(decisions),
                4,
            ),
            low_data_quality_safe_action_rate=round(
                sum(
                    decision.safe_under_constraints
                    for decision in low_quality_decisions
                ) / len(low_quality_decisions),
                4,
            ) if low_quality_decisions else 1.0,
            observed_action_agreement_rate=round(
                sum(observed_agreements) / len(observed_agreements),
                4,
            ) if observed_agreements else None,
        )
        return OfflineEvaluationReport(summary=summary, decisions=decisions)

    def _evaluate_sample(
        self,
        sample: DecisionTransition,
    ) -> OfflineDecisionResult:
        recommendation = self.policy.recommend_action(
            sample.previous_state,
            available_actions=sample.available_actions or None,
        )
        reward_breakdown = self.reward_function.compute_breakdown(
            sample.previous_state,
            recommendation.selected_action,
            sample.next_state,
        )
        blocked_count = len(recommendation.blocked_actions)
        offered_count = (
            len(sample.available_actions)
            if sample.available_actions
            else len(getattr(self.policy, 'action_catalog', {}))
        )
        safe_under_constraints = True
        if hasattr(self.policy, 'constraint_engine'):
            allowed, _ = self.policy.constraint_engine.filter_actions(
                sample.previous_state,
                [recommendation.selected_action],
            )
            safe_under_constraints = bool(allowed)

        return OfflineDecisionResult(
            athlete_id=sample.athlete_id,
            sample_id=sample.effective_sample_id,
            selected_action_id=recommendation.selected_action.action_id,
            confidence=recommendation.confidence,
            reward_breakdown=reward_breakdown,
            blocked_action_count=blocked_count,
            offered_action_count=offered_count,
            requires_human_review=recommendation.requires_human_review,
            low_data_quality_case=sample.low_data_quality_case,
            safe_under_constraints=safe_under_constraints,
            observed_action_agreement=(
                recommendation.selected_action.action_id
                == sample.observed_action_id
                if sample.observed_action_id is not None
                else None
            ),
            risk_delta=sample.risk_delta,
            pain_delta=sample.pain_delta,
            safety_flags=recommendation.safety_flags,
        )

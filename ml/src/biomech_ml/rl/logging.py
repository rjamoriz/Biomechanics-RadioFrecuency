"""Structured audit logging helpers for RL recommendations."""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime
from typing import Any, Iterable

from ..recommendation_policy import TrainingAction as TrainingActionId
from .policy import PolicyRecommendation
from .rewards import RewardBreakdown
from .schemas import DecisionTransition
from .state import AthleteState


@dataclass(frozen=True)
class AthleteStateAuditSnapshot:
    marathon_phase: str
    planned_session_type: str
    overall_risk_score: float
    overall_risk_level: str
    pain_score: float
    readiness_score: float | None
    acute_load: float | None
    chronic_load: float | None
    signal_quality_score: float
    effective_data_quality: float
    calibrated: bool
    restricted_actions: tuple[str, ...] = ()


@dataclass(frozen=True)
class BlockedActionAudit:
    action_id: str
    reasons: tuple[str, ...]
    safety_flags: tuple[str, ...]


@dataclass(frozen=True)
class ObservedDecisionOutcome:
    reward: float | None
    risk_delta: float
    pain_delta: float
    resulting_risk_score: float
    resulting_pain_score: float

    @classmethod
    def from_transition(
        cls,
        previous_state: AthleteState,
        next_state: AthleteState,
        reward_breakdown: RewardBreakdown | None = None,
    ) -> ObservedDecisionOutcome:
        return cls(
            reward=(
                reward_breakdown.total_reward
                if reward_breakdown is not None
                else None
            ),
            risk_delta=round(
                previous_state.risk_forecast.overall_risk_score
                - next_state.risk_forecast.overall_risk_score,
                4,
            ),
            pain_delta=round(
                previous_state.pain_status.pain_score
                - next_state.pain_status.pain_score,
                4,
            ),
            resulting_risk_score=round(
                next_state.risk_forecast.overall_risk_score,
                4,
            ),
            resulting_pain_score=round(
                next_state.pain_status.pain_score,
                4,
            ),
        )

    @classmethod
    def from_decision_transition(
        cls,
        transition: DecisionTransition,
        reward_breakdown: RewardBreakdown | None = None,
    ) -> ObservedDecisionOutcome:
        return cls.from_transition(
            transition.previous_state,
            transition.next_state,
            reward_breakdown,
        )


@dataclass(frozen=True)
class RecommendationAuditRecord:
    record_id: str
    athlete_id: str
    timestamp: datetime
    selected_action_id: str
    available_action_ids: tuple[str, ...]
    state_snapshot: AthleteStateAuditSnapshot
    confidence: float
    expected_benefit: dict[str, float]
    risk_tradeoffs: dict[str, float]
    explanation: tuple[str, ...] = ()
    safety_flags: tuple[str, ...] = ()
    blocked_actions: tuple[BlockedActionAudit, ...] = ()
    requires_human_review: bool = False
    validation_status: str = 'experimental'
    model_version: str = 'rule_based_intervention_policy_v0'
    observed_outcome: ObservedDecisionOutcome | None = None
    metadata: dict[str, Any] = field(default_factory=dict)


class RecommendationAuditLogger:
    def build_record(
        self,
        state: AthleteState,
        recommendation: PolicyRecommendation,
        *,
        available_actions: Iterable[TrainingActionId] | None = None,
        observed_outcome: ObservedDecisionOutcome | None = None,
        metadata: dict[str, Any] | None = None,
        record_id: str | None = None,
    ) -> RecommendationAuditRecord:
        resolved_record_id = record_id or self._build_record_id(
            state,
            recommendation,
        )
        return RecommendationAuditRecord(
            record_id=resolved_record_id,
            athlete_id=state.athlete_id,
            timestamp=state.timestamp,
            selected_action_id=recommendation.selected_action.action_id.value,
            available_action_ids=tuple(
                action.value for action in available_actions or ()
            ),
            state_snapshot=self._build_state_snapshot(state),
            confidence=recommendation.confidence,
            expected_benefit=dict(recommendation.expected_benefit),
            risk_tradeoffs=dict(recommendation.risk_tradeoffs),
            explanation=tuple(recommendation.explanation),
            safety_flags=tuple(recommendation.safety_flags),
            blocked_actions=tuple(
                BlockedActionAudit(
                    action_id=blocked.action_id.value,
                    reasons=blocked.reasons,
                    safety_flags=blocked.safety_flags,
                )
                for blocked in recommendation.blocked_actions
            ),
            requires_human_review=recommendation.requires_human_review,
            validation_status=recommendation.validation_status,
            model_version=recommendation.model_version,
            observed_outcome=observed_outcome,
            metadata=dict(metadata or {}),
        )

    def build_record_from_transition(
        self,
        transition: DecisionTransition,
        recommendation: PolicyRecommendation,
        *,
        reward_breakdown: RewardBreakdown | None = None,
        observed_outcome: ObservedDecisionOutcome | None = None,
        metadata: dict[str, Any] | None = None,
        record_id: str | None = None,
    ) -> RecommendationAuditRecord:
        merged_metadata = dict(transition.metadata)
        merged_metadata.setdefault('sample_id', transition.effective_sample_id)
        merged_metadata.setdefault(
            'transition_source',
            transition.transition_source,
        )
        merged_metadata.setdefault(
            'transition_validation_status',
            transition.validation_status,
        )
        if metadata is not None:
            merged_metadata.update(metadata)

        return self.build_record(
            transition.previous_state,
            recommendation,
            available_actions=transition.available_actions or None,
            observed_outcome=(
                observed_outcome
                or ObservedDecisionOutcome.from_decision_transition(
                    transition,
                    reward_breakdown,
                )
            ),
            metadata=merged_metadata,
            record_id=record_id,
        )

    def to_log_payload(
        self,
        record: RecommendationAuditRecord,
    ) -> dict[str, Any]:
        return {
            'record_id': record.record_id,
            'athlete_id': record.athlete_id,
            'timestamp': record.timestamp.isoformat(),
            'selected_action_id': record.selected_action_id,
            'available_action_ids': list(record.available_action_ids),
            'state_snapshot': {
                'marathon_phase': record.state_snapshot.marathon_phase,
                'planned_session_type': record.state_snapshot.planned_session_type,
                'overall_risk_score': record.state_snapshot.overall_risk_score,
                'overall_risk_level': record.state_snapshot.overall_risk_level,
                'pain_score': record.state_snapshot.pain_score,
                'readiness_score': record.state_snapshot.readiness_score,
                'acute_load': record.state_snapshot.acute_load,
                'chronic_load': record.state_snapshot.chronic_load,
                'signal_quality_score': record.state_snapshot.signal_quality_score,
                'effective_data_quality': record.state_snapshot.effective_data_quality,
                'calibrated': record.state_snapshot.calibrated,
                'restricted_actions': list(
                    record.state_snapshot.restricted_actions
                ),
            },
            'confidence': record.confidence,
            'expected_benefit': dict(record.expected_benefit),
            'risk_tradeoffs': dict(record.risk_tradeoffs),
            'explanation': list(record.explanation),
            'safety_flags': list(record.safety_flags),
            'blocked_actions': [
                {
                    'action_id': blocked.action_id,
                    'reasons': list(blocked.reasons),
                    'safety_flags': list(blocked.safety_flags),
                }
                for blocked in record.blocked_actions
            ],
            'requires_human_review': record.requires_human_review,
            'validation_status': record.validation_status,
            'model_version': record.model_version,
            'observed_outcome': (
                {
                    'reward': record.observed_outcome.reward,
                    'risk_delta': record.observed_outcome.risk_delta,
                    'pain_delta': record.observed_outcome.pain_delta,
                    'resulting_risk_score': (
                        record.observed_outcome.resulting_risk_score
                    ),
                    'resulting_pain_score': (
                        record.observed_outcome.resulting_pain_score
                    ),
                }
                if record.observed_outcome is not None
                else None
            ),
            'metadata': dict(record.metadata),
        }

    @staticmethod
    def _build_record_id(
        state: AthleteState,
        recommendation: PolicyRecommendation,
    ) -> str:
        return (
            f'{state.athlete_id}:{state.timestamp.isoformat()}:'
            f'{recommendation.selected_action.action_id.value}'
        )

    @staticmethod
    def _build_state_snapshot(
        state: AthleteState,
    ) -> AthleteStateAuditSnapshot:
        return AthleteStateAuditSnapshot(
            marathon_phase=state.marathon_phase.value,
            planned_session_type=state.planned_session_type.value,
            overall_risk_score=round(
                state.risk_forecast.overall_risk_score,
                4,
            ),
            overall_risk_level=state.risk_forecast.overall_risk_level.value,
            pain_score=round(state.pain_status.pain_score, 4),
            readiness_score=state.recovery.readiness_score,
            acute_load=state.training_load.acute_load,
            chronic_load=state.training_load.chronic_load,
            signal_quality_score=round(state.signal_quality_score, 4),
            effective_data_quality=round(
                state.effective_data_quality,
                4,
            ),
            calibrated=state.calibrated,
            restricted_actions=tuple(
                sorted(action.value for action in state.restricted_actions)
            ),
        )

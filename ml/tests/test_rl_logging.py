"""Tests for RL recommendation audit logging."""

from __future__ import annotations

from biomech_ml.injury_risk_model import InjuryRiskFactor, InjuryRiskLevel, InjuryRiskOutput
from biomech_ml.recommendation_policy import (
    MarathonPhase,
    PainStatus,
    PlannedSessionType,
    RecoveryState,
    TrainingAction,
    TrainingLoadState,
)
from biomech_ml.rl import ObservedDecisionOutcome, RecommendationAuditLogger
from biomech_ml.rl.policy import RuleBasedInterventionPolicy
from biomech_ml.rl.rewards import ShortHorizonRewardFunction
from biomech_ml.rl.state import AthleteState


def _risk_output(
    score: float,
    level: InjuryRiskLevel,
    *,
    signal_quality_score: float = 0.9,
    model_confidence: float = 0.8,
    risk_factors: list[InjuryRiskFactor] | None = None,
) -> InjuryRiskOutput:
    return InjuryRiskOutput(
        overall_risk_score=score,
        overall_risk_level=level,
        risk_factors=risk_factors or [
            InjuryRiskFactor(
                factor_id='asymmetry',
                label='Asymmetry',
                value=0.2,
                weight=0.25,
                elevated=False,
                description='Baseline asymmetry context.',
            )
        ],
        model_confidence=model_confidence,
        signal_quality_score=signal_quality_score,
        validation_status='experimental',
        experimental=True,
    )


class TestRecommendationAuditLogger:
    def test_build_record_captures_state_and_blocked_actions(self) -> None:
        policy = RuleBasedInterventionPolicy()
        logger = RecommendationAuditLogger()
        state = AthleteState(
            athlete_id='athlete-logger-1',
            planned_session_type=PlannedSessionType.INTERVALS,
            marathon_phase=MarathonPhase.BUILD,
            training_load=TrainingLoadState(acute_load=82.0, chronic_load=55.0),
            recovery=RecoveryState(readiness_score=0.42),
            pain_status=PainStatus(pain_score=3.0),
            risk_forecast=_risk_output(0.82, InjuryRiskLevel.CRITICAL),
            signal_quality_score=0.84,
            data_quality_score=0.84,
            calibrated=True,
        )

        recommendation = policy.recommend_action(
            state,
            available_actions=(
                TrainingAction.CONTINUE_MONITORING,
                TrainingAction.REPLACE_WITH_CROSS_TRAINING,
                TrainingAction.SUGGEST_COACH_REVIEW,
            ),
        )

        record = logger.build_record(
            state,
            recommendation,
            available_actions=(
                TrainingAction.CONTINUE_MONITORING,
                TrainingAction.REPLACE_WITH_CROSS_TRAINING,
                TrainingAction.SUGGEST_COACH_REVIEW,
            ),
        )

        assert record.selected_action_id == 'replace_with_cross_training'
        assert record.state_snapshot.overall_risk_level == 'critical'
        assert record.state_snapshot.planned_session_type == 'intervals'
        assert record.available_action_ids == (
            'continue_monitoring',
            'replace_with_cross_training',
            'suggest_coach_review',
        )
        assert any(blocked.action_id == 'continue_monitoring' for blocked in record.blocked_actions)
        assert record.confidence == recommendation.confidence
        assert record.requires_human_review is False

    def test_to_log_payload_serializes_observed_outcome(self) -> None:
        policy = RuleBasedInterventionPolicy()
        logger = RecommendationAuditLogger()
        reward_function = ShortHorizonRewardFunction()
        previous_state = AthleteState(
            athlete_id='athlete-logger-2',
            planned_session_type=PlannedSessionType.LONG_RUN,
            marathon_phase=MarathonPhase.BUILD,
            training_load=TrainingLoadState(acute_load=80.0, chronic_load=58.0),
            recovery=RecoveryState(readiness_score=0.5),
            pain_status=PainStatus(pain_score=4.0),
            risk_forecast=_risk_output(0.58, InjuryRiskLevel.ELEVATED),
            signal_quality_score=0.85,
            data_quality_score=0.85,
            calibrated=True,
        )
        next_state = AthleteState(
            athlete_id='athlete-logger-2',
            planned_session_type=PlannedSessionType.EASY_AEROBIC,
            marathon_phase=MarathonPhase.BUILD,
            training_load=TrainingLoadState(acute_load=68.0, chronic_load=58.0),
            recovery=RecoveryState(readiness_score=0.68),
            pain_status=PainStatus(pain_score=2.0),
            risk_forecast=_risk_output(0.32, InjuryRiskLevel.MODERATE),
            signal_quality_score=0.88,
            data_quality_score=0.88,
            calibrated=True,
        )

        recommendation = policy.recommend_action(
            previous_state,
            available_actions=(
                TrainingAction.REDUCE_WEEKLY_VOLUME,
                TrainingAction.REPLACE_WITH_EASY_AEROBIC_RUN,
            ),
        )
        reward_breakdown = reward_function.compute_breakdown(
            previous_state,
            recommendation.selected_action,
            next_state,
        )
        observed_outcome = ObservedDecisionOutcome.from_transition(
            previous_state,
            next_state,
            reward_breakdown,
        )

        record = logger.build_record(
            previous_state,
            recommendation,
            available_actions=(
                TrainingAction.REDUCE_WEEKLY_VOLUME,
                TrainingAction.REPLACE_WITH_EASY_AEROBIC_RUN,
            ),
            observed_outcome=observed_outcome,
            metadata={'source': 'offline_replay'},
        )
        payload = logger.to_log_payload(record)

        assert payload['selected_action_id'] == recommendation.selected_action.action_id.value
        assert payload['observed_outcome']['risk_delta'] == 0.26
        assert payload['observed_outcome']['pain_delta'] == 2.0
        assert payload['observed_outcome']['reward'] == reward_breakdown.total_reward
        assert payload['metadata']['source'] == 'offline_replay'

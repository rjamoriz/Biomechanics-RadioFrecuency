"""Tests for the contextual bandit RL baseline."""

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
from biomech_ml.rl import ContextualBanditPolicy
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


class TestContextualBanditPolicy:
    def test_falls_back_to_rule_based_policy_without_history(self) -> None:
        policy = ContextualBanditPolicy()
        state = AthleteState(
            athlete_id='athlete-bandit-1',
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

        assert recommendation.selected_action.action_id == TrainingAction.REPLACE_WITH_CROSS_TRAINING
        assert recommendation.model_version == 'contextual_bandit_policy_v0'
        assert 'rule-based fallback' in recommendation.explanation[0].lower()

    def test_prefers_safe_action_with_better_reward_history(self) -> None:
        policy = ContextualBanditPolicy(min_samples_for_learned_choice=2)
        state = AthleteState(
            athlete_id='athlete-bandit-2',
            planned_session_type=PlannedSessionType.LONG_RUN,
            marathon_phase=MarathonPhase.BUILD,
            training_load=TrainingLoadState(acute_load=90.0, chronic_load=55.0),
            recovery=RecoveryState(readiness_score=0.58),
            pain_status=PainStatus(pain_score=2.0),
            risk_forecast=_risk_output(0.55, InjuryRiskLevel.ELEVATED),
            signal_quality_score=0.88,
            data_quality_score=0.88,
            calibrated=True,
        )

        for reward in (0.2, 0.25):
            policy.record_outcome(state, TrainingAction.REDUCE_WEEKLY_VOLUME, reward)
        for reward in (0.6, 0.55):
            policy.record_outcome(state, TrainingAction.REPLACE_WITH_EASY_AEROBIC_RUN, reward)

        recommendation = policy.recommend_action(
            state,
            available_actions=(
                TrainingAction.REDUCE_WEEKLY_VOLUME,
                TrainingAction.REPLACE_WITH_EASY_AEROBIC_RUN,
            ),
        )

        assert recommendation.selected_action.action_id == TrainingAction.REPLACE_WITH_EASY_AEROBIC_RUN
        assert recommendation.expected_benefit['learned_expected_reward'] == 0.575
        assert any('higher-reward safe alternative' in item for item in recommendation.explanation)

    def test_safety_gate_blocks_unsafe_action_even_with_higher_reward_history(self) -> None:
        policy = ContextualBanditPolicy(min_samples_for_learned_choice=2)
        state = AthleteState(
            athlete_id='athlete-bandit-3',
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

        for reward in (0.95, 0.9):
            policy.record_outcome(state, TrainingAction.CONTINUE_MONITORING, reward)
        for reward in (0.35, 0.4):
            policy.record_outcome(state, TrainingAction.REPLACE_WITH_CROSS_TRAINING, reward)

        recommendation = policy.recommend_action(
            state,
            available_actions=(
                TrainingAction.CONTINUE_MONITORING,
                TrainingAction.REPLACE_WITH_CROSS_TRAINING,
                TrainingAction.SUGGEST_COACH_REVIEW,
            ),
        )

        assert recommendation.selected_action.action_id == TrainingAction.REPLACE_WITH_CROSS_TRAINING
        assert any(blocked.action_id == TrainingAction.CONTINUE_MONITORING for blocked in recommendation.blocked_actions)

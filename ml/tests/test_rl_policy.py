"""Tests for the minimal RL/decision-support baseline package."""

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
from biomech_ml.rl.actions import build_default_action_catalog
from biomech_ml.rl.constraints import ConstraintEngine
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


class TestConstraintEngine:
    def test_low_data_quality_blocks_continue_monitoring(self) -> None:
        catalog = build_default_action_catalog()
        state = AthleteState(
            athlete_id='athlete-1',
            planned_session_type=PlannedSessionType.EASY_AEROBIC,
            marathon_phase=MarathonPhase.BUILD,
            training_load=TrainingLoadState(acute_load=44.0, chronic_load=42.0),
            recovery=RecoveryState(readiness_score=0.6),
            pain_status=PainStatus(pain_score=1.0),
            risk_forecast=_risk_output(0.18, InjuryRiskLevel.LOW, signal_quality_score=0.3, model_confidence=0.4),
            signal_quality_score=0.3,
            data_quality_score=0.35,
            calibrated=False,
        )
        engine = ConstraintEngine()
        allowed, blocked = engine.filter_actions(
            state,
            [catalog[TrainingAction.CONTINUE_MONITORING], catalog[TrainingAction.RECOMMEND_RF_BIOMECHANICS_RETEST]],
        )

        assert [action.action_id for action in allowed] == [TrainingAction.RECOMMEND_RF_BIOMECHANICS_RETEST]
        assert blocked[0].action_id == TrainingAction.CONTINUE_MONITORING


class TestRuleBasedInterventionPolicy:
    def test_high_risk_interval_session_prefers_cross_training(self) -> None:
        policy = RuleBasedInterventionPolicy()
        state = AthleteState(
            athlete_id='athlete-2',
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
            available_actions=[
                TrainingAction.CONTINUE_MONITORING,
                TrainingAction.REPLACE_WITH_CROSS_TRAINING,
                TrainingAction.SUGGEST_COACH_REVIEW,
            ],
        )

        assert recommendation.selected_action.action_id == TrainingAction.REPLACE_WITH_CROSS_TRAINING
        assert any(blocked.action_id == TrainingAction.CONTINUE_MONITORING for blocked in recommendation.blocked_actions)

    def test_manual_restriction_forces_fallback_review(self) -> None:
        policy = RuleBasedInterventionPolicy()
        state = AthleteState(
            athlete_id='athlete-3',
            planned_session_type=PlannedSessionType.EASY_AEROBIC,
            marathon_phase=MarathonPhase.BUILD,
            training_load=TrainingLoadState(acute_load=46.0, chronic_load=44.0),
            recovery=RecoveryState(readiness_score=0.71),
            pain_status=PainStatus(pain_score=1.0),
            risk_forecast=_risk_output(
                0.30,
                InjuryRiskLevel.MODERATE,
                risk_factors=[
                    InjuryRiskFactor(
                        factor_id='asymmetry',
                        label='Asymmetry',
                        value=0.72,
                        weight=0.25,
                        elevated=True,
                        description='Step-to-step asymmetry remains elevated.',
                    )
                ],
            ),
            signal_quality_score=0.9,
            data_quality_score=0.9,
            calibrated=True,
            coach_restricted_actions=(TrainingAction.SUGGEST_CADENCE_ADJUSTMENT,),
        )

        recommendation = policy.recommend_action(
            state,
            available_actions=[
                TrainingAction.SUGGEST_CADENCE_ADJUSTMENT,
                TrainingAction.SUGGEST_COACH_REVIEW,
            ],
        )

        assert recommendation.selected_action.action_id == TrainingAction.SUGGEST_COACH_REVIEW
        assert recommendation.requires_human_review is True
        assert any(blocked.action_id == TrainingAction.SUGGEST_CADENCE_ADJUSTMENT for blocked in recommendation.blocked_actions)


class TestShortHorizonRewardFunction:
    def test_reward_improves_when_risk_and_pain_drop(self) -> None:
        catalog = build_default_action_catalog()
        reward_fn = ShortHorizonRewardFunction()
        previous_state = AthleteState(
            athlete_id='athlete-4',
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
            athlete_id='athlete-4',
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

        breakdown = reward_fn.compute_breakdown(
            previous_state,
            catalog[TrainingAction.REDUCE_WEEKLY_VOLUME],
            next_state,
        )

        assert breakdown.risk_component > 0.0
        assert breakdown.pain_component > 0.0
        assert breakdown.total_reward > 0.0

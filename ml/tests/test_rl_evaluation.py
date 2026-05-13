"""Tests for offline RL policy evaluation."""

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
from biomech_ml.rl.evaluation import OfflineDecisionSample, OfflinePolicyEvaluator
from biomech_ml.rl.policy import RuleBasedInterventionPolicy
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


class TestOfflinePolicyEvaluator:
    def test_evaluator_summarizes_safety_and_agreement_metrics(self) -> None:
        policy = RuleBasedInterventionPolicy()
        evaluator = OfflinePolicyEvaluator(policy)
        samples = [
            OfflineDecisionSample(
                sample_id='low-quality-case',
                previous_state=AthleteState(
                    athlete_id='athlete-1',
                    planned_session_type=PlannedSessionType.EASY_AEROBIC,
                    marathon_phase=MarathonPhase.BUILD,
                    training_load=TrainingLoadState(acute_load=42.0, chronic_load=40.0),
                    recovery=RecoveryState(readiness_score=0.55),
                    pain_status=PainStatus(pain_score=1.0),
                    risk_forecast=_risk_output(0.18, InjuryRiskLevel.LOW, signal_quality_score=0.3, model_confidence=0.45),
                    signal_quality_score=0.32,
                    data_quality_score=0.35,
                    calibrated=False,
                ),
                next_state=AthleteState(
                    athlete_id='athlete-1',
                    planned_session_type=PlannedSessionType.EASY_AEROBIC,
                    marathon_phase=MarathonPhase.BUILD,
                    training_load=TrainingLoadState(acute_load=40.0, chronic_load=40.0),
                    recovery=RecoveryState(readiness_score=0.6),
                    pain_status=PainStatus(pain_score=1.0),
                    risk_forecast=_risk_output(0.16, InjuryRiskLevel.LOW, signal_quality_score=0.55, model_confidence=0.55),
                    signal_quality_score=0.55,
                    data_quality_score=0.55,
                    calibrated=True,
                ),
                available_actions=(
                    TrainingAction.CONTINUE_MONITORING,
                    TrainingAction.RECOMMEND_RF_BIOMECHANICS_RETEST,
                ),
                observed_action_id=TrainingAction.RECOMMEND_RF_BIOMECHANICS_RETEST,
            ),
            OfflineDecisionSample(
                sample_id='high-risk-intervals',
                previous_state=AthleteState(
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
                ),
                next_state=AthleteState(
                    athlete_id='athlete-2',
                    planned_session_type=PlannedSessionType.CROSS_TRAINING,
                    marathon_phase=MarathonPhase.BUILD,
                    training_load=TrainingLoadState(acute_load=68.0, chronic_load=55.0),
                    recovery=RecoveryState(readiness_score=0.58),
                    pain_status=PainStatus(pain_score=2.0),
                    risk_forecast=_risk_output(0.52, InjuryRiskLevel.ELEVATED),
                    signal_quality_score=0.88,
                    data_quality_score=0.88,
                    calibrated=True,
                ),
                available_actions=(
                    TrainingAction.CONTINUE_MONITORING,
                    TrainingAction.REPLACE_WITH_CROSS_TRAINING,
                    TrainingAction.SUGGEST_COACH_REVIEW,
                ),
                observed_action_id=TrainingAction.SUGGEST_COACH_REVIEW,
            ),
        ]

        report = evaluator.evaluate(samples)

        assert report.summary.sample_count == 2
        assert report.summary.unsafe_action_rate == 0.0
        assert report.summary.blocked_action_rate == 0.4
        assert report.summary.low_data_quality_case_rate == 0.5
        assert report.summary.low_data_quality_safe_action_rate == 1.0
        assert report.summary.observed_action_agreement_rate == 0.5
        assert report.summary.mean_reward > 0.0
        assert report.decisions[0].selected_action_id == TrainingAction.RECOMMEND_RF_BIOMECHANICS_RETEST
        assert report.decisions[1].selected_action_id == TrainingAction.REPLACE_WITH_CROSS_TRAINING

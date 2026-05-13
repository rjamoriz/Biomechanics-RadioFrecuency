"""Tests for the constrained training recommendation baseline."""

from __future__ import annotations

from biomech_ml.injury_risk_model import InjuryRiskFactor, InjuryRiskLevel, InjuryRiskOutput
from biomech_ml.recommendation_policy import (
    AthleteTrainingState,
    PainStatus,
    PlannedSessionType,
    RecoveryState,
    SafeRecommendationPolicy,
    TrainingAction,
    TrainingLoadState,
)


def _risk_output(
    *,
    score: float,
    level: InjuryRiskLevel,
    signal_quality_score: float = 0.85,
    model_confidence: float = 0.75,
    risk_factors: list[InjuryRiskFactor] | None = None,
) -> InjuryRiskOutput:
    return InjuryRiskOutput(
        overall_risk_score=score,
        overall_risk_level=level,
        articulation_risks=[],
        risk_factors=risk_factors
        or [
            InjuryRiskFactor(
                factor_id="asymmetry",
                label="Asymmetry",
                value=0.20,
                weight=0.25,
                elevated=False,
                description="Baseline asymmetry context.",
            ),
            InjuryRiskFactor(
                factor_id="fatigue_drift",
                label="Fatigue drift",
                value=0.15,
                weight=0.20,
                elevated=False,
                description="Baseline fatigue context.",
            ),
        ],
        model_confidence=model_confidence,
        signal_quality_score=signal_quality_score,
        validation_status="experimental",
        experimental=True,
    )


class TestSafeRecommendationPolicy:
    def setup_method(self) -> None:
        self.policy = SafeRecommendationPolicy()

    def test_high_pain_and_high_risk_recommend_recovery_and_review(self) -> None:
        risk = _risk_output(score=0.84, level=InjuryRiskLevel.CRITICAL)
        state = AthleteTrainingState(
            planned_session_type=PlannedSessionType.INTERVALS,
            training_load=TrainingLoadState(acute_load=82.0, chronic_load=55.0),
            recovery=RecoveryState(readiness_score=0.35),
            pain_status=PainStatus(pain_score=8.0, pain_location="calf", pain_duration_days=8),
            signal_quality_score=0.82,
            calibrated=True,
        )

        recommendation = self.policy.recommend(risk, state)

        assert recommendation.primary_action.action == TrainingAction.REPLACE_WITH_RECOVERY_DAY
        assert recommendation.validation_status == "experimental"
        assert recommendation.experimental is True
        assert TrainingAction.SUGGEST_CLINICIAN_REVIEW in {
            action.action for action in recommendation.secondary_actions
        }

    def test_elevated_risk_and_high_acwr_reduce_weekly_volume(self) -> None:
        risk = _risk_output(score=0.55, level=InjuryRiskLevel.ELEVATED)
        state = AthleteTrainingState(
            planned_session_type=PlannedSessionType.LONG_RUN,
            training_load=TrainingLoadState(
                weekly_distance_km=86.0,
                acute_load=90.0,
                chronic_load=55.0,
                intensity_share=0.22,
            ),
            recovery=RecoveryState(readiness_score=0.62),
            pain_status=PainStatus(pain_score=2.0),
            signal_quality_score=0.88,
            calibrated=True,
        )

        recommendation = self.policy.recommend(risk, state)

        assert recommendation.primary_action.action == TrainingAction.REDUCE_WEEKLY_VOLUME
        assert any(
            driver.factor_id == "acute_chronic_load_ratio"
            for driver in recommendation.contributing_factors
        )

    def test_low_quality_data_triggers_retest(self) -> None:
        risk = _risk_output(
            score=0.18,
            level=InjuryRiskLevel.LOW,
            signal_quality_score=0.25,
            model_confidence=0.30,
        )
        state = AthleteTrainingState(
            planned_session_type=PlannedSessionType.EASY_AEROBIC,
            training_load=TrainingLoadState(acute_load=42.0, chronic_load=44.0),
            recovery=RecoveryState(readiness_score=0.74),
            pain_status=PainStatus(pain_score=1.0),
            signal_quality_score=0.28,
            calibrated=False,
        )

        recommendation = self.policy.recommend(risk, state)

        assert recommendation.primary_action.action == TrainingAction.RECOMMEND_RF_BIOMECHANICS_RETEST
        assert recommendation.recommendation_confidence < 0.5
        assert any("signal quality" in warning.lower() for warning in recommendation.safety_warnings)

    def test_asymmetry_dominant_case_prefers_mechanics_and_screening(self) -> None:
        risk = _risk_output(
            score=0.30,
            level=InjuryRiskLevel.MODERATE,
            risk_factors=[
                InjuryRiskFactor(
                    factor_id="asymmetry",
                    label="Asymmetry",
                    value=0.72,
                    weight=0.25,
                    elevated=True,
                    description="Step-to-step asymmetry remains elevated.",
                ),
                InjuryRiskFactor(
                    factor_id="fatigue_drift",
                    label="Fatigue drift",
                    value=0.18,
                    weight=0.20,
                    elevated=False,
                    description="Fatigue drift remains controlled.",
                ),
            ],
        )
        state = AthleteTrainingState(
            planned_session_type=PlannedSessionType.EASY_AEROBIC,
            training_load=TrainingLoadState(acute_load=46.0, chronic_load=44.0),
            recovery=RecoveryState(readiness_score=0.71),
            pain_status=PainStatus(pain_score=1.0),
            signal_quality_score=0.92,
            calibrated=True,
        )

        recommendation = self.policy.recommend(risk, state)

        assert recommendation.primary_action.action == TrainingAction.SUGGEST_CADENCE_ADJUSTMENT
        assert TrainingAction.RECOMMEND_JUMP_ASYMMETRY_TEST in {
            action.action for action in recommendation.secondary_actions
        }

    def test_confidence_is_bounded_for_high_quality_inputs(self) -> None:
        risk = _risk_output(score=0.22, level=InjuryRiskLevel.MODERATE)
        state = AthleteTrainingState(
            planned_session_type=PlannedSessionType.EASY_AEROBIC,
            training_load=TrainingLoadState(acute_load=40.0, chronic_load=42.0),
            recovery=RecoveryState(readiness_score=0.86, sleep_duration_h=7.8),
            pain_status=PainStatus(pain_score=0.0),
            signal_quality_score=0.94,
            calibrated=True,
        )

        recommendation = self.policy.recommend(risk, state)

        assert 0.0 <= recommendation.recommendation_confidence <= 0.85

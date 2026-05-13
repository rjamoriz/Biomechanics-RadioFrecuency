"""Tests for shared RL transition schemas."""

from __future__ import annotations

from datetime import datetime, timedelta, timezone

from biomech_ml.injury_risk_model import InjuryRiskFactor, InjuryRiskLevel, InjuryRiskOutput
from biomech_ml.recommendation_policy import (
    MarathonPhase,
    PainStatus,
    PlannedSessionType,
    RecoveryState,
    TrainingAction,
    TrainingLoadState,
)
from biomech_ml.rl import (
    ContextualBanditPolicy,
    DecisionReplayDataset,
    DecisionTransition,
    RecommendationAuditLogger,
    RuleBasedInterventionPolicy,
)
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


class TestDecisionReplayDataset:
    def test_filters_and_sorts_transitions(self) -> None:
        base_time = datetime(2026, 4, 27, 12, 0, tzinfo=timezone.utc)
        early_state = AthleteState(
            athlete_id='athlete-a',
            timestamp=base_time,
            planned_session_type=PlannedSessionType.EASY_AEROBIC,
            marathon_phase=MarathonPhase.BUILD,
            training_load=TrainingLoadState(acute_load=44.0, chronic_load=42.0),
            recovery=RecoveryState(readiness_score=0.62),
            pain_status=PainStatus(pain_score=1.0),
            risk_forecast=_risk_output(0.32, InjuryRiskLevel.MODERATE),
            signal_quality_score=0.9,
            data_quality_score=0.9,
            calibrated=True,
        )
        early_next_state = AthleteState(
            athlete_id='athlete-a',
            timestamp=base_time + timedelta(days=1),
            planned_session_type=PlannedSessionType.EASY_AEROBIC,
            marathon_phase=MarathonPhase.BUILD,
            training_load=TrainingLoadState(acute_load=40.0, chronic_load=42.0),
            recovery=RecoveryState(readiness_score=0.7),
            pain_status=PainStatus(pain_score=0.0),
            risk_forecast=_risk_output(0.20, InjuryRiskLevel.MODERATE),
            signal_quality_score=0.92,
            data_quality_score=0.92,
            calibrated=True,
        )
        late_state = AthleteState(
            athlete_id='athlete-b',
            timestamp=base_time + timedelta(days=2),
            planned_session_type=PlannedSessionType.LONG_RUN,
            marathon_phase=MarathonPhase.BUILD,
            training_load=TrainingLoadState(acute_load=78.0, chronic_load=56.0),
            recovery=RecoveryState(readiness_score=0.48),
            pain_status=PainStatus(pain_score=4.0),
            risk_forecast=_risk_output(0.60, InjuryRiskLevel.HIGH, model_confidence=0.72),
            signal_quality_score=0.4,
            data_quality_score=0.35,
            calibrated=False,
        )
        late_next_state = AthleteState(
            athlete_id='athlete-b',
            timestamp=base_time + timedelta(days=3),
            planned_session_type=PlannedSessionType.CROSS_TRAINING,
            marathon_phase=MarathonPhase.BUILD,
            training_load=TrainingLoadState(acute_load=68.0, chronic_load=56.0),
            recovery=RecoveryState(readiness_score=0.6),
            pain_status=PainStatus(pain_score=2.0),
            risk_forecast=_risk_output(0.38, InjuryRiskLevel.MODERATE),
            signal_quality_score=0.7,
            data_quality_score=0.65,
            calibrated=True,
        )

        early_transition = DecisionTransition(
            previous_state=early_state,
            next_state=early_next_state,
            available_actions=(TrainingAction.CONTINUE_MONITORING,),
            observed_action_id=TrainingAction.CONTINUE_MONITORING,
            sample_id='transition-early',
        )
        late_transition = DecisionTransition(
            previous_state=late_state,
            next_state=late_next_state,
            available_actions=(TrainingAction.REPLACE_WITH_CROSS_TRAINING,),
            observed_action_id=TrainingAction.REPLACE_WITH_CROSS_TRAINING,
            sample_id='transition-late',
        )

        dataset = DecisionReplayDataset([late_transition, early_transition])
        sorted_dataset = dataset.sorted_by_timestamp()
        filtered_dataset = dataset.filter_by_athlete('athlete-a')

        assert dataset.athlete_ids == ('athlete-b', 'athlete-a')
        assert sorted_dataset[0].effective_sample_id == 'transition-early'
        assert filtered_dataset[0].athlete_id == 'athlete-a'
        assert late_transition.low_data_quality_case is True
        assert late_transition.metric_confidence == 0.72
        assert late_transition.risk_delta == 0.22
        assert late_transition.pain_delta == 2.0


class TestSharedTransitionIntegration:
    def test_transition_feeds_audit_logging_and_bandit_updates(self) -> None:
        logger = RecommendationAuditLogger()
        reward_function = ShortHorizonRewardFunction()
        policy = RuleBasedInterventionPolicy()
        bandit = ContextualBanditPolicy()
        base_time = datetime(2026, 4, 27, 15, 0, tzinfo=timezone.utc)
        previous_state = AthleteState(
            athlete_id='athlete-shared',
            timestamp=base_time,
            planned_session_type=PlannedSessionType.LONG_RUN,
            marathon_phase=MarathonPhase.BUILD,
            training_load=TrainingLoadState(acute_load=90.0, chronic_load=55.0),
            recovery=RecoveryState(readiness_score=0.55),
            pain_status=PainStatus(pain_score=2.0),
            risk_forecast=_risk_output(0.55, InjuryRiskLevel.ELEVATED),
            signal_quality_score=0.88,
            data_quality_score=0.88,
            calibrated=True,
        )
        next_state = AthleteState(
            athlete_id='athlete-shared',
            timestamp=base_time + timedelta(days=1),
            planned_session_type=PlannedSessionType.EASY_AEROBIC,
            marathon_phase=MarathonPhase.BUILD,
            training_load=TrainingLoadState(acute_load=72.0, chronic_load=55.0),
            recovery=RecoveryState(readiness_score=0.66),
            pain_status=PainStatus(pain_score=1.0),
            risk_forecast=_risk_output(0.30, InjuryRiskLevel.MODERATE),
            signal_quality_score=0.9,
            data_quality_score=0.9,
            calibrated=True,
        )
        transition = DecisionTransition(
            previous_state=previous_state,
            next_state=next_state,
            available_actions=(
                TrainingAction.REDUCE_WEEKLY_VOLUME,
                TrainingAction.REPLACE_WITH_EASY_AEROBIC_RUN,
            ),
            observed_action_id=TrainingAction.REDUCE_WEEKLY_VOLUME,
            sample_id='shared-transition-1',
            metadata={'source': 'shared_schema_test'},
        )

        recommendation = policy.recommend_action(
            transition.previous_state,
            available_actions=transition.available_actions,
        )
        reward_breakdown = reward_function.compute_breakdown(
            transition.previous_state,
            recommendation.selected_action,
            transition.next_state,
        )
        record = logger.build_record_from_transition(
            transition,
            recommendation,
            reward_breakdown=reward_breakdown,
        )
        stats = bandit.record_transition(
            transition,
            reward_breakdown.total_reward,
        )

        assert record.metadata['sample_id'] == 'shared-transition-1'
        assert record.metadata['transition_source'] == 'experimental'
        assert record.metadata['source'] == 'shared_schema_test'
        assert record.available_action_ids == (
            'reduce_weekly_volume',
            'replace_with_easy_aerobic_run',
        )
        assert record.observed_outcome is not None
        assert record.observed_outcome.risk_delta == transition.risk_delta
        assert stats.observations == 1
        assert bandit.get_action_stats(
            transition.previous_state,
            TrainingAction.REDUCE_WEEKLY_VOLUME,
        ) is not None

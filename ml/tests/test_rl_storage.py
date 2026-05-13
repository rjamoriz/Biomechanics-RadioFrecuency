"""Tests for RL persistence helpers."""

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
    ContextualBanditSnapshotStore,
    DecisionTransition,
    RecommendationAuditLogStore,
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


def _transition(base_time: datetime) -> DecisionTransition:
    previous_state = AthleteState(
        athlete_id='athlete-storage',
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
        athlete_id='athlete-storage',
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
    return DecisionTransition(
        previous_state=previous_state,
        next_state=next_state,
        available_actions=(
            TrainingAction.REDUCE_WEEKLY_VOLUME,
            TrainingAction.REPLACE_WITH_EASY_AEROBIC_RUN,
        ),
        observed_action_id=TrainingAction.REDUCE_WEEKLY_VOLUME,
        sample_id='storage-transition-1',
        metadata={'source': 'storage_test'},
    )


class TestRecommendationAuditLogStore:
    def test_appends_and_reads_payloads(self, tmp_path) -> None:
        transition = _transition(
            datetime(2026, 4, 27, 18, 0, tzinfo=timezone.utc)
        )
        policy = RuleBasedInterventionPolicy()
        logger = RecommendationAuditLogger()
        reward_function = ShortHorizonRewardFunction()
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
        store = RecommendationAuditLogStore(
            tmp_path / 'audit' / 'recommendations.jsonl'
        )

        path = store.append(record, logger)
        payloads = store.read_all()

        assert path.exists()
        assert len(payloads) == 1
        assert payloads[0]['metadata']['sample_id'] == 'storage-transition-1'
        assert payloads[0]['observed_outcome']['risk_delta'] == 0.25
        assert payloads[0]['selected_action_id'] == recommendation.selected_action.action_id.value


class TestContextualBanditSnapshotStore:
    def test_round_trips_bandit_snapshot(self, tmp_path) -> None:
        transition = _transition(
            datetime(2026, 4, 27, 20, 0, tzinfo=timezone.utc)
        )
        policy = ContextualBanditPolicy(
            exploration_weight=0.2,
            min_samples_for_learned_choice=3,
        )
        policy.record_transition(transition, reward=0.45)
        policy.record_transition(transition, reward=0.35)
        store = ContextualBanditSnapshotStore(
            tmp_path / 'bandit' / 'snapshot.json'
        )

        path = store.save(policy)
        loaded_policy = store.load()
        stats = loaded_policy.get_action_stats(
            transition.previous_state,
            TrainingAction.REDUCE_WEEKLY_VOLUME,
        )

        assert path.exists()
        assert loaded_policy.exploration_weight == 0.2
        assert loaded_policy.min_samples_for_learned_choice == 3
        assert stats is not None
        assert stats.observations == 2
        assert stats.mean_reward == 0.4

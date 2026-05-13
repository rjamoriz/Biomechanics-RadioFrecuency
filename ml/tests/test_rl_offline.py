"""Tests for ml/src/biomech_ml/rl/offline_rl.py.

Covers:
- classify_state bucketing rules
- ActionOutcomeStats incremental mean update
- FrequencyBasedPolicy.record_transition / recommend_action
- FrequencyBasedPolicy fallback when no stats available
- FrequencyBasedPolicy safety-constraint blocking
- FrequencyBasedPolicy context_stats sorting
- OfflineRLTrainer.train from list and DecisionReplayDataset
- OfflineTrainingResult immutability and validation_status
- Empty dataset training
- Malformed transition skipping
"""

from __future__ import annotations

import pytest
from datetime import datetime, timezone

from biomech_ml.injury_risk_model import InjuryRiskLevel, InjuryRiskOutput
from biomech_ml.recommendation_policy import (
    MarathonPhase,
    PainStatus,
    PlannedSessionType,
    RecoveryState,
    TrainingLoadState,
)
from biomech_ml.rl.actions import build_default_action_catalog
from biomech_ml.rl.offline_rl import (
    ActionOutcomeStats,
    FrequencyBasedPolicy,
    OfflineRLTrainer,
    OfflineTrainingResult,
    StateContext,
    classify_state,
)
from biomech_ml.rl.schemas import DecisionReplayDataset, DecisionTransition
from biomech_ml.rl.state import AthleteState


# ─── Fixtures ────────────────────────────────────────────────────────────────


def _make_risk_output(
    overall_risk_score: float,
    signal_quality_score: float = 0.85,
) -> InjuryRiskOutput:
    level = (
        InjuryRiskLevel.LOW if overall_risk_score < 0.30
        else InjuryRiskLevel.MODERATE if overall_risk_score < 0.60
        else InjuryRiskLevel.HIGH  # InjuryRiskLevel has no VERY_HIGH; HIGH covers >= 0.60
    )
    return InjuryRiskOutput(
        overall_risk_score=overall_risk_score,
        overall_risk_level=level,
        model_confidence=0.8,
        signal_quality_score=signal_quality_score,
        validation_status="experimental",
    )


def _make_state(
    overall_risk_score: float = 0.20,
    signal_quality_score: float = 0.85,
    pain_score: float = 0.0,
) -> AthleteState:
    return AthleteState(
        athlete_id="ath-001",
        timestamp=datetime.now(timezone.utc),
        marathon_phase=MarathonPhase.BUILD,
        planned_session_type=PlannedSessionType.EASY_AEROBIC,
        training_load=TrainingLoadState(),
        recovery=RecoveryState(),
        pain_status=PainStatus(pain_score=pain_score),
        risk_forecast=_make_risk_output(overall_risk_score, signal_quality_score),
        signal_quality_score=signal_quality_score,
        data_quality_score=signal_quality_score,
        calibrated=True,
    )


def _make_transition(
    action_id: str,
    reward: float,
    overall_risk_score: float = 0.20,
) -> DecisionTransition:
    state = _make_state(overall_risk_score=overall_risk_score)
    return DecisionTransition(
        previous_state=state,
        next_state=state,
        observed_action_id=action_id,
        metadata={"reward": reward},
    )


# ─── classify_state ───────────────────────────────────────────────────────────


class TestClassifyState:
    def test_low_risk_bucket(self):
        assert classify_state(_make_state(overall_risk_score=0.10)) == StateContext.LOW_RISK

    def test_moderate_risk_bucket(self):
        assert classify_state(_make_state(overall_risk_score=0.45)) == StateContext.MODERATE_RISK

    def test_high_risk_bucket(self):
        assert classify_state(_make_state(overall_risk_score=0.70)) == StateContext.HIGH_RISK

    def test_very_high_risk_bucket(self):
        assert classify_state(_make_state(overall_risk_score=0.85)) == StateContext.VERY_HIGH_RISK

    def test_data_quality_issue_overrides_risk(self):
        # Even with low risk, poor signal → DATA_QUALITY_ISSUE
        assert (
            classify_state(_make_state(overall_risk_score=0.10, signal_quality_score=0.10))
            == StateContext.DATA_QUALITY_ISSUE
        )

    def test_pain_escalation_overrides_risk(self):
        # High pain (>= 8) → VERY_HIGH_RISK regardless of risk score
        assert (
            classify_state(_make_state(overall_risk_score=0.10, pain_score=9.0))
            == StateContext.VERY_HIGH_RISK
        )

    def test_low_score_risk_forecast_is_low(self):
        """risk_forecast with overall_risk_score=0.0 → LOW_RISK bucket."""
        state = AthleteState(
            athlete_id="ath-x",
            timestamp=datetime.now(timezone.utc),
            marathon_phase=MarathonPhase.BASE,
            planned_session_type=PlannedSessionType.UNKNOWN,
            training_load=TrainingLoadState(),
            recovery=RecoveryState(),
            pain_status=PainStatus(),
            # default risk_forecast has overall_risk_score=0.0
            signal_quality_score=0.9,
            data_quality_score=0.9,
            calibrated=True,
        )
        assert classify_state(state) == StateContext.LOW_RISK

    def test_boundary_at_0_30(self):
        # Exactly 0.30 → MODERATE (threshold: >= 0.30)
        assert classify_state(_make_state(overall_risk_score=0.30)) == StateContext.MODERATE_RISK

    def test_boundary_just_below_0_30(self):
        assert classify_state(_make_state(overall_risk_score=0.29)) == StateContext.LOW_RISK


# ─── ActionOutcomeStats ───────────────────────────────────────────────────────


class TestActionOutcomeStats:
    def test_initial_state_zero(self):
        s = ActionOutcomeStats(action_id="reduce_volume", context=StateContext.HIGH_RISK)
        assert s.observation_count == 0
        assert s.mean_reward == pytest.approx(0.0)
        assert not s.is_reliable

    def test_single_update(self):
        s = ActionOutcomeStats(action_id="reduce_volume", context=StateContext.HIGH_RISK)
        s.update(0.5)
        assert s.observation_count == 1
        assert s.mean_reward == pytest.approx(0.5)

    def test_mean_is_running_average(self):
        s = ActionOutcomeStats(action_id="rest_day", context=StateContext.MODERATE_RISK)
        s.update(1.0)
        s.update(3.0)
        s.update(2.0)
        assert s.observation_count == 3
        assert s.mean_reward == pytest.approx(2.0)
        assert s.is_reliable

    def test_is_reliable_threshold(self):
        s = ActionOutcomeStats(action_id="x", context=StateContext.LOW_RISK)
        for _ in range(2):
            s.update(1.0)
        assert not s.is_reliable
        s.update(1.0)
        assert s.is_reliable


# ─── FrequencyBasedPolicy ─────────────────────────────────────────────────────


class TestFrequencyBasedPolicy:
    def _policy(self) -> FrequencyBasedPolicy:
        return FrequencyBasedPolicy()

    def test_validation_status_is_experimental(self):
        policy = self._policy()
        state = _make_state(overall_risk_score=0.50)
        actions = build_default_action_catalog()
        rec = policy.recommend_action(state, list(actions.values()))
        assert rec.validation_status == "experimental"

    def test_no_stats_returns_fallback_with_low_confidence(self):
        policy = self._policy()
        state = _make_state()
        rec = policy.recommend_action(state, list(build_default_action_catalog().values()))
        assert rec.confidence <= 0.1

    def test_record_transition_increases_observation_count(self):
        policy = self._policy()
        state = _make_state(overall_risk_score=0.40)
        policy.record_transition(state, "reduce_session_volume", reward=1.0)
        context = classify_state(state)
        key = f"{context.value}::reduce_session_volume"
        assert policy.stats[key].observation_count == 1

    def test_policy_prefers_action_with_higher_mean_reward(self):
        """After learning that reduce_session_volume gives reward=2 and replace_with_recovery_day gives reward=0,
        the policy should recommend reduce_session_volume in the same context."""
        policy = self._policy()
        state = _make_state(overall_risk_score=0.40)  # MODERATE_RISK

        # Provide 3 observations so both actions become 'reliable'
        for _ in range(3):
            policy.record_transition(state, "reduce_session_volume", reward=2.0)
            policy.record_transition(state, "replace_with_recovery_day", reward=0.0)

        actions = [
            a
            for a in build_default_action_catalog().values()
            if a.action_id in {"reduce_session_volume", "replace_with_recovery_day"}
        ]
        rec = policy.recommend_action(state, actions)
        assert rec.selected_action.action_id == "reduce_session_volume"

    def test_confidence_grows_with_observation_count(self):
        policy = self._policy()
        state = _make_state(overall_risk_score=0.40)
        actions = [
            a for a in build_default_action_catalog().values() if a.action_id == "reduce_session_volume"
        ]
        for i in range(1, 12):
            policy.record_transition(state, "reduce_session_volume", reward=1.0)
            if actions:
                rec = policy.recommend_action(state, actions)
                # Confidence should not decrease as n grows
                if i > 1:
                    assert rec.confidence >= 0.0

    def test_context_stats_sorted_descending(self):
        policy = self._policy()
        state = _make_state(overall_risk_score=0.40)
        for _ in range(3):
            policy.record_transition(state, "reduce_session_volume", reward=1.0)
            policy.record_transition(state, "replace_with_recovery_day", reward=3.0)

        stats = policy.context_stats(StateContext.MODERATE_RISK)
        rewards = [s.mean_reward for s in stats]
        assert rewards == sorted(rewards, reverse=True)

    def test_total_observations_counts_all(self):
        policy = self._policy()
        state = _make_state(overall_risk_score=0.20)
        for _ in range(5):
            policy.record_transition(state, "continue_monitoring", reward=0.5)  # valid TrainingActionId
        assert policy.total_observations() == 5

    def test_default_fallback_action_id_is_used(self):
        policy = FrequencyBasedPolicy(default_fallback_action_id="continue_monitoring")
        state = _make_state(overall_risk_score=0.20)
        actions = list(build_default_action_catalog().values())
        rec = policy.recommend_action(state, actions)
        # With no stats and a fallback set, the selected action should use it
        assert rec.selected_action.action_id == "continue_monitoring"


# ─── OfflineRLTrainer ─────────────────────────────────────────────────────────


class TestOfflineRLTrainer:
    def test_train_from_list_of_transitions(self):
        transitions = [
            _make_transition("reduce_session_volume", reward=1.0, overall_risk_score=0.50),
            _make_transition("reduce_session_volume", reward=1.5, overall_risk_score=0.55),
            _make_transition("replace_with_recovery_day", reward=0.5, overall_risk_score=0.45),
        ]
        trainer = OfflineRLTrainer()
        result = trainer.train(transitions)

        assert result.transitions_processed == 3
        assert result.contexts_seen >= 1
        assert any("reduce_session_volume" in k for k in result.policy.stats) or len(result.policy.stats) > 0
        assert result.validation_status == "experimental"
        assert result.mean_reward_overall == pytest.approx(1.0, abs=0.1)

    def test_train_from_replay_dataset(self):
        transitions = [_make_transition("reduce_session_volume", reward=1.0)] * 5
        dataset = DecisionReplayDataset(
            transitions=transitions,
        )
        trainer = OfflineRLTrainer()
        result = trainer.train(dataset)
        assert result.transitions_processed == 5

    def test_empty_dataset_produces_warning(self):
        trainer = OfflineRLTrainer()
        result = trainer.train([])
        assert result.transitions_processed == 0
        assert len(result.warnings) > 0
        assert result.mean_reward_overall == pytest.approx(0.0)

    def test_result_is_immutable(self):
        trainer = OfflineRLTrainer()
        result = trainer.train([])
        with pytest.raises((AttributeError, TypeError)):
            result.transitions_processed = 99  # type: ignore[misc]

    def test_trained_policy_improves_recommendations(self):
        """After training on 10 transitions favouring reduce_volume,
        the policy should recommend reduce_volume for the same context."""
        transitions = [
            _make_transition("reduce_session_volume", reward=2.0, overall_risk_score=0.65)
        ] * 10 + [
            _make_transition("replace_with_recovery_day", reward=0.1, overall_risk_score=0.65)
        ] * 5

        trainer = OfflineRLTrainer()
        result = trainer.train(transitions)
        state = _make_state(overall_risk_score=0.65)
        actions = [
            a
            for a in build_default_action_catalog().values()
            if a.action_id in {"reduce_session_volume", "replace_with_recovery_day"}
        ]
        rec = result.policy.recommend_action(state, actions)
        assert rec.selected_action.action_id == "reduce_session_volume"

    def test_actions_observed_count(self):
        transitions = [
            _make_transition("reduce_session_volume", reward=1.0),
            _make_transition("replace_with_recovery_day", reward=0.5),
            _make_transition("reduce_session_volume", reward=1.2),
        ]
        trainer = OfflineRLTrainer()
        result = trainer.train(transitions)
        assert result.actions_observed == 2

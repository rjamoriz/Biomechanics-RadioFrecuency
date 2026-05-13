"""Tests for the athlete digital-twin simulation environment.

All assertions verify simulation mechanics and safety properties.
Output states carry validation_status='experimental' throughout.
"""

from __future__ import annotations

from datetime import datetime, timezone

import pytest

from biomech_ml.injury_risk_model import InjuryRiskLevel, InjuryRiskOutput
from biomech_ml.recommendation_policy import (
    PainStatus,
    RecoveryState,
    TrainingAction,
    TrainingLoadState,
)
from biomech_ml.rl.actions import build_default_action_catalog
from biomech_ml.rl.contextual_bandit import ContextualBanditPolicy
from biomech_ml.rl.digital_twin_env import (
    AthleteAdaptationModel,
    AthleteSimEnvironment,
    SimStepResult,
)
from biomech_ml.rl.policy import RuleBasedInterventionPolicy
from biomech_ml.rl.state import AthleteState

# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


def _make_moderate_risk_state(athlete_id: str = "test_athlete") -> AthleteState:
    """Build a moderate-risk athlete state for test scenarios."""
    return AthleteState(
        athlete_id=athlete_id,
        timestamp=datetime(2024, 3, 1, tzinfo=timezone.utc),
        training_load=TrainingLoadState(
            acute_load=0.7,
            chronic_load=0.5,
            weekly_distance_km=55.0,
        ),
        recovery=RecoveryState(
            readiness_score=0.55,
            perceived_fatigue_score=0.55,
            soreness_score=0.4,
        ),
        pain_status=PainStatus(pain_score=2.0),
        risk_forecast=InjuryRiskOutput(
            overall_risk_score=0.55,
            overall_risk_level=InjuryRiskLevel.MODERATE,
            model_confidence=0.72,
            signal_quality_score=0.80,
        ),
    )


def _make_low_risk_state(athlete_id: str = "test_athlete") -> AthleteState:
    return AthleteState(
        athlete_id=athlete_id,
        timestamp=datetime(2024, 3, 1, tzinfo=timezone.utc),
        training_load=TrainingLoadState(
            acute_load=0.4,
            chronic_load=0.5,
            weekly_distance_km=35.0,
        ),
        recovery=RecoveryState(readiness_score=0.8, perceived_fatigue_score=0.2),
        pain_status=PainStatus(pain_score=0.0),
        risk_forecast=InjuryRiskOutput(
            overall_risk_score=0.15,
            overall_risk_level=InjuryRiskLevel.LOW,
            model_confidence=0.85,
            signal_quality_score=0.90,
        ),
    )


# ---------------------------------------------------------------------------
# AthleteAdaptationModel
# ---------------------------------------------------------------------------


class TestAthleteAdaptationModel:
    def test_predicts_state_with_same_athlete_id(self) -> None:
        model = AthleteAdaptationModel()
        state = _make_moderate_risk_state()
        catalog = build_default_action_catalog()
        action = catalog[TrainingAction.REPLACE_WITH_EASY_AEROBIC_RUN]

        next_state = model.predict_next_state(state, action)

        assert next_state.athlete_id == state.athlete_id

    def test_timestamp_advances_by_step_days(self) -> None:
        model = AthleteAdaptationModel()
        state = _make_moderate_risk_state()
        catalog = build_default_action_catalog()
        action = catalog[TrainingAction.CONTINUE_MONITORING]

        next_state = model.predict_next_state(state, action, step_days=3)

        delta = next_state.timestamp - state.timestamp
        assert delta.days == 3

    def test_recovery_day_reduces_acute_load(self) -> None:
        model = AthleteAdaptationModel()
        state = _make_moderate_risk_state()
        catalog = build_default_action_catalog()
        action = catalog[TrainingAction.REPLACE_WITH_RECOVERY_DAY]

        next_state = model.predict_next_state(state, action, noise_level=0.0)

        assert next_state.training_load.acute_load < state.training_load.acute_load

    def test_high_stimulus_increases_fatigue(self) -> None:
        model = AthleteAdaptationModel()
        state = _make_low_risk_state()
        catalog = build_default_action_catalog()
        action = catalog[TrainingAction.CONTINUE_MONITORING]  # stimulus=1.0

        next_state = model.predict_next_state(state, action, noise_level=0.0)

        prev_fatigue = state.recovery.perceived_fatigue_score or 0.0
        new_fatigue = next_state.recovery.perceived_fatigue_score or 0.0
        assert new_fatigue >= prev_fatigue

    def test_reduced_load_improves_readiness(self) -> None:
        model = AthleteAdaptationModel()
        state = _make_moderate_risk_state()
        catalog = build_default_action_catalog()
        action = catalog[TrainingAction.REPLACE_WITH_RECOVERY_DAY]  # stimulus=0.0

        next_state = model.predict_next_state(state, action, noise_level=0.0)

        prev = state.recovery.readiness_score or 0.0
        nxt = next_state.recovery.readiness_score or 0.0
        assert nxt > prev

    def test_overloaded_acwr_increases_risk_score(self) -> None:
        """When acute load exceeds chronic load, risk should trend upward."""
        model = AthleteAdaptationModel()
        # acwr = 0.7 / 0.4 = 1.75 — strong overload
        state = AthleteState(
            athlete_id="overload",
            training_load=TrainingLoadState(acute_load=0.7, chronic_load=0.4),
            risk_forecast=InjuryRiskOutput(
                overall_risk_score=0.40,
                overall_risk_level=InjuryRiskLevel.MODERATE,
            ),
        )
        catalog = build_default_action_catalog()
        action = catalog[TrainingAction.CONTINUE_MONITORING]

        next_state = model.predict_next_state(state, action, noise_level=0.0)

        assert next_state.risk_forecast.overall_risk_score > state.risk_forecast.overall_risk_score

    def test_low_load_decreases_risk_score(self) -> None:
        """When acute load is well below chronic, risk should trend downward."""
        model = AthleteAdaptationModel()
        # acwr = 0.2 / 0.5 = 0.4 — underload
        state = AthleteState(
            athlete_id="underload",
            training_load=TrainingLoadState(acute_load=0.2, chronic_load=0.5),
            risk_forecast=InjuryRiskOutput(
                overall_risk_score=0.50,
                overall_risk_level=InjuryRiskLevel.MODERATE,
            ),
        )
        catalog = build_default_action_catalog()
        action = catalog[TrainingAction.REPLACE_WITH_RECOVERY_DAY]

        next_state = model.predict_next_state(state, action, noise_level=0.0)

        assert next_state.risk_forecast.overall_risk_score < state.risk_forecast.overall_risk_score

    def test_output_is_always_experimental(self) -> None:
        model = AthleteAdaptationModel()
        state = _make_moderate_risk_state()
        catalog = build_default_action_catalog()
        action = catalog[TrainingAction.REDUCE_INTENSITY]

        next_state = model.predict_next_state(state, action)

        assert next_state.risk_forecast.experimental is True
        assert next_state.risk_forecast.validation_status == "experimental"

    def test_deterministic_without_noise(self) -> None:
        model = AthleteAdaptationModel()
        state = _make_moderate_risk_state()
        catalog = build_default_action_catalog()
        action = catalog[TrainingAction.REPLACE_WITH_FLAT_AEROBIC_RUN]

        result_a = model.predict_next_state(state, action, noise_level=0.0)
        result_b = model.predict_next_state(state, action, noise_level=0.0)

        assert result_a.risk_forecast.overall_risk_score == result_b.risk_forecast.overall_risk_score
        assert result_a.training_load.acute_load == result_b.training_load.acute_load


# ---------------------------------------------------------------------------
# AthleteSimEnvironment — basic interface
# ---------------------------------------------------------------------------


class TestAthleteSimEnvironment:
    def test_reset_returns_initial_state(self) -> None:
        initial = _make_low_risk_state()
        env = AthleteSimEnvironment(initial_state=initial, seed=0)

        returned = env.reset()

        assert returned.athlete_id == initial.athlete_id
        assert env.step_count == 0

    def test_reset_with_override_state(self) -> None:
        env = AthleteSimEnvironment(seed=0)
        override = _make_moderate_risk_state("override_athlete")

        returned = env.reset(override)

        assert returned.athlete_id == "override_athlete"

    def test_step_returns_sim_step_result(self) -> None:
        env = AthleteSimEnvironment(initial_state=_make_low_risk_state(), seed=0)
        env.reset()

        result = env.step(TrainingAction.CONTINUE_MONITORING)

        assert isinstance(result, SimStepResult)
        assert result.step == 1
        assert result.action_id == TrainingAction.CONTINUE_MONITORING

    def test_step_increments_step_count(self) -> None:
        env = AthleteSimEnvironment(seed=0)
        env.reset()

        env.step(TrainingAction.REDUCE_INTENSITY)
        env.step(TrainingAction.REPLACE_WITH_EASY_AEROBIC_RUN)

        assert env.step_count == 2

    def test_done_at_max_steps(self) -> None:
        env = AthleteSimEnvironment(max_steps=3, seed=0)
        env.reset()

        results = []
        for _ in range(3):
            results.append(env.step(TrainingAction.CONTINUE_MONITORING))

        assert results[-1].done is True
        assert results[0].done is False

    def test_step_advances_timestamp(self) -> None:
        initial = _make_low_risk_state()
        env = AthleteSimEnvironment(initial_state=initial, noise_level=0.0, seed=0)
        env.reset()

        result = env.step(TrainingAction.REDUCE_SESSION_VOLUME)

        delta = result.next_state.timestamp - initial.timestamp
        assert delta.days == 1

    def test_unknown_action_raises_value_error(self) -> None:
        env = AthleteSimEnvironment(seed=0)
        env.reset()

        # Create a fake action not in catalog by casting int
        with pytest.raises(ValueError, match="Unknown action_id"):
            env.step("NOT_A_REAL_ACTION")  # type: ignore[arg-type]

    def test_current_state_reflects_last_step(self) -> None:
        env = AthleteSimEnvironment(initial_state=_make_low_risk_state(), seed=0)
        env.reset()

        result = env.step(TrainingAction.REPLACE_WITH_CROSS_TRAINING)

        assert env.current_state is result.next_state

    def test_validation_status_is_experimental(self) -> None:
        env = AthleteSimEnvironment(seed=0)
        env.reset()
        result = env.step(TrainingAction.CONTINUE_MONITORING)

        assert result.validation_status == "experimental"
        assert AthleteSimEnvironment.validation_status == "experimental"

    def test_available_action_ids_is_nonempty(self) -> None:
        env = AthleteSimEnvironment(seed=0)
        assert len(env.available_action_ids) > 0
        assert TrainingAction.CONTINUE_MONITORING in env.available_action_ids

    def test_reward_is_finite_float(self) -> None:
        env = AthleteSimEnvironment(initial_state=_make_moderate_risk_state(), seed=0)
        env.reset()

        result = env.step(TrainingAction.REPLACE_WITH_EASY_AEROBIC_RUN)

        assert isinstance(result.reward, float)
        assert not (result.reward != result.reward)  # not NaN


# ---------------------------------------------------------------------------
# AthleteSimEnvironment — rollout
# ---------------------------------------------------------------------------


class TestAthleteSimEnvironmentRollout:
    def test_rollout_produces_max_steps_results(self) -> None:
        max_steps = 5
        env = AthleteSimEnvironment(
            initial_state=_make_low_risk_state(),
            max_steps=max_steps,
            noise_level=0.0,
            seed=42,
        )
        policy = RuleBasedInterventionPolicy()

        results = env.rollout(policy)

        assert len(results) == max_steps
        assert results[-1].done is True

    def test_rollout_states_chain_correctly(self) -> None:
        env = AthleteSimEnvironment(
            initial_state=_make_low_risk_state(),
            max_steps=4,
            noise_level=0.0,
            seed=0,
        )
        policy = RuleBasedInterventionPolicy()

        results = env.rollout(policy)

        for i in range(1, len(results)):
            assert results[i].previous_state is results[i - 1].next_state

    def test_rollout_with_contextual_bandit_policy(self) -> None:
        env = AthleteSimEnvironment(
            initial_state=_make_moderate_risk_state(),
            max_steps=3,
            noise_level=0.0,
            seed=7,
        )
        policy = ContextualBanditPolicy()

        results = env.rollout(policy)

        assert len(results) == 3
        assert all(r.validation_status == "experimental" for r in results)

    def test_rollout_reset_is_independent(self) -> None:
        """Two rollouts from the same initial state with same seed produce same trajectory."""
        initial = _make_low_risk_state("rollout_athlete")
        env = AthleteSimEnvironment(
            initial_state=initial,
            max_steps=4,
            noise_level=0.0,
            seed=99,
        )
        policy = RuleBasedInterventionPolicy()

        results_a = env.rollout(policy)
        results_b = env.rollout(policy)

        risk_a = [r.next_state.risk_forecast.overall_risk_score for r in results_a]
        risk_b = [r.next_state.risk_forecast.overall_risk_score for r in results_b]
        assert risk_a == risk_b

    def test_conservative_policy_does_not_escalate_high_risk(self) -> None:
        """Under a high-risk state, the rule-based policy should not keep applying full stimulus."""
        high_risk = AthleteState(
            athlete_id="high_risk_athlete",
            training_load=TrainingLoadState(acute_load=0.9, chronic_load=0.4, weekly_distance_km=75.0),
            recovery=RecoveryState(readiness_score=0.3, perceived_fatigue_score=0.8),
            pain_status=PainStatus(pain_score=6.0),
            risk_forecast=InjuryRiskOutput(
                overall_risk_score=0.82,
                overall_risk_level=InjuryRiskLevel.HIGH,
                model_confidence=0.75,
                signal_quality_score=0.78,
            ),
        )
        env = AthleteSimEnvironment(
            initial_state=high_risk,
            max_steps=7,
            noise_level=0.0,
            seed=1,
        )
        policy = RuleBasedInterventionPolicy()

        results = env.rollout(policy)

        final_risk = results[-1].next_state.risk_forecast.overall_risk_score
        initial_risk = high_risk.risk_forecast.overall_risk_score

        # Conservative policy should avoid full-stimulus actions, so risk should not
        # continuously escalate — accept either improvement or no worse than initial
        assert final_risk <= initial_risk + 0.15, (
            f"Risk escalated too much under conservative policy: "
            f"{initial_risk:.3f} → {final_risk:.3f}"
        )

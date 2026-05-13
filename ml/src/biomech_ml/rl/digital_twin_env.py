"""Simplified athlete digital-twin simulation environment for offline RL development.

This environment provides a Gym-style interface for testing and developing RL
policies without requiring live athlete data.

IMPORTANT: This module uses a simplified parameterized adaptation model.
It is a research scaffold — NOT a validated clinical, biomechanical, or
physiological model. All outputs carry validation_status='experimental'.

Do NOT use outputs for medical decisions, clinical applications, or injury
prediction outside a validated research context.
"""

from __future__ import annotations

import random
from dataclasses import dataclass, field, replace
from datetime import datetime, timedelta, timezone
from typing import Any

from ..injury_risk_model import InjuryRiskLevel, InjuryRiskOutput
from ..recommendation_policy import (
    MarathonPhase,
    PainStatus,
    RecoveryState,
    TrainingAction as TrainingActionId,
    TrainingLoadState,
)
from .actions import TrainingActionDefinition, build_default_action_catalog
from .policy import InterventionPolicy
from .rewards import RewardBreakdown, RewardFunction, ShortHorizonRewardFunction
from .state import AthleteState

# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------

_RISK_LEVEL_THRESHOLDS: list[tuple[float, InjuryRiskLevel]] = [
    (0.30, InjuryRiskLevel.LOW),
    (0.60, InjuryRiskLevel.MODERATE),
    (0.80, InjuryRiskLevel.HIGH),
    (1.01, InjuryRiskLevel.CRITICAL),
]


def _risk_level(score: float) -> InjuryRiskLevel:
    for threshold, level in _RISK_LEVEL_THRESHOLDS:
        if score < threshold:
            return level
    return InjuryRiskLevel.CRITICAL


def _clamp(value: float, lo: float = 0.0, hi: float = 1.0) -> float:
    return max(lo, min(hi, value))


# ---------------------------------------------------------------------------
# Simulation result
# ---------------------------------------------------------------------------


@dataclass(frozen=True)
class SimStepResult:
    """Result of one simulation step.

    validation_status is always 'experimental'.
    This is a synthetic trajectory from a simplified model, not a validated
    clinical prediction.
    """

    previous_state: AthleteState
    next_state: AthleteState
    action_id: TrainingActionId
    reward: float
    reward_breakdown: RewardBreakdown
    done: bool
    step: int
    info: dict[str, Any] = field(default_factory=dict)
    validation_status: str = "experimental"


# ---------------------------------------------------------------------------
# Adaptation model
# ---------------------------------------------------------------------------


class AthleteAdaptationModel:
    """Parameterized model of athlete adaptation to training load.

    Models three coupled dynamics:
    - Training load (acute/chronic ratio and weekly volume)
    - Injury-risk score (driven by load imbalance)
    - Recovery and pain state (respond to stimulus and risk level)

    IMPORTANT: This is a research scaffold with simplified dynamics.
    It is NOT a validated physiological or biomechanical model.
    All predicted states carry validation_status='experimental'.
    """

    def __init__(
        self,
        *,
        risk_sensitivity: float = 0.12,
        recovery_gain_rate: float = 0.08,
        pain_decay_rate: float = 0.12,
        pain_escalation_rate: float = 0.18,
        chronic_load_alpha: float = 0.10,
    ) -> None:
        """
        Parameters
        ----------
        risk_sensitivity:
            How strongly acute:chronic imbalance translates to risk change.
        recovery_gain_rate:
            How much readiness/recovery improves per reduced-load step.
        pain_decay_rate:
            Natural pain reduction rate per step under low-load conditions.
        pain_escalation_rate:
            Pain increase rate when risk is high and load continues.
        chronic_load_alpha:
            Exponential smoothing factor for chronic load adaptation (per step).
        """
        self.risk_sensitivity = risk_sensitivity
        self.recovery_gain_rate = recovery_gain_rate
        self.pain_decay_rate = pain_decay_rate
        self.pain_escalation_rate = pain_escalation_rate
        self.chronic_load_alpha = chronic_load_alpha

    def predict_next_state(
        self,
        current_state: AthleteState,
        action: TrainingActionDefinition,
        *,
        step_days: int = 1,
        noise_level: float = 0.0,
        rng: random.Random | None = None,
    ) -> AthleteState:
        """Predict next athlete state given the chosen action.

        Returns an experimental synthetic state — NOT a validated prediction.

        Parameters
        ----------
        current_state:
            The athlete's current state.
        action:
            The training action applied during this step.
        step_days:
            Simulation step size in days (default 1).
        noise_level:
            Gaussian noise multiplier added to transitions (0.0 = deterministic).
        rng:
            Optional seeded Random instance for reproducibility.
        """
        rng = rng or random.Random()

        def _noise(scale: float) -> float:
            return rng.gauss(0.0, scale) * noise_level if noise_level > 0.0 else 0.0

        stimulus = action.expected_training_stimulus  # [0.0, 1.0]

        # ----------------------------------------------------------------
        # Training load update
        # ----------------------------------------------------------------
        prev_load = current_state.training_load

        prev_acute = prev_load.acute_load if prev_load.acute_load is not None else 0.5
        prev_chronic = prev_load.chronic_load if prev_load.chronic_load is not None else 0.5
        prev_weekly = prev_load.weekly_distance_km if prev_load.weekly_distance_km is not None else 40.0

        # Acute load reflects the current session stimulus
        new_acute = _clamp(prev_acute * stimulus + _noise(0.04))

        # Chronic load adapts slowly via exponential smoothing
        alpha = self.chronic_load_alpha * step_days
        new_chronic = _clamp(prev_chronic * (1.0 - alpha) + new_acute * alpha + _noise(0.02))
        new_chronic = max(new_chronic, 0.01)  # avoid division by zero

        new_weekly = max(0.0, prev_weekly * stimulus + _noise(2.0))

        new_load = TrainingLoadState(
            acute_load=round(new_acute, 4),
            chronic_load=round(new_chronic, 4),
            weekly_distance_km=round(new_weekly, 2),
            intensity_share=prev_load.intensity_share,
            hill_exposure_share=prev_load.hill_exposure_share,
            speed_work_sessions=prev_load.speed_work_sessions,
        )

        # ----------------------------------------------------------------
        # Injury-risk score update
        # ----------------------------------------------------------------
        acwr = new_acute / new_chronic
        prev_risk = current_state.risk_forecast.overall_risk_score

        # Risk increases when acwr is high (overload); decreases when acwr is low
        acwr_pressure = (acwr - 1.0) * self.risk_sensitivity * step_days
        new_risk_score = _clamp(prev_risk + acwr_pressure + _noise(0.02))
        new_risk_level = _risk_level(new_risk_score)

        new_risk_forecast = InjuryRiskOutput(
            overall_risk_score=round(new_risk_score, 4),
            overall_risk_level=new_risk_level,
            model_confidence=current_state.risk_forecast.model_confidence,
            signal_quality_score=current_state.risk_forecast.signal_quality_score,
            experimental=True,
            validation_status="experimental",
        )

        # ----------------------------------------------------------------
        # Recovery update
        # ----------------------------------------------------------------
        prev_recovery = current_state.recovery

        prev_readiness = prev_recovery.readiness_score if prev_recovery.readiness_score is not None else 0.6
        prev_fatigue = prev_recovery.perceived_fatigue_score if prev_recovery.perceived_fatigue_score is not None else 0.4
        prev_soreness = prev_recovery.soreness_score if prev_recovery.soreness_score is not None else 0.3

        recovery_gain = (1.0 - stimulus) * self.recovery_gain_rate * step_days
        new_readiness = _clamp(prev_readiness + recovery_gain + _noise(0.03))
        new_fatigue = _clamp(prev_fatigue - recovery_gain * 0.5 + stimulus * 0.1 + _noise(0.02))
        new_soreness = _clamp(prev_soreness - recovery_gain * 0.3 + stimulus * 0.15 + _noise(0.02))

        new_recovery = RecoveryState(
            readiness_score=round(new_readiness, 4),
            perceived_fatigue_score=round(new_fatigue, 4),
            soreness_score=round(new_soreness, 4),
            sleep_quality_score=prev_recovery.sleep_quality_score,
            sleep_duration_h=prev_recovery.sleep_duration_h,
        )

        # ----------------------------------------------------------------
        # Pain status update
        # ----------------------------------------------------------------
        prev_pain = current_state.pain_status
        prev_pain_score = prev_pain.pain_score

        overload_factor = stimulus * (1.0 + new_risk_score)
        if overload_factor > 1.1 or new_risk_score > 0.6:
            pain_change = self.pain_escalation_rate * max(0.0, overload_factor - 1.0) * step_days
            new_pain_score = _clamp(prev_pain_score + pain_change + _noise(0.05), 0.0, 10.0)
        else:
            new_pain_score = _clamp(prev_pain_score * (1.0 - self.pain_decay_rate * step_days) + _noise(0.03), 0.0, 10.0)

        new_pain = PainStatus(
            pain_score=round(new_pain_score, 4),
            pain_location=prev_pain.pain_location,
            pain_duration_days=(
                (prev_pain.pain_duration_days or 0) + step_days
                if new_pain_score > 1.0
                else None
            ),
            modified_training=prev_pain.modified_training,
        )

        # ----------------------------------------------------------------
        # Assemble next state
        # ----------------------------------------------------------------
        next_timestamp = current_state.timestamp + timedelta(days=step_days)

        return replace(
            current_state,
            timestamp=next_timestamp,
            training_load=new_load,
            recovery=new_recovery,
            pain_status=new_pain,
            risk_forecast=new_risk_forecast,
        )


# ---------------------------------------------------------------------------
# Simulation environment
# ---------------------------------------------------------------------------


class AthleteSimEnvironment:
    """Gym-style simulation environment for offline RL policy development.

    Wraps an ``AthleteAdaptationModel`` with a standard reset/step interface.
    Intended for testing policies, generating synthetic trajectories, and
    offline RL development.

    Episodes consist of at most ``max_steps`` training decisions. Each call
    to :meth:`step` advances the simulation by one day.

    Typical usage::

        env = AthleteSimEnvironment(initial_state=some_athlete_state, seed=42)
        state = env.reset()
        while True:
            action_id = policy.recommend_action(state).selected_action.action_id
            result = env.step(action_id)
            state = result.next_state
            if result.done:
                break

    IMPORTANT: This is a research scaffold. Outputs are experimental.
    validation_status = 'experimental'. Do NOT use for medical decisions.
    """

    validation_status: str = "experimental"

    def __init__(
        self,
        *,
        initial_state: AthleteState | None = None,
        adaptation_model: AthleteAdaptationModel | None = None,
        reward_function: RewardFunction | None = None,
        action_catalog: dict[TrainingActionId, TrainingActionDefinition] | None = None,
        max_steps: int = 28,
        noise_level: float = 0.05,
        seed: int | None = None,
    ) -> None:
        self._default_initial_state = initial_state or AthleteState(
            athlete_id="sim_athlete_default",
            timestamp=datetime(2024, 1, 1, tzinfo=timezone.utc),
            training_load=TrainingLoadState(acute_load=0.5, chronic_load=0.5, weekly_distance_km=40.0),
            recovery=RecoveryState(readiness_score=0.7, perceived_fatigue_score=0.3),
        )
        self.adaptation_model = adaptation_model or AthleteAdaptationModel()
        self.reward_function = reward_function or ShortHorizonRewardFunction()
        self.action_catalog = action_catalog or build_default_action_catalog()
        self.max_steps = max_steps
        self.noise_level = noise_level
        self._rng = random.Random(seed)

        self._current_state: AthleteState = self._default_initial_state
        self._step_count: int = 0

    # ------------------------------------------------------------------
    # Properties
    # ------------------------------------------------------------------

    @property
    def current_state(self) -> AthleteState:
        """Current athlete state in the simulation."""
        return self._current_state

    @property
    def step_count(self) -> int:
        """Number of steps taken since last reset."""
        return self._step_count

    @property
    def available_action_ids(self) -> list[TrainingActionId]:
        """Action IDs available in this environment."""
        return list(self.action_catalog.keys())

    # ------------------------------------------------------------------
    # Core interface
    # ------------------------------------------------------------------

    def reset(self, initial_state: AthleteState | None = None) -> AthleteState:
        """Reset the environment and return the initial state.

        Parameters
        ----------
        initial_state:
            Optional override for the initial athlete state.
            If omitted, uses the state passed at construction time.
        """
        self._current_state = initial_state if initial_state is not None else self._default_initial_state
        self._step_count = 0
        return self._current_state

    def step(self, action_id: TrainingActionId) -> SimStepResult:
        """Apply action to current state and advance by one simulation step.

        Parameters
        ----------
        action_id:
            The training action to apply. Must be in :attr:`action_catalog`.

        Returns
        -------
        SimStepResult
            Contains previous and next state, reward, and done flag.
            ``done`` is True when ``step_count >= max_steps``.

        Raises
        ------
        ValueError
            If ``action_id`` is not in ``action_catalog``.
        """
        if action_id not in self.action_catalog:
            raise ValueError(
                f"Unknown action_id: {action_id!r}. "
                f"Available: {list(self.action_catalog)}"
            )

        action_def = self.action_catalog[action_id]
        previous_state = self._current_state

        next_state = self.adaptation_model.predict_next_state(
            previous_state,
            action_def,
            noise_level=self.noise_level,
            rng=self._rng,
        )

        reward_breakdown = self.reward_function.compute_breakdown(
            previous_state, action_def, next_state
        )

        self._step_count += 1
        done = self._step_count >= self.max_steps
        self._current_state = next_state

        return SimStepResult(
            previous_state=previous_state,
            next_state=next_state,
            action_id=action_id,
            reward=reward_breakdown.total_reward,
            reward_breakdown=reward_breakdown,
            done=done,
            step=self._step_count,
            info={
                "noise_level": self.noise_level,
                "max_steps": self.max_steps,
            },
        )

    def rollout(
        self,
        policy: InterventionPolicy,
        *,
        initial_state: AthleteState | None = None,
        available_actions: list[TrainingActionId] | None = None,
    ) -> list[SimStepResult]:
        """Run a complete episode with ``policy`` and return all step results.

        Resets the environment first using ``initial_state`` (or the default).
        Runs until ``done`` is True.

        Parameters
        ----------
        policy:
            Policy to use for action selection at each step.
        initial_state:
            Optional initial state override.
        available_actions:
            Optional subset of action IDs to pass to the policy.

        Returns
        -------
        list[SimStepResult]
            All step results in episode order.
        """
        state = self.reset(initial_state)
        results: list[SimStepResult] = []

        while True:
            recommendation = policy.recommend_action(state, available_actions)
            result = self.step(recommendation.selected_action.action_id)
            results.append(result)
            state = result.next_state
            if result.done:
                break

        return results

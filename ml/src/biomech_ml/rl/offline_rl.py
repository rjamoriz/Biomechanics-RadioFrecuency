"""Offline reinforcement-learning utilities for the athlete decision-support layer.

This module provides:
- ``StateContext``: a lightweight enum-based bucketing of an AthleteState into a
  coarse context category (LOW_RISK, MODERATE_RISK, HIGH_RISK, VERY_HIGH_RISK,
  DATA_QUALITY_ISSUE).  Used as the "state key" in the tabular policy.
- ``ActionOutcomeStats``: per-action statistics accumulated from observed
  ``DecisionTransition`` objects.
- ``FrequencyBasedPolicy``: a tabular offline policy that learns from historical
  transitions via a simple weighted-average reward model.  It recommends the
  action with the best mean observed reward for the current state context.
- ``OfflineRLTrainer``: processes a ``DecisionReplayDataset`` (or a plain list of
  ``DecisionTransition`` objects) to produce a trained ``FrequencyBasedPolicy``.
- ``OfflineTrainingResult``: immutable summary of a completed training run.

All outputs carry ``validation_status = 'experimental'``.  This module is
intentionally a *baseline* and is not suitable for autonomous clinical decision
making.  Coach / clinician override must always remain possible.

Offline RL progression path:
  1. Rule-based safety policy            ← already in constraints.py
  2. FrequencyBasedPolicy (this file)    ← tabular offline RL
  3. Contextual bandit                   ← contextual_bandit.py
  4. Full offline RL / behavioral cloning ← future work
"""

from __future__ import annotations

from collections import defaultdict
from dataclasses import dataclass, field
from enum import Enum
from typing import Dict, Iterable, List, Optional, Sequence, Union

from ..injury_risk_model import InjuryRiskLevel
from .actions import TrainingActionDefinition, build_default_action_catalog
from .constraints import BlockedAction, ConstraintEngine, SafetyConstraint, default_safety_constraints
from .policy import InterventionPolicy, PolicyRecommendation
from .schemas import DecisionReplayDataset, DecisionTransition
from .state import AthleteState


# ─── State Bucketing ─────────────────────────────────────────────────────────


class StateContext(str, Enum):
    """Coarse context bucket derived from an AthleteState.

    This simplification makes a tabular policy tractable even with very sparse
    historical data.  A future implementation may replace this with continuous
    feature embeddings.
    """

    LOW_RISK = "low_risk"
    MODERATE_RISK = "moderate_risk"
    HIGH_RISK = "high_risk"
    VERY_HIGH_RISK = "very_high_risk"
    DATA_QUALITY_ISSUE = "data_quality_issue"


def classify_state(state: AthleteState) -> StateContext:
    """Map an AthleteState to a coarse StateContext bucket.

    Priority order:
    1. Data quality issue (signal too poor to make confident recommendations).
    2. Pain escalation indicator (overrides risk score).
    3. Risk-score bucket.
    """
    # Data quality gate — use the pre-computed effective_data_quality property
    if state.effective_data_quality < 0.3:
        return StateContext.DATA_QUALITY_ISSUE

    # Pain escalation indicator
    pain_score = state.pain_status.pain_score
    if pain_score >= 8.0:
        return StateContext.VERY_HIGH_RISK

    # Risk-score bucketing via the InjuryRiskOutput object
    risk_score = state.risk_forecast.overall_risk_score
    if risk_score >= 0.80:
        return StateContext.VERY_HIGH_RISK
    if risk_score >= 0.60:
        return StateContext.HIGH_RISK
    if risk_score >= 0.30:
        return StateContext.MODERATE_RISK
    return StateContext.LOW_RISK


# ─── Action-Outcome Statistics ────────────────────────────────────────────────


@dataclass
class ActionOutcomeStats:
    """Running statistics for a single (context, action_id) pair.

    Uses an online mean update so observations can be incorporated
    incrementally without storing the full transition history.
    """

    action_id: str
    context: StateContext
    observation_count: int = 0
    mean_reward: float = 0.0
    blocked_count: int = 0  # times safety layer blocked this action

    def update(self, reward: float) -> None:
        """Incremental mean update (Welford-style, no variance)."""
        self.observation_count += 1
        delta = reward - self.mean_reward
        self.mean_reward += delta / self.observation_count

    @property
    def is_reliable(self) -> bool:
        """True when we have enough observations to trust the mean reward."""
        return self.observation_count >= 3


# ─── Offline Policy ───────────────────────────────────────────────────────────


@dataclass
class FrequencyBasedPolicy(InterventionPolicy):
    """Tabular offline policy trained from historical DecisionTransitions.

    For each (StateContext, action_id) pair, the policy maintains a running
    mean reward.  At inference time it recommends the action with the highest
    mean reward for the current context, subject to safety constraints.

    If no reliable statistics exist for the current context, the policy falls
    back to the ``default_fallback`` action or, when no fallback is set, to
    the action with the most observations (even if unreliable).

    Args:
        action_catalog: available actions.
        safety_constraints: constraints applied before recommending.
        stats: pre-populated stats table (used when restoring from storage).
        default_fallback_action_id: action_id to recommend when the stats
            table has no entry for the current context.
        validation_status: always ``'experimental'``.
    """

    action_catalog: List[TrainingActionDefinition] = field(
        default_factory=build_default_action_catalog
    )
    safety_constraints: List[SafetyConstraint] = field(
        default_factory=default_safety_constraints
    )
    # (context, action_id) → stats
    stats: Dict[str, ActionOutcomeStats] = field(default_factory=dict)
    default_fallback_action_id: Optional[str] = None
    validation_status: str = "experimental"

    def _stats_key(self, context: StateContext, action_id: str) -> str:
        return f"{context.value}::{action_id}"

    def _get_or_create(self, context: StateContext, action_id: str) -> ActionOutcomeStats:
        key = self._stats_key(context, action_id)
        if key not in self.stats:
            self.stats[key] = ActionOutcomeStats(
                action_id=action_id, context=context
            )
        return self.stats[key]

    def record_transition(
        self,
        state: AthleteState,
        action_id: str,
        reward: float,
        *,
        was_blocked: bool = False,
    ) -> None:
        """Incorporate a new observed transition into the stats table.

        Args:
            state: the athlete state at decision time.
            action_id: the action that was taken.
            reward: the scalar reward observed afterward.
            was_blocked: whether the safety layer blocked this action.
        """
        context = classify_state(state)
        entry = self._get_or_create(context, action_id)
        if was_blocked:
            entry.blocked_count += 1
        else:
            entry.update(reward)

    def recommend_action(
        self,
        state: AthleteState,
        available_actions: List[TrainingActionDefinition],
    ) -> PolicyRecommendation:
        """Recommend the action with the highest mean observed reward.

        Falls back to the default_fallback_action_id or the most-observed
        action when no reliable data exists.
        """
        context = classify_state(state)
        engine = ConstraintEngine(self.safety_constraints)
        allowed, blocked = engine.filter_actions(state, available_actions)

        if not allowed:
            # Nothing passed safety constraints — escalate to human review.
            fallback = (
                next(
                    (a for a in available_actions if a.requires_human_review),
                    available_actions[0],
                )
                if available_actions
                else None
            )
            safety_flags = [flag for b in blocked for flag in b.safety_flags]
            return PolicyRecommendation(
                athlete_id=state.athlete_id,
                timestamp=state.timestamp,
                selected_action=fallback,
                confidence=0.0,
                expected_benefit={},
                risk_tradeoffs={},
                explanation=[
                    "All actions blocked by safety constraints.",
                    "Escalating to human review.",
                ],
                safety_flags=safety_flags,
                requires_human_review=True,
                validation_status=self.validation_status,
            )

        # Collect reliable stats for allowed actions in this context
        candidates: List[tuple[float, int, TrainingActionDefinition]] = []
        for action in allowed:
            key = self._stats_key(context, action.action_id)
            if key in self.stats:
                s = self.stats[key]
                candidates.append((s.mean_reward, s.observation_count, action))

        safety_flags = [flag for b in blocked for flag in b.safety_flags]

        if candidates:
            candidates.sort(key=lambda t: (t[0], t[1]), reverse=True)
            best_reward, best_count, best_action = candidates[0]
            # Confidence: scaled by sqrt(n) / 10, capped at 0.9
            confidence = min(0.9, (best_count ** 0.5) / 10.0)
            explanation: List[str] = [
                f"Selected based on {best_count} observed transitions "
                f"in context '{context.value}'.",
                f"Mean reward: {best_reward:.3f}.",
            ]
            if best_count < 3:
                explanation.append(
                    "Low observation count — recommendation is uncertain."
                )
        else:
            # No stats for this context — use fallback
            if self.default_fallback_action_id:
                fallback_action = next(
                    (a for a in allowed if a.action_id == self.default_fallback_action_id),
                    allowed[0],
                )
            else:
                fallback_action = allowed[0]
            best_action = fallback_action
            confidence = 0.05
            explanation = [
                f"No historical data for context '{context.value}'.",
                "Using default fallback action.",
            ]

        return PolicyRecommendation(
            athlete_id=state.athlete_id,
            timestamp=state.timestamp,
            selected_action=best_action,
            confidence=confidence,
            expected_benefit={},
            risk_tradeoffs={},
            explanation=explanation,
            safety_flags=safety_flags,
            requires_human_review=confidence < 0.1,
            validation_status=self.validation_status,
        )

    def context_stats(self, context: StateContext) -> List[ActionOutcomeStats]:
        """Return all stats entries for a given context, sorted by mean reward."""
        entries = [
            s
            for key, s in self.stats.items()
            if key.startswith(context.value + "::")
        ]
        return sorted(entries, key=lambda s: s.mean_reward, reverse=True)

    def total_observations(self) -> int:
        return sum(s.observation_count for s in self.stats.values())


# ─── Offline RL Trainer ───────────────────────────────────────────────────────


@dataclass(frozen=True)
class OfflineTrainingResult:
    """Immutable summary of a completed offline-training run.

    Attributes:
        transitions_processed: number of transitions consumed.
        contexts_seen: number of distinct StateContext values encountered.
        actions_observed: number of distinct action IDs seen.
        mean_reward_overall: average reward across all processed transitions.
        policy: the trained FrequencyBasedPolicy.
        validation_status: always ``'experimental'``.
        warnings: list of non-fatal issues encountered during training.
    """

    transitions_processed: int
    contexts_seen: int
    actions_observed: int
    mean_reward_overall: float
    policy: FrequencyBasedPolicy
    validation_status: str = "experimental"
    warnings: tuple = field(default_factory=tuple)


class OfflineRLTrainer:
    """Trains a :class:`FrequencyBasedPolicy` from historical transition data.

    Usage::

        trainer = OfflineRLTrainer()
        result = trainer.train(dataset)
        policy = result.policy

    Args:
        action_catalog: if omitted, the default catalog is used.
        safety_constraints: if omitted, the default constraints are used.
        default_fallback_action_id: forwarded to FrequencyBasedPolicy.
    """

    def __init__(
        self,
        action_catalog: Optional[List[TrainingActionDefinition]] = None,
        safety_constraints: Optional[List[SafetyConstraint]] = None,
        default_fallback_action_id: Optional[str] = None,
    ) -> None:
        self._action_catalog = action_catalog or build_default_action_catalog()
        self._safety_constraints = safety_constraints or default_safety_constraints()
        self._default_fallback = default_fallback_action_id

    def train(
        self,
        data: Union[DecisionReplayDataset, Iterable[DecisionTransition]],
    ) -> OfflineTrainingResult:
        """Process all transitions and return a trained policy.

        Args:
            data: a ``DecisionReplayDataset`` or any iterable of
                ``DecisionTransition`` objects.

        Returns:
            ``OfflineTrainingResult`` with the trained policy.
        """
        transitions: Sequence[DecisionTransition]
        if isinstance(data, DecisionReplayDataset):
            transitions = data.transitions
        else:
            transitions = list(data)

        policy = FrequencyBasedPolicy(
            action_catalog=self._action_catalog,
            safety_constraints=self._safety_constraints,
            default_fallback_action_id=self._default_fallback,
        )

        reward_sum = 0.0
        contexts_seen: set[str] = set()
        actions_seen: set[str] = set()
        warnings: List[str] = []

        for i, transition in enumerate(transitions):
            try:
                context = classify_state(transition.previous_state)
                contexts_seen.add(context.value)
                actions_seen.add(transition.observed_action_id)
                reward = transition.metadata.get("reward", 0.0)
                policy.record_transition(
                    state=transition.previous_state,
                    action_id=transition.observed_action_id,
                    reward=reward,
                )
                reward_sum += reward
            except Exception as exc:  # noqa: BLE001
                warnings.append(
                    f"Skipped transition at index {i}: {type(exc).__name__}: {exc}"
                )

        n = len(transitions) - len(warnings)
        mean_reward = reward_sum / n if n > 0 else 0.0

        if n == 0:
            warnings.append(
                "No valid transitions were processed. "
                "Policy will use default fallback for all contexts."
            )

        return OfflineTrainingResult(
            transitions_processed=n,
            contexts_seen=len(contexts_seen),
            actions_observed=len(actions_seen),
            mean_reward_overall=mean_reward,
            policy=policy,
            validation_status="experimental",
            warnings=tuple(warnings),
        )

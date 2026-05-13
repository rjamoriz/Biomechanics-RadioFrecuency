"""Baseline policies for RL benchmarking and comparison.

These baselines exist to sanity-check the contextual bandit and rule-based
policy. Advanced RL methods should outperform ALL baselines before being
considered for deployment.

Baselines provided:
- ``RandomInterventionPolicy``: selects a random safe action (lower sanity bound)
- ``ConservativeInterventionPolicy``: always picks the lowest-stimulus safe action
- ``PolicyComparison``: evaluates and compares multiple policies on the same dataset

All baseline outputs carry validation_status='experimental'.
"""

from __future__ import annotations

import random
from dataclasses import dataclass, field
from typing import Iterable

from ..recommendation_policy import TrainingAction as TrainingActionId
from .actions import TrainingActionDefinition, build_default_action_catalog
from .constraints import BlockedAction, ConstraintEngine
from .evaluation import OfflineEvaluationReport, OfflinePolicyEvaluator
from .policy import InterventionPolicy, PolicyRecommendation, RuleBasedInterventionPolicy
from .rewards import RewardFunction, ShortHorizonRewardFunction
from .schemas import DecisionReplayDataset, DecisionTransition
from .state import AthleteState


# ---------------------------------------------------------------------------
# Random baseline
# ---------------------------------------------------------------------------


class RandomInterventionPolicy(InterventionPolicy):
    """Selects a random allowed action after applying safety constraints.

    Use as a lower-bound sanity-check baseline. Any well-designed policy
    should consistently outperform this on risk and pain reduction metrics.

    validation_status = 'experimental'
    """

    model_version: str = "random_policy_v0"

    def __init__(
        self,
        *,
        action_catalog: dict[TrainingActionId, TrainingActionDefinition] | None = None,
        constraint_engine: ConstraintEngine | None = None,
        fallback_policy: RuleBasedInterventionPolicy | None = None,
        seed: int | None = None,
    ) -> None:
        self.action_catalog = action_catalog or build_default_action_catalog()
        self.constraint_engine = constraint_engine or ConstraintEngine()
        self.fallback_policy = fallback_policy or RuleBasedInterventionPolicy(
            action_catalog=self.action_catalog,
            constraint_engine=self.constraint_engine,
        )
        self._rng = random.Random(seed)

    def recommend_action(
        self,
        state: AthleteState,
        available_actions: Iterable[TrainingActionId] | None = None,
    ) -> PolicyRecommendation:
        candidate_ids = list(available_actions or self.action_catalog.keys())
        candidates = [self.action_catalog[aid] for aid in candidate_ids if aid in self.action_catalog]

        allowed_actions, blocked_actions = self.constraint_engine.filter_actions(state, candidates)

        if not allowed_actions:
            return self.fallback_policy.recommend_action(state, available_actions)

        selected = self._rng.choice(allowed_actions)

        return PolicyRecommendation(
            athlete_id=state.athlete_id,
            timestamp=state.timestamp,
            selected_action=selected,
            confidence=0.0,  # random policy has no confidence
            expected_benefit={},
            risk_tradeoffs={},
            explanation=["Random baseline: action selected at random from allowed actions."],
            safety_flags=[],
            blocked_actions=list(blocked_actions),
            requires_human_review=selected.requires_human_review,
            validation_status="experimental",
            model_version=self.model_version,
        )


# ---------------------------------------------------------------------------
# Conservative baseline
# ---------------------------------------------------------------------------


class ConservativeInterventionPolicy(InterventionPolicy):
    """Always selects the safe action with the lowest training stimulus.

    Represents the maximally conservative extreme: minimum load, maximum
    risk aversion. A good policy should preserve more training stimulus
    while achieving comparable or better risk reduction.

    validation_status = 'experimental'
    """

    model_version: str = "conservative_policy_v0"

    def __init__(
        self,
        *,
        action_catalog: dict[TrainingActionId, TrainingActionDefinition] | None = None,
        constraint_engine: ConstraintEngine | None = None,
        fallback_policy: RuleBasedInterventionPolicy | None = None,
    ) -> None:
        self.action_catalog = action_catalog or build_default_action_catalog()
        self.constraint_engine = constraint_engine or ConstraintEngine()
        self.fallback_policy = fallback_policy or RuleBasedInterventionPolicy(
            action_catalog=self.action_catalog,
            constraint_engine=self.constraint_engine,
        )

    def recommend_action(
        self,
        state: AthleteState,
        available_actions: Iterable[TrainingActionId] | None = None,
    ) -> PolicyRecommendation:
        candidate_ids = list(available_actions or self.action_catalog.keys())
        candidates = [self.action_catalog[aid] for aid in candidate_ids if aid in self.action_catalog]

        allowed_actions, blocked_actions = self.constraint_engine.filter_actions(state, candidates)

        if not allowed_actions:
            return self.fallback_policy.recommend_action(state, available_actions)

        selected = min(allowed_actions, key=lambda a: a.expected_training_stimulus)

        return PolicyRecommendation(
            athlete_id=state.athlete_id,
            timestamp=state.timestamp,
            selected_action=selected,
            confidence=0.5,
            expected_benefit={"risk_reduction": 0.05},
            risk_tradeoffs={"training_stimulus_loss": 1.0 - selected.expected_training_stimulus},
            explanation=[
                "Conservative baseline: selected the allowed action with "
                "the lowest training stimulus to minimize injury-risk exposure."
            ],
            safety_flags=[],
            blocked_actions=list(blocked_actions),
            requires_human_review=selected.requires_human_review,
            validation_status="experimental",
            model_version=self.model_version,
        )


# ---------------------------------------------------------------------------
# Comparison report
# ---------------------------------------------------------------------------


@dataclass(frozen=True)
class PolicyComparisonEntry:
    policy_name: str
    evaluation_report: OfflineEvaluationReport


@dataclass(frozen=True)
class PolicyComparisonReport:
    """Summary of multiple policies evaluated on the same dataset.

    Use :attr:`ranked_by_mean_reward` to get policies sorted from best to worst.
    validation_status = 'experimental' — results depend on dataset quality.
    """

    entries: list[PolicyComparisonEntry]
    sample_count: int
    validation_status: str = "experimental"

    @property
    def ranked_by_mean_reward(self) -> list[PolicyComparisonEntry]:
        """Entries sorted by mean reward, descending (best policy first)."""
        return sorted(
            self.entries,
            key=lambda e: e.evaluation_report.summary.mean_reward,
            reverse=True,
        )

    @property
    def best_policy_name(self) -> str | None:
        """Name of the policy with the highest mean reward."""
        ranked = self.ranked_by_mean_reward
        return ranked[0].policy_name if ranked else None

    @property
    def mean_reward_by_policy(self) -> dict[str, float]:
        return {
            e.policy_name: e.evaluation_report.summary.mean_reward
            for e in self.entries
        }

    @property
    def safety_rate_by_policy(self) -> dict[str, float]:
        """Fraction of steps where no unsafe actions were taken (1 - unsafe_rate)."""
        return {
            e.policy_name: 1.0 - e.evaluation_report.summary.unsafe_action_rate
            for e in self.entries
        }


# ---------------------------------------------------------------------------
# Comparison runner
# ---------------------------------------------------------------------------


class PolicyComparison:
    """Evaluates multiple policies on the same offline dataset and compares results.

    Builds a :class:`PolicyComparisonReport` so you can measure how the
    contextual bandit or rule-based policy compares to simple baselines.

    All results carry validation_status='experimental'.

    Typical usage::

        dataset = DecisionReplayDataset(transitions)
        comparison = PolicyComparison(
            policies={
                "random": RandomInterventionPolicy(seed=0),
                "conservative": ConservativeInterventionPolicy(),
                "rule_based": RuleBasedInterventionPolicy(),
            }
        )
        report = comparison.compare(dataset)
        print(report.ranked_by_mean_reward)
    """

    def __init__(
        self,
        policies: dict[str, InterventionPolicy],
        reward_function: RewardFunction | None = None,
    ) -> None:
        if not policies:
            raise ValueError("At least one policy must be provided for comparison.")
        self.policies = policies
        self.reward_function = reward_function or ShortHorizonRewardFunction()

    def compare(
        self,
        samples: Iterable[DecisionTransition] | DecisionReplayDataset,
    ) -> PolicyComparisonReport:
        """Evaluate all policies on the same dataset and return a comparison report."""
        sample_list: list[DecisionTransition]
        if isinstance(samples, DecisionReplayDataset):
            sample_list = list(samples)
        else:
            sample_list = list(samples)

        entries: list[PolicyComparisonEntry] = []

        for policy_name, policy in self.policies.items():
            evaluator = OfflinePolicyEvaluator(policy, reward_function=self.reward_function)
            report = evaluator.evaluate(iter(sample_list))
            entries.append(PolicyComparisonEntry(policy_name=policy_name, evaluation_report=report))

        return PolicyComparisonReport(
            entries=entries,
            sample_count=len(sample_list),
        )

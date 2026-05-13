"""Safety-gated contextual bandit baseline for RL decision support."""

from __future__ import annotations

from dataclasses import dataclass
from math import log, sqrt
from typing import Any, Iterable

from ..recommendation_policy import TrainingAction as TrainingActionId
from .actions import TrainingActionDefinition, build_default_action_catalog
from .constraints import BlockedAction, ConstraintEngine
from .policy import (
    InterventionPolicy,
    PolicyRecommendation,
    RuleBasedInterventionPolicy,
)
from .schemas import DecisionTransition
from .state import AthleteState

ContextKey = tuple[str, ...]
ContextStats = dict[TrainingActionId, 'BanditArmStats']


@dataclass
class BanditArmStats:
    action_id: TrainingActionId
    observations: int = 0
    cumulative_reward: float = 0.0
    last_reward: float | None = None

    @property
    def mean_reward(self) -> float:
        if self.observations == 0:
            return 0.0
        return self.cumulative_reward / self.observations


class ContextualBanditPolicy(InterventionPolicy):
    def __init__(
        self,
        *,
        action_catalog: dict[
            TrainingActionId,
            TrainingActionDefinition,
        ] | None = None,
        constraint_engine: ConstraintEngine | None = None,
        fallback_policy: RuleBasedInterventionPolicy | None = None,
        exploration_weight: float = 0.15,
        min_samples_for_learned_choice: int = 2,
        model_version: str = 'contextual_bandit_policy_v0',
    ) -> None:
        self.action_catalog = action_catalog or build_default_action_catalog()
        self.constraint_engine = constraint_engine or ConstraintEngine()
        self.fallback_policy = fallback_policy or RuleBasedInterventionPolicy(
            action_catalog=self.action_catalog,
            constraint_engine=self.constraint_engine,
        )
        self.exploration_weight = exploration_weight
        self.min_samples_for_learned_choice = min_samples_for_learned_choice
        self.model_version = model_version
        self._stats: dict[ContextKey, ContextStats] = {}

    def recommend_action(
        self,
        state: AthleteState,
        available_actions: Iterable[TrainingActionId] | None = None,
    ) -> PolicyRecommendation:
        available_action_ids = tuple(
            available_actions or self.action_catalog.keys()
        )
        candidates = [
            self.action_catalog[action_id]
            for action_id in available_action_ids
        ]
        allowed_actions, blocked_actions = self.constraint_engine.filter_actions(
            state,
            candidates,
        )
        fallback = self.fallback_policy.recommend_action(
            state,
            available_actions=available_action_ids,
        )

        if not allowed_actions:
            return fallback

        context_key = self._context_key(state)
        context_stats = self._stats.setdefault(context_key, {})
        total_context_observations = sum(
            stat.observations for stat in context_stats.values()
        )
        scored_actions: list[
            tuple[float, TrainingActionDefinition, BanditArmStats]
        ] = []

        for action in allowed_actions:
            stat = context_stats.get(action.action_id)
            if (
                stat is None
                or stat.observations < self.min_samples_for_learned_choice
            ):
                continue
            score = self._upper_confidence_bound(
                stat,
                total_context_observations,
            )
            scored_actions.append((score, action, stat))

        if not scored_actions:
            return self._build_fallback_recommendation(
                fallback,
                blocked_actions,
            )

        scored_actions.sort(
            key=lambda item: (
                item[0],
                item[2].mean_reward,
                item[1].action_id == fallback.selected_action.action_id,
            ),
            reverse=True,
        )
        _, selected_action, selected_stats = scored_actions[0]

        requires_human_review = (
            selected_action.requires_human_review
            or state.pain_status.pain_score >= 6.0
            or fallback.requires_human_review
        )
        safety_flags = self._merge_safety_flags(
            fallback.safety_flags,
            blocked_actions,
        )
        explanation = [
            (
                'A safety-gated contextual bandit selected a safe action '
                'using observed short-horizon reward history.'
            ),
            (
                f'This action has mean reward '
                f'{selected_stats.mean_reward:.3f} across '
                f'{selected_stats.observations} observations '
                'in a similar context.'
            ),
        ]
        if selected_action.action_id != fallback.selected_action.action_id:
            explanation.append(
                (
                    'Rule-based fallback preferred '
                    f'{fallback.selected_action.action_id.value}, '
                    'but the learned policy found a '
                    'higher-reward safe alternative.'
                )
            )
        explanation.extend(fallback.explanation[:1])

        expected_benefit = RuleBasedInterventionPolicy._expected_benefit(
            state,
            selected_action,
        )
        expected_benefit['learned_expected_reward'] = round(
            selected_stats.mean_reward,
            3,
        )
        risk_tradeoffs = RuleBasedInterventionPolicy._risk_tradeoffs(
            selected_action,
            requires_human_review,
        )
        risk_tradeoffs['learning_uncertainty'] = round(
            max(0.0, 1.0 - min(1.0, selected_stats.observations / 6.0)),
            3,
        )

        return PolicyRecommendation(
            athlete_id=state.athlete_id,
            timestamp=state.timestamp,
            selected_action=selected_action,
            confidence=self._estimate_confidence(
                fallback.confidence,
                selected_stats,
            ),
            expected_benefit=expected_benefit,
            risk_tradeoffs=risk_tradeoffs,
            explanation=explanation,
            safety_flags=safety_flags,
            blocked_actions=blocked_actions,
            requires_human_review=requires_human_review,
            validation_status='experimental',
            model_version=self.model_version,
        )

    def record_outcome(
        self,
        state: AthleteState,
        action_id: TrainingActionId,
        reward: float,
    ) -> BanditArmStats:
        context_key = self._context_key(state)
        context_stats = self._stats.setdefault(context_key, {})
        action_stats = context_stats.setdefault(
            action_id,
            BanditArmStats(action_id=action_id),
        )
        action_stats.observations += 1
        action_stats.cumulative_reward += reward
        action_stats.last_reward = reward
        return action_stats

    def record_transition(
        self,
        transition: DecisionTransition,
        reward: float,
    ) -> BanditArmStats:
        if transition.observed_action_id is None:
            raise ValueError(
                'DecisionTransition.observed_action_id is required '
                'to update the contextual bandit.'
            )
        return self.record_outcome(
            transition.previous_state,
            transition.observed_action_id,
            reward,
        )

    def get_action_stats(
        self,
        state: AthleteState,
        action_id: TrainingActionId,
    ) -> BanditArmStats | None:
        context_key = self._context_key(state)
        return self._stats.get(context_key, {}).get(action_id)

    def to_snapshot(self) -> dict[str, Any]:
        return {
            'model_version': self.model_version,
            'exploration_weight': self.exploration_weight,
            'min_samples_for_learned_choice': (
                self.min_samples_for_learned_choice
            ),
            'context_stats': [
                {
                    'context_key': list(context_key),
                    'arms': {
                        action_id.value: {
                            'observations': stats.observations,
                            'cumulative_reward': stats.cumulative_reward,
                            'last_reward': stats.last_reward,
                        }
                        for action_id, stats in sorted(
                            context_stats.items(),
                            key=lambda item: item[0].value,
                        )
                    },
                }
                for context_key, context_stats in sorted(
                    self._stats.items(),
                    key=lambda item: item[0],
                )
            ],
        }

    @classmethod
    def from_snapshot(
        cls,
        snapshot: dict[str, Any],
    ) -> ContextualBanditPolicy:
        policy = cls(
            exploration_weight=snapshot.get('exploration_weight', 0.15),
            min_samples_for_learned_choice=snapshot.get(
                'min_samples_for_learned_choice',
                2,
            ),
            model_version=snapshot.get(
                'model_version',
                'contextual_bandit_policy_v0',
            ),
        )
        loaded_stats: dict[ContextKey, ContextStats] = {}
        for context_entry in snapshot.get('context_stats', []):
            context_key = tuple(context_entry['context_key'])
            arms: ContextStats = {}
            for action_id, arm_snapshot in context_entry['arms'].items():
                resolved_action_id = TrainingActionId(action_id)
                arms[resolved_action_id] = BanditArmStats(
                    action_id=resolved_action_id,
                    observations=arm_snapshot['observations'],
                    cumulative_reward=arm_snapshot['cumulative_reward'],
                    last_reward=arm_snapshot.get('last_reward'),
                )
            loaded_stats[context_key] = arms
        policy._stats = loaded_stats
        return policy

    def _build_fallback_recommendation(
        self,
        fallback: PolicyRecommendation,
        blocked_actions: list[BlockedAction],
    ) -> PolicyRecommendation:
        explanation = [
            (
                'No contextual bandit evidence met the learning threshold, '
                'so the rule-based fallback was retained.'
            ),
        ]
        explanation.extend(fallback.explanation)
        safety_flags = self._merge_safety_flags(
            fallback.safety_flags,
            blocked_actions,
        )
        return PolicyRecommendation(
            athlete_id=fallback.athlete_id,
            timestamp=fallback.timestamp,
            selected_action=fallback.selected_action,
            confidence=fallback.confidence,
            expected_benefit=dict(fallback.expected_benefit),
            risk_tradeoffs=dict(fallback.risk_tradeoffs),
            explanation=explanation,
            safety_flags=safety_flags,
            blocked_actions=blocked_actions,
            requires_human_review=fallback.requires_human_review,
            validation_status='experimental',
            model_version=self.model_version,
        )

    def _upper_confidence_bound(
        self,
        action_stats: BanditArmStats,
        total_context_observations: int,
    ) -> float:
        if action_stats.observations == 0:
            return float('inf')
        return action_stats.mean_reward + self.exploration_weight * sqrt(
            log(total_context_observations + 1) / action_stats.observations
        )

    @staticmethod
    def _estimate_confidence(
        fallback_confidence: float,
        action_stats: BanditArmStats,
    ) -> float:
        learned_support = min(1.0, action_stats.observations / 6.0)
        return min(
            0.8,
            round(fallback_confidence * 0.75 + learned_support * 0.2, 4),
        )

    @staticmethod
    def _context_key(state: AthleteState) -> ContextKey:
        if state.pain_status.pain_score >= 6.0:
            pain_bucket = 'high_pain'
        elif state.pain_status.pain_score >= 3.0:
            pain_bucket = 'moderate_pain'
        else:
            pain_bucket = 'low_pain'

        if state.effective_data_quality < 0.45:
            data_quality_bucket = 'low_quality'
        elif state.effective_data_quality < 0.7:
            data_quality_bucket = 'medium_quality'
        else:
            data_quality_bucket = 'high_quality'

        return (
            state.risk_forecast.overall_risk_level.value,
            state.planned_session_type.value,
            pain_bucket,
            data_quality_bucket,
        )

    @staticmethod
    def _merge_safety_flags(
        fallback_safety_flags: list[str],
        blocked_actions: list[BlockedAction],
    ) -> list[str]:
        blocked_flags = [
            flag
            for blocked in blocked_actions
            for flag in blocked.safety_flags
        ]
        return list(
            dict.fromkeys(
                fallback_safety_flags
                + blocked_flags
                + ['contextual_bandit_experimental']
            )
        )

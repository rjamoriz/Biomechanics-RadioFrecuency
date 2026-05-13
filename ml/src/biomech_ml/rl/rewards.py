"""Reward interfaces and a short-horizon heuristic reward baseline."""

from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass

from ..recommendation_policy import TrainingAction as TrainingActionId
from .actions import TrainingActionDefinition
from .state import AthleteState


_LOW_QUALITY_SAFE_ACTIONS = {
    TrainingActionId.RECOMMEND_RF_BIOMECHANICS_RETEST,
    TrainingActionId.SUGGEST_COACH_REVIEW,
    TrainingActionId.SUGGEST_CLINICIAN_REVIEW,
    TrainingActionId.RECOMMEND_SUBJECTIVE_PAIN_CHECK_IN,
}


@dataclass(frozen=True)
class RewardBreakdown:
    total_reward: float
    risk_component: float
    pain_component: float
    training_stimulus_penalty: float
    safety_penalty: float


class RewardFunction(ABC):
    version: str

    @abstractmethod
    def compute_reward(
        self,
        previous_state: AthleteState,
        action: TrainingActionDefinition,
        next_state: AthleteState,
    ) -> float:
        raise NotImplementedError


class ShortHorizonRewardFunction(RewardFunction):
    version = 'short_horizon_reward_v0'

    def compute_reward(
        self,
        previous_state: AthleteState,
        action: TrainingActionDefinition,
        next_state: AthleteState,
    ) -> float:
        return self.compute_breakdown(previous_state, action, next_state).total_reward

    def compute_breakdown(
        self,
        previous_state: AthleteState,
        action: TrainingActionDefinition,
        next_state: AthleteState,
    ) -> RewardBreakdown:
        risk_component = (
            previous_state.risk_forecast.overall_risk_score - next_state.risk_forecast.overall_risk_score
        ) * 2.0
        pain_component = (
            previous_state.pain_status.pain_score - next_state.pain_status.pain_score
        ) * 0.25
        training_stimulus_penalty = (1.0 - action.expected_training_stimulus) * 0.2
        safety_penalty = 0.0
        if previous_state.effective_data_quality < 0.45 and action.action_id not in _LOW_QUALITY_SAFE_ACTIONS:
            safety_penalty += 0.25
        if next_state.pain_status.pain_score > previous_state.pain_status.pain_score:
            safety_penalty += 0.4
        total_reward = risk_component + pain_component - training_stimulus_penalty - safety_penalty
        return RewardBreakdown(
            total_reward=total_reward,
            risk_component=risk_component,
            pain_component=pain_component,
            training_stimulus_penalty=training_stimulus_penalty,
            safety_penalty=safety_penalty,
        )

"""Shared replay schemas for RL decision-support transitions."""

from __future__ import annotations

from dataclasses import dataclass, field, replace
from typing import Any, Iterable, Iterator

from ..recommendation_policy import TrainingAction as TrainingActionId
from .state import AthleteState


@dataclass(frozen=True)
class DecisionTransition:
    previous_state: AthleteState
    next_state: AthleteState
    available_actions: tuple[TrainingActionId, ...] = ()
    observed_action_id: TrainingActionId | None = None
    sample_id: str | None = None
    transition_source: str = 'experimental'
    validation_status: str = 'experimental'
    metadata: dict[str, Any] = field(default_factory=dict)

    @property
    def athlete_id(self) -> str:
        return self.previous_state.athlete_id

    @property
    def effective_sample_id(self) -> str:
        return self.sample_id or self.previous_state.athlete_id

    @property
    def risk_delta(self) -> float:
        return round(
            self.previous_state.risk_forecast.overall_risk_score
            - self.next_state.risk_forecast.overall_risk_score,
            4,
        )

    @property
    def pain_delta(self) -> float:
        return round(
            self.previous_state.pain_status.pain_score
            - self.next_state.pain_status.pain_score,
            4,
        )

    @property
    def signal_quality_score(self) -> float:
        return round(self.previous_state.effective_data_quality, 4)

    @property
    def metric_confidence(self) -> float:
        return round(self.previous_state.risk_forecast.model_confidence, 4)

    @property
    def low_data_quality_case(self) -> bool:
        return self.previous_state.effective_data_quality < 0.45

    @property
    def experimental(self) -> bool:
        return (
            self.validation_status in {'experimental', 'unvalidated'}
            or self.previous_state.risk_forecast.experimental
        )

    def with_metadata(self, **metadata: Any) -> DecisionTransition:
        return replace(
            self,
            metadata={**self.metadata, **metadata},
        )


class DecisionReplayDataset:
    def __init__(
        self,
        transitions: Iterable[DecisionTransition] | None = None,
    ) -> None:
        self._transitions = list(transitions or [])

    def __len__(self) -> int:
        return len(self._transitions)

    def __iter__(self) -> Iterator[DecisionTransition]:
        return iter(self._transitions)

    def __getitem__(self, index: int) -> DecisionTransition:
        return self._transitions[index]

    @property
    def transitions(self) -> tuple[DecisionTransition, ...]:
        return tuple(self._transitions)

    @property
    def athlete_ids(self) -> tuple[str, ...]:
        return tuple(dict.fromkeys(t.athlete_id for t in self._transitions))

    def append(self, transition: DecisionTransition) -> None:
        self._transitions.append(transition)

    def extend(self, transitions: Iterable[DecisionTransition]) -> None:
        self._transitions.extend(transitions)

    def filter_by_athlete(self, athlete_id: str) -> DecisionReplayDataset:
        return DecisionReplayDataset(
            transition
            for transition in self._transitions
            if transition.athlete_id == athlete_id
        )

    def sorted_by_timestamp(self) -> DecisionReplayDataset:
        return DecisionReplayDataset(
            sorted(
                self._transitions,
                key=lambda transition: transition.previous_state.timestamp,
            )
        )

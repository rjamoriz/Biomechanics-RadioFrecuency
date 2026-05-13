"""Typed athlete state schema for the RL/decision-support layer."""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any

from ..injury_risk_model import InjuryRiskLevel, InjuryRiskOutput
from ..recommendation_policy import (
    AthleteTrainingState,
    MarathonPhase,
    PainStatus,
    PlannedSessionType,
    RecoveryState,
    TrainingAction as TrainingActionId,
    TrainingLoadState,
)



def _default_risk_forecast() -> InjuryRiskOutput:
    return InjuryRiskOutput(
        overall_risk_score=0.0,
        overall_risk_level=InjuryRiskLevel.LOW,
        signal_quality_score=1.0,
    )


@dataclass(frozen=True)
class AthleteState:
    athlete_id: str
    timestamp: datetime = field(default_factory=lambda: datetime.now(timezone.utc))
    marathon_phase: MarathonPhase = MarathonPhase.BUILD
    planned_session_type: PlannedSessionType = PlannedSessionType.UNKNOWN
    training_load: TrainingLoadState = field(default_factory=TrainingLoadState)
    recovery: RecoveryState = field(default_factory=RecoveryState)
    pain_status: PainStatus = field(default_factory=PainStatus)
    risk_forecast: InjuryRiskOutput = field(default_factory=_default_risk_forecast)
    signal_quality_score: float = 1.0
    data_quality_score: float = 1.0
    calibrated: bool = True
    coach_restricted_actions: tuple[TrainingActionId, ...] = ()
    clinician_restricted_actions: tuple[TrainingActionId, ...] = ()
    metadata: dict[str, Any] = field(default_factory=dict)

    @property
    def effective_data_quality(self) -> float:
        quality_inputs = [self.signal_quality_score, self.data_quality_score]
        if self.risk_forecast.signal_quality_score > 0.0:
            quality_inputs.append(self.risk_forecast.signal_quality_score)
        return min(quality_inputs)

    @property
    def restricted_actions(self) -> set[TrainingActionId]:
        return set(self.coach_restricted_actions) | set(self.clinician_restricted_actions)

    def to_training_state(self) -> AthleteTrainingState:
        return AthleteTrainingState(
            athlete_id=self.athlete_id,
            marathon_phase=self.marathon_phase,
            planned_session_type=self.planned_session_type,
            training_load=self.training_load,
            recovery=self.recovery,
            pain_status=self.pain_status,
            signal_quality_score=self.signal_quality_score,
            calibrated=self.calibrated,
            baseline_deviation_score=self.metadata.get('baseline_deviation_score'),
            load_capacity_gap=self.metadata.get('load_capacity_gap'),
        )

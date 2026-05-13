"""Typed action catalog for the experimental RL decision-support layer."""

from __future__ import annotations

from dataclasses import dataclass
from enum import Enum

from ..recommendation_policy import TrainingAction as TrainingActionId


class ActionCategory(str, Enum):
    MAINTAIN_PLAN = "maintain_plan"
    REDUCE_LOAD = "reduce_load"
    SUBSTITUTE_SESSION = "substitute_session"
    MODIFY_MECHANICS = "modify_mechanics"
    READINESS_SCREENING = "readiness_screening"
    ESCALATION = "escalation"


@dataclass(frozen=True)
class TrainingActionDefinition:
    action_id: TrainingActionId
    category: ActionCategory
    description: str
    intensity_modifier: float = 1.0
    volume_modifier: float = 1.0
    requires_human_review: bool = False
    contraindications: tuple[str, ...] = ()

    @property
    def expected_training_stimulus(self) -> float:
        return max(0.0, (self.intensity_modifier + self.volume_modifier) / 2.0)



def build_default_action_catalog() -> dict[TrainingActionId, TrainingActionDefinition]:
    return {
        TrainingActionId.CONTINUE_MONITORING: TrainingActionDefinition(
            action_id=TrainingActionId.CONTINUE_MONITORING,
            category=ActionCategory.MAINTAIN_PLAN,
            description="Continue the planned session with monitoring only.",
        ),
        TrainingActionId.REDUCE_SESSION_VOLUME: TrainingActionDefinition(
            action_id=TrainingActionId.REDUCE_SESSION_VOLUME,
            category=ActionCategory.REDUCE_LOAD,
            description="Reduce the current session volume while preserving the session type.",
            volume_modifier=0.8,
        ),
        TrainingActionId.REDUCE_WEEKLY_VOLUME: TrainingActionDefinition(
            action_id=TrainingActionId.REDUCE_WEEKLY_VOLUME,
            category=ActionCategory.REDUCE_LOAD,
            description="Reduce the cumulative weekly running volume.",
            volume_modifier=0.85,
        ),
        TrainingActionId.REDUCE_INTENSITY: TrainingActionDefinition(
            action_id=TrainingActionId.REDUCE_INTENSITY,
            category=ActionCategory.REDUCE_LOAD,
            description="Keep the session but reduce speed or intensity demand.",
            intensity_modifier=0.8,
        ),
        TrainingActionId.REDUCE_HILL_EXPOSURE: TrainingActionDefinition(
            action_id=TrainingActionId.REDUCE_HILL_EXPOSURE,
            category=ActionCategory.REDUCE_LOAD,
            description="Reduce uphill exposure while maintaining aerobic continuity.",
            intensity_modifier=0.9,
        ),
        TrainingActionId.REDUCE_SPEED_WORK_EXPOSURE: TrainingActionDefinition(
            action_id=TrainingActionId.REDUCE_SPEED_WORK_EXPOSURE,
            category=ActionCategory.REDUCE_LOAD,
            description="Reduce high-speed workload within the training block.",
            intensity_modifier=0.85,
        ),
        TrainingActionId.REPLACE_WITH_FLAT_AEROBIC_RUN: TrainingActionDefinition(
            action_id=TrainingActionId.REPLACE_WITH_FLAT_AEROBIC_RUN,
            category=ActionCategory.SUBSTITUTE_SESSION,
            description="Replace the planned session with a flat aerobic run.",
            intensity_modifier=0.75,
            volume_modifier=0.95,
        ),
        TrainingActionId.REPLACE_WITH_EASY_AEROBIC_RUN: TrainingActionDefinition(
            action_id=TrainingActionId.REPLACE_WITH_EASY_AEROBIC_RUN,
            category=ActionCategory.SUBSTITUTE_SESSION,
            description="Replace the planned session with an easy aerobic run.",
            intensity_modifier=0.65,
            volume_modifier=0.9,
        ),
        TrainingActionId.REPLACE_WITH_CROSS_TRAINING: TrainingActionDefinition(
            action_id=TrainingActionId.REPLACE_WITH_CROSS_TRAINING,
            category=ActionCategory.SUBSTITUTE_SESSION,
            description="Replace the run with lower-impact cross-training.",
            intensity_modifier=0.6,
            volume_modifier=0.85,
        ),
        TrainingActionId.REPLACE_WITH_RECOVERY_DAY: TrainingActionDefinition(
            action_id=TrainingActionId.REPLACE_WITH_RECOVERY_DAY,
            category=ActionCategory.SUBSTITUTE_SESSION,
            description="Replace the planned session with a recovery day.",
            intensity_modifier=0.0,
            volume_modifier=0.0,
            requires_human_review=True,
        ),
        TrainingActionId.SUGGEST_CADENCE_ADJUSTMENT: TrainingActionDefinition(
            action_id=TrainingActionId.SUGGEST_CADENCE_ADJUSTMENT,
            category=ActionCategory.MODIFY_MECHANICS,
            description="Suggest a conservative cadence-oriented mechanics cue.",
            requires_human_review=True,
        ),
        TrainingActionId.RECOMMEND_RF_BIOMECHANICS_RETEST: TrainingActionDefinition(
            action_id=TrainingActionId.RECOMMEND_RF_BIOMECHANICS_RETEST,
            category=ActionCategory.READINESS_SCREENING,
            description="Request an RF biomechanics retest before stronger recommendations.",
            intensity_modifier=0.0,
            volume_modifier=0.0,
        ),
        TrainingActionId.RECOMMEND_CALF_READINESS_TEST: TrainingActionDefinition(
            action_id=TrainingActionId.RECOMMEND_CALF_READINESS_TEST,
            category=ActionCategory.READINESS_SCREENING,
            description="Request a calf readiness screen.",
            intensity_modifier=0.0,
            volume_modifier=0.0,
        ),
        TrainingActionId.RECOMMEND_JUMP_ASYMMETRY_TEST: TrainingActionDefinition(
            action_id=TrainingActionId.RECOMMEND_JUMP_ASYMMETRY_TEST,
            category=ActionCategory.READINESS_SCREENING,
            description="Request a jump or asymmetry screening test.",
            intensity_modifier=0.0,
            volume_modifier=0.0,
        ),
        TrainingActionId.RECOMMEND_SUBJECTIVE_PAIN_CHECK_IN: TrainingActionDefinition(
            action_id=TrainingActionId.RECOMMEND_SUBJECTIVE_PAIN_CHECK_IN,
            category=ActionCategory.READINESS_SCREENING,
            description="Request a structured subjective pain check-in.",
            intensity_modifier=0.0,
            volume_modifier=0.0,
        ),
        TrainingActionId.SUGGEST_COACH_REVIEW: TrainingActionDefinition(
            action_id=TrainingActionId.SUGGEST_COACH_REVIEW,
            category=ActionCategory.ESCALATION,
            description="Escalate the decision to a coach review.",
            intensity_modifier=0.0,
            volume_modifier=0.0,
            requires_human_review=True,
        ),
        TrainingActionId.SUGGEST_CLINICIAN_REVIEW: TrainingActionDefinition(
            action_id=TrainingActionId.SUGGEST_CLINICIAN_REVIEW,
            category=ActionCategory.ESCALATION,
            description="Escalate the decision to a clinician or physio review.",
            intensity_modifier=0.0,
            volume_modifier=0.0,
            requires_human_review=True,
        ),
    }

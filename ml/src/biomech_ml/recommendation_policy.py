"""Safe training recommendation baseline for experimental decision support.

This module turns experimental injury-risk outputs into constrained training
adjustment suggestions. It is a rule-based baseline intended to define the
recommendation contract and safety rails before any adaptive RL policy is
introduced.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from enum import Enum
from typing import Optional

from .injury_risk_model import InjuryRiskFactor, InjuryRiskLevel, InjuryRiskOutput


def _clamp(value: float, lo: float = 0.0, hi: float = 1.0) -> float:
    return max(lo, min(hi, value))


class MarathonPhase(str, Enum):
    BASE = "base"
    BUILD = "build"
    PEAK = "peak"
    TAPER = "taper"
    RECOVERY = "recovery"


class PlannedSessionType(str, Enum):
    EASY_AEROBIC = "easy_aerobic"
    LONG_RUN = "long_run"
    TEMPO = "tempo"
    INTERVALS = "intervals"
    HILLS = "hills"
    RECOVERY = "recovery"
    CROSS_TRAINING = "cross_training"
    UNKNOWN = "unknown"


class TrainingAction(str, Enum):
    CONTINUE_MONITORING = "continue_monitoring"
    REDUCE_SESSION_VOLUME = "reduce_session_volume"
    REDUCE_WEEKLY_VOLUME = "reduce_weekly_volume"
    REDUCE_INTENSITY = "reduce_intensity"
    REDUCE_HILL_EXPOSURE = "reduce_hill_exposure"
    REDUCE_SPEED_WORK_EXPOSURE = "reduce_speed_work_exposure"
    REPLACE_WITH_FLAT_AEROBIC_RUN = "replace_with_flat_aerobic_run"
    REPLACE_WITH_EASY_AEROBIC_RUN = "replace_with_easy_aerobic_run"
    REPLACE_WITH_CROSS_TRAINING = "replace_with_cross_training"
    REPLACE_WITH_RECOVERY_DAY = "replace_with_recovery_day"
    SUGGEST_CADENCE_ADJUSTMENT = "suggest_cadence_adjustment"
    RECOMMEND_RF_BIOMECHANICS_RETEST = "recommend_rf_biomechanics_retest"
    RECOMMEND_CALF_READINESS_TEST = "recommend_calf_readiness_test"
    RECOMMEND_JUMP_ASYMMETRY_TEST = "recommend_jump_asymmetry_test"
    RECOMMEND_SUBJECTIVE_PAIN_CHECK_IN = "recommend_subjective_pain_check_in"
    SUGGEST_COACH_REVIEW = "suggest_coach_review"
    SUGGEST_CLINICIAN_REVIEW = "suggest_clinician_review"


@dataclass(frozen=True)
class TrainingLoadState:
    weekly_distance_km: Optional[float] = None
    acute_load: Optional[float] = None
    chronic_load: Optional[float] = None
    intensity_share: Optional[float] = None
    hill_exposure_share: Optional[float] = None
    speed_work_sessions: Optional[int] = None


@dataclass(frozen=True)
class RecoveryState:
    sleep_duration_h: Optional[float] = None
    sleep_quality_score: Optional[float] = None
    perceived_fatigue_score: Optional[float] = None
    soreness_score: Optional[float] = None
    readiness_score: Optional[float] = None


@dataclass(frozen=True)
class PainStatus:
    pain_score: float = 0.0
    pain_location: Optional[str] = None
    pain_duration_days: Optional[int] = None
    modified_training: bool = False


@dataclass(frozen=True)
class AthleteTrainingState:
    athlete_id: Optional[str] = None
    marathon_phase: MarathonPhase = MarathonPhase.BUILD
    planned_session_type: PlannedSessionType = PlannedSessionType.UNKNOWN
    training_load: TrainingLoadState = field(default_factory=TrainingLoadState)
    recovery: RecoveryState = field(default_factory=RecoveryState)
    pain_status: PainStatus = field(default_factory=PainStatus)
    signal_quality_score: Optional[float] = None
    calibrated: Optional[bool] = None
    baseline_deviation_score: Optional[float] = None
    load_capacity_gap: Optional[float] = None


@dataclass(frozen=True)
class RecommendationDriver:
    factor_id: str
    label: str
    influence: float
    explanation: str


@dataclass(frozen=True)
class RecommendedAction:
    action: TrainingAction
    rationale: str
    expected_tradeoff: str


@dataclass(frozen=True)
class TrainingRecommendation:
    primary_action: RecommendedAction
    secondary_actions: list[RecommendedAction] = field(default_factory=list)
    contributing_factors: list[RecommendationDriver] = field(default_factory=list)
    safety_warnings: list[str] = field(default_factory=list)
    recommendation_confidence: float = 0.0
    validation_status: str = "experimental"
    model_version: str = "safe_recommendation_policy_v0"
    experimental: bool = True


_HIGH_INTENSITY_SESSION_TYPES = {
    PlannedSessionType.TEMPO,
    PlannedSessionType.INTERVALS,
    PlannedSessionType.HILLS,
}

_ACTION_TRADEOFFS = {
    TrainingAction.CONTINUE_MONITORING: (
        "Preserves the planned training stimulus, but ongoing monitoring is still required."
    ),
    TrainingAction.REDUCE_SESSION_VOLUME: (
        "Lowers short-term tissue load, but slightly reduces the current workout stimulus."
    ),
    TrainingAction.REDUCE_WEEKLY_VOLUME: (
        "Reduces cumulative load this week, but may slow short-term progression."
    ),
    TrainingAction.REDUCE_INTENSITY: (
        "Keeps the session in place while reducing peak mechanical stress and speed stimulus."
    ),
    TrainingAction.REDUCE_HILL_EXPOSURE: (
        "Lowers calf-Achilles and uphill loading demand, but removes some specific strength work."
    ),
    TrainingAction.REDUCE_SPEED_WORK_EXPOSURE: (
        "Maintains continuity while dialing back high-impact speed demands."
    ),
    TrainingAction.REPLACE_WITH_FLAT_AEROBIC_RUN: (
        "Preserves aerobic volume, but removes hill-specific or variable-load stimulus."
    ),
    TrainingAction.REPLACE_WITH_EASY_AEROBIC_RUN: (
        "Preserves movement exposure, but reduces quality-session intensity."
    ),
    TrainingAction.REPLACE_WITH_CROSS_TRAINING: (
        "Maintains aerobic stimulus with less impact, but is less specific than running."
    ),
    TrainingAction.REPLACE_WITH_RECOVERY_DAY: (
        "Maximally unloads the next session, but sacrifices immediate training stimulus."
    ),
    TrainingAction.SUGGEST_CADENCE_ADJUSTMENT: (
        "Targets mechanics with minimal load change, but needs coach review before adoption."
    ),
    TrainingAction.RECOMMEND_RF_BIOMECHANICS_RETEST: (
        "Improves data confidence, but delays any strong load-modification decision."
    ),
    TrainingAction.RECOMMEND_CALF_READINESS_TEST: (
        "Adds readiness screening, but does not itself reduce load without follow-up action."
    ),
    TrainingAction.RECOMMEND_JUMP_ASYMMETRY_TEST: (
        "Adds asymmetry screening, but introduces an extra assessment step before action."
    ),
    TrainingAction.RECOMMEND_SUBJECTIVE_PAIN_CHECK_IN: (
        "Improves symptom awareness, but depends on honest athlete feedback."
    ),
    TrainingAction.SUGGEST_COACH_REVIEW: (
        "Adds human oversight, but introduces decision latency before changing the plan."
    ),
    TrainingAction.SUGGEST_CLINICIAN_REVIEW: (
        "Adds clinical oversight for pain persistence, but is reserved for higher-concern cases."
    ),
}


class SafeRecommendationPolicy:
    """Constrained experimental decision-support policy."""

    def __init__(self, model_version: str = "safe_recommendation_policy_v0"):
        self.model_version = model_version

    def recommend(
        self,
        risk: InjuryRiskOutput,
        athlete_state: AthleteTrainingState,
    ) -> TrainingRecommendation:
        warnings = list(risk.warnings)
        warnings.append(
            "Experimental decision-support output. Not a diagnosis or autonomous training prescription."
        )

        primary_action = self._select_primary_action(risk, athlete_state, warnings)
        secondary_actions = self._select_secondary_actions(risk, athlete_state, primary_action.action)
        drivers = self._build_drivers(risk, athlete_state)
        confidence = self._estimate_confidence(risk, athlete_state)

        return TrainingRecommendation(
            primary_action=primary_action,
            secondary_actions=secondary_actions,
            contributing_factors=drivers,
            safety_warnings=warnings,
            recommendation_confidence=confidence,
            validation_status="experimental",
            model_version=self.model_version,
            experimental=True,
        )

    def _select_primary_action(
        self,
        risk: InjuryRiskOutput,
        athlete_state: AthleteTrainingState,
        warnings: list[str],
    ) -> RecommendedAction:
        pain_score = athlete_state.pain_status.pain_score
        acwr = self._acute_chronic_ratio(athlete_state.training_load)
        low_data_quality = self._is_low_data_quality(risk, athlete_state)
        high_intensity_session = athlete_state.planned_session_type in _HIGH_INTENSITY_SESSION_TYPES

        if pain_score >= 7.0 or (
            risk.overall_risk_level in {InjuryRiskLevel.HIGH, InjuryRiskLevel.CRITICAL}
            and pain_score >= 5.0
        ):
            warnings.append(
                "Higher pain plus elevated proxy risk should trigger human review before normal running resumes."
            )
            return self._build_action(
                TrainingAction.REPLACE_WITH_RECOVERY_DAY,
                "High pain plus elevated injury-risk forecast suggests unloading the next running session.",
            )

        if risk.overall_risk_level in {InjuryRiskLevel.HIGH, InjuryRiskLevel.CRITICAL}:
            if high_intensity_session:
                return self._build_action(
                    TrainingAction.REPLACE_WITH_CROSS_TRAINING,
                    "High short-term risk on a quality session is better handled by preserving aerobic"
                    " stimulus without additional impact loading.",
                )
            return self._build_action(
                TrainingAction.REDUCE_SESSION_VOLUME,
                "High proxy risk suggests cutting short-term tissue load before continuing the plan.",
            )

        if risk.overall_risk_level == InjuryRiskLevel.ELEVATED:
            if acwr is not None and acwr > 1.35:
                return self._build_action(
                    TrainingAction.REDUCE_WEEKLY_VOLUME,
                    "Elevated risk with a sharp acute-to-chronic load ratio suggests dialing back"
                    " cumulative weekly load.",
                )
            if (athlete_state.training_load.hill_exposure_share or 0.0) > 0.25:
                return self._build_action(
                    TrainingAction.REDUCE_HILL_EXPOSURE,
                    "Elevated risk during higher hill exposure suggests reducing uphill demand first.",
                )
            if high_intensity_session or (athlete_state.training_load.intensity_share or 0.0) > 0.35:
                return self._build_action(
                    TrainingAction.REDUCE_INTENSITY,
                    "Elevated risk with substantial intensity exposure suggests keeping the session but"
                    " reducing intensity.",
                )
            if pain_score >= 4.0:
                return self._build_action(
                    TrainingAction.REPLACE_WITH_EASY_AEROBIC_RUN,
                    "Moderate pain plus elevated risk supports a lower-intensity substitute run.",
                )
            return self._build_action(
                TrainingAction.REDUCE_SESSION_VOLUME,
                "Elevated risk without a dominant trigger supports a conservative volume reduction.",
            )

        if low_data_quality:
            warnings.append(
                "Signal quality or model confidence is low, so only a monitoring-oriented"
                " recommendation is returned."
            )
            return self._build_action(
                TrainingAction.RECOMMEND_RF_BIOMECHANICS_RETEST,
                "Data quality is too weak for a confident load-change recommendation.",
            )

        if self._factor_value(risk, "asymmetry") >= 0.65:
            return self._build_action(
                TrainingAction.SUGGEST_CADENCE_ADJUSTMENT,
                "Asymmetry is the dominant experimental driver, so a low-risk mechanics cue is"
                " favored before stronger load changes.",
            )

        if acwr is not None and acwr > 1.25:
            return self._build_action(
                TrainingAction.REDUCE_SESSION_VOLUME,
                "Load is rising faster than the recent baseline, so a smaller session buffer is prudent.",
            )

        return self._build_action(
            TrainingAction.CONTINUE_MONITORING,
            "No dominant safety trigger was detected, so the plan can continue with monitoring.",
        )

    def _select_secondary_actions(
        self,
        risk: InjuryRiskOutput,
        athlete_state: AthleteTrainingState,
        primary_action: TrainingAction,
    ) -> list[RecommendedAction]:
        secondary_actions: list[RecommendedAction] = []
        seen_actions = {primary_action}
        pain_score = athlete_state.pain_status.pain_score
        pain_location = (athlete_state.pain_status.pain_location or "").lower()

        def maybe_add(action: TrainingAction, rationale: str) -> None:
            if action in seen_actions:
                return
            secondary_actions.append(self._build_action(action, rationale))
            seen_actions.add(action)

        if self._is_low_data_quality(risk, athlete_state):
            maybe_add(
                TrainingAction.RECOMMEND_RF_BIOMECHANICS_RETEST,
                "Low signal quality or model confidence should trigger a repeat biomechanics capture.",
            )

        if risk.overall_risk_level in {
            InjuryRiskLevel.ELEVATED,
            InjuryRiskLevel.HIGH,
            InjuryRiskLevel.CRITICAL,
        }:
            maybe_add(
                TrainingAction.SUGGEST_COACH_REVIEW,
                "Elevated proxy risk warrants coach review before making larger plan changes.",
            )

        if pain_score >= 4.0 or athlete_state.pain_status.modified_training:
            maybe_add(
                TrainingAction.RECOMMEND_SUBJECTIVE_PAIN_CHECK_IN,
                "Reported symptoms should be re-checked before the next session proceeds normally.",
            )

        if pain_score >= 6.0 or (athlete_state.pain_status.pain_duration_days or 0) >= 7:
            maybe_add(
                TrainingAction.SUGGEST_CLINICIAN_REVIEW,
                "Higher or persistent pain should be reviewed by a clinician or physiotherapist.",
            )

        if self._factor_value(risk, "asymmetry") >= 0.55:
            maybe_add(
                TrainingAction.RECOMMEND_JUMP_ASYMMETRY_TEST,
                "Asymmetry is elevated enough to justify an additional screening test.",
            )

        contact_time_score = self._factor_value(risk, "contact_time")
        if contact_time_score >= 0.65 and any(
            token in pain_location for token in ("calf", "achilles", "heel", "plantar")
        ):
            maybe_add(
                TrainingAction.RECOMMEND_CALF_READINESS_TEST,
                "Lower-leg symptoms plus contact-time elevation support a calf readiness screen.",
            )

        return secondary_actions

    def _build_drivers(
        self,
        risk: InjuryRiskOutput,
        athlete_state: AthleteTrainingState,
    ) -> list[RecommendationDriver]:
        drivers: list[RecommendationDriver] = []

        ranked_factors = sorted(
            risk.risk_factors,
            key=lambda factor: factor.value * max(factor.weight, 0.15),
            reverse=True,
        )
        for factor in ranked_factors[:3]:
            drivers.append(
                RecommendationDriver(
                    factor_id=factor.factor_id,
                    label=factor.label,
                    influence=_clamp(factor.value * max(factor.weight, 0.15)),
                    explanation=self._describe_risk_factor(factor),
                )
            )

        acwr = self._acute_chronic_ratio(athlete_state.training_load)
        if acwr is not None and acwr > 1.20:
            drivers.append(
                RecommendationDriver(
                    factor_id="acute_chronic_load_ratio",
                    label="Acute:chronic load ratio",
                    influence=_clamp((acwr - 1.0) / 0.50),
                    explanation=(
                        f"Acute load is {acwr:.2f}x chronic load, which narrows the current"
                        " load-capacity buffer."
                    ),
                )
            )

        if athlete_state.pain_status.pain_score >= 4.0:
            drivers.append(
                RecommendationDriver(
                    factor_id="pain_score",
                    label="Subjective pain check-in",
                    influence=_clamp(athlete_state.pain_status.pain_score / 10.0),
                    explanation=(
                        "Pain was reported alongside training and should constrain the recommended"
                        " progression."
                    ),
                )
            )

        return drivers[:4]

    def _estimate_confidence(
        self,
        risk: InjuryRiskOutput,
        athlete_state: AthleteTrainingState,
    ) -> float:
        signal_inputs = [risk.signal_quality_score]
        if athlete_state.signal_quality_score is not None:
            signal_inputs.append(athlete_state.signal_quality_score)

        signal_quality = _clamp(min(signal_inputs))
        context_completeness = sum(
            [
                athlete_state.training_load.acute_load is not None
                and athlete_state.training_load.chronic_load is not None,
                athlete_state.recovery.readiness_score is not None
                or athlete_state.recovery.sleep_duration_h is not None,
                athlete_state.pain_status is not None,
            ]
        ) / 3.0

        confidence = (
            0.45 * _clamp(risk.model_confidence)
            + 0.35 * signal_quality
            + 0.20 * context_completeness
        )
        if athlete_state.calibrated is False:
            confidence *= 0.85

        return _clamp(min(confidence, 0.85))

    @staticmethod
    def _acute_chronic_ratio(training_load: TrainingLoadState) -> Optional[float]:
        if not training_load.chronic_load or training_load.chronic_load <= 0.0:
            return None
        if training_load.acute_load is None:
            return None
        return training_load.acute_load / training_load.chronic_load

    @staticmethod
    def _factor_value(risk: InjuryRiskOutput, factor_id: str) -> float:
        for factor in risk.risk_factors:
            if factor.factor_id == factor_id:
                return factor.value
        return 0.0

    @staticmethod
    def _build_action(action: TrainingAction, rationale: str) -> RecommendedAction:
        return RecommendedAction(
            action=action,
            rationale=rationale,
            expected_tradeoff=_ACTION_TRADEOFFS[action],
        )

    @staticmethod
    def _is_low_data_quality(
        risk: InjuryRiskOutput,
        athlete_state: AthleteTrainingState,
    ) -> bool:
        signal_inputs = [risk.signal_quality_score]
        if athlete_state.signal_quality_score is not None:
            signal_inputs.append(athlete_state.signal_quality_score)

        return min(signal_inputs) < 0.45 or risk.model_confidence < 0.40

    @staticmethod
    def _describe_risk_factor(factor: InjuryRiskFactor) -> str:
        if factor.elevated:
            return f"{factor.label} is elevated in the experimental injury-risk model."
        return f"{factor.label} remains part of the recommendation context, even if not elevated."

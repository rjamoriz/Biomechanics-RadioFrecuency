"""
Injury Risk Estimation Model — biomechanics proxy-based approach.

Derives an injury risk score and per-articulation breakdown from
Wi-Fi CSI proxy metrics and optionally inferred joint angles.

All outputs are PROXY ESTIMATES and EXPERIMENTAL.
They are NOT clinical assessments, diagnoses, or treatment guidance.
Scores require independent validation before clinical use.

Algorithm:
  Stage 1 — Rule-based factor scoring from proxy metrics.
  Stage 2 — Optional refinement via inferred joint angle deviations
             from RUNNING_ANGLE_RANGES reference bounds.
  Stage 3 — Weighted aggregation into composite + per-articulation scores.
  Stage 4 — Confidence weighting based on signal quality + baseline readiness.
"""

from __future__ import annotations

import math
from dataclasses import dataclass, field
from enum import Enum
from typing import Dict, List, Optional

import numpy as np

from biomech_ml.joint_angles import JointAngles, RUNNING_ANGLE_RANGES
from biomech_ml.biomechanics_report import FatigueIndicators, SymmetrySummary


# ---------------------------------------------------------------------------
# Enums and levels
# ---------------------------------------------------------------------------

class InjuryRiskLevel(str, Enum):
    LOW = "low"
    MODERATE = "moderate"
    ELEVATED = "elevated"
    HIGH = "high"
    CRITICAL = "critical"


def classify_risk_level(score: float) -> InjuryRiskLevel:
    """Map continuous [0, 1] risk score to a discrete level."""
    if score < 0.20:
        return InjuryRiskLevel.LOW
    if score < 0.40:
        return InjuryRiskLevel.MODERATE
    if score < 0.60:
        return InjuryRiskLevel.ELEVATED
    if score < 0.80:
        return InjuryRiskLevel.HIGH
    return InjuryRiskLevel.CRITICAL


# ---------------------------------------------------------------------------
# Input features
# ---------------------------------------------------------------------------

@dataclass
class InjuryRiskFeatures:
    """
    Proxy metric features fed into the injury risk estimator.

    All fields carry their own meaning:
      - symmetry_proxy: 0 = full asymmetry, 1 = perfect symmetry
      - fatigue_drift_score: 0 = no drift, 1 = severe drift
      - form_stability_score: 0 = unstable, 1 = stable
      - contact_time_proxy_ms: ground contact duration estimate (ms)
      - flight_time_proxy_ms: flight-time estimate (ms)
      - step_interval_variability: CV of step intervals (0 = constant)
      - signal_quality_score: 0 = poor, 1 = excellent
      - joint_angles: optional inferred angles (experimental)
      - fatigue_indicators: optional session-level fatigue trends
      - symmetry_summary: optional session-level symmetry breakdown
    """
    symmetry_proxy: float = 1.0
    fatigue_drift_score: float = 0.0
    form_stability_score: float = 1.0
    contact_time_proxy_ms: float = 250.0
    flight_time_proxy_ms: float = 100.0
    step_interval_variability: float = 0.0
    signal_quality_score: float = 1.0

    # Optional — from inferred pose pipeline
    joint_angles: Optional[JointAngles] = None
    fatigue_indicators: Optional[FatigueIndicators] = None
    symmetry_summary: Optional[SymmetrySummary] = None


# ---------------------------------------------------------------------------
# Output types
# ---------------------------------------------------------------------------

@dataclass
class ArticulationRiskScore:
    """
    Injury risk estimate for a single joint region.
    Validation status is always 'experimental'.
    """
    joint: str                    # e.g. "knee_left", "hip_right", "lumbar"
    risk_score: float             # [0, 1]
    risk_level: InjuryRiskLevel
    confidence: float             # [0, 1]
    primary_driver: str           # which feature drove this score
    validation_status: str = "experimental"


@dataclass
class InjuryRiskFactor:
    """Single contributing factor with explainability metadata."""
    factor_id: str
    label: str
    value: float          # normalized factor score [0, 1]
    weight: float         # contribution weight [0, 1], sum ≤ 1.0
    elevated: bool        # True if above safe threshold
    description: str


@dataclass
class InjuryRiskOutput:
    """
    Full injury risk assessment output.
    Produced per-snapshot (realtime) or aggregated (session).
    """
    overall_risk_score: float
    overall_risk_level: InjuryRiskLevel
    articulation_risks: List[ArticulationRiskScore] = field(default_factory=list)
    risk_factors: List[InjuryRiskFactor] = field(default_factory=list)
    model_confidence: float = 0.0
    signal_quality_score: float = 0.0
    used_inferred_joint_angles: bool = False
    validation_status: str = "experimental"
    experimental: bool = True
    warnings: List[str] = field(default_factory=list)


# ---------------------------------------------------------------------------
# Scoring helpers
# ---------------------------------------------------------------------------

# Safe thresholds — values above/below these trigger risk elevation.
_SAFE_SYMMETRY_PROXY = 0.85          # below → asymmetry risk
_SAFE_FATIGUE_DRIFT = 0.30           # above → fatigue risk
_SAFE_FORM_STABILITY = 0.75          # below → form risk
_SAFE_CONTACT_TIME_RATIO = 1.25      # above mean → contact time anomaly
_MEAN_CONTACT_TIME_MS = 250.0        # typical reference (ms)
_SAFE_STEP_VARIABILITY = 0.12        # CV above this → load variability risk
_SAFE_FLIGHT_TIME_RATIO = 0.60       # flight-to-contact ratio below this → risk

# Factor weights — must sum to 1.0
_FACTOR_WEIGHTS = {
    "asymmetry":       0.25,
    "fatigue_drift":   0.20,
    "form_stability":  0.20,
    "contact_time":    0.15,
    "step_variability": 0.10,
    "joint_angles":    0.10,  # only active when joint angles are available
}


def _clamp(v: float, lo: float = 0.0, hi: float = 1.0) -> float:
    return max(lo, min(hi, v))


def _score_asymmetry(symmetry_proxy: float) -> tuple[float, bool]:
    """Higher asymmetry → higher risk. Returns (score, elevated)."""
    asymmetry = 1.0 - symmetry_proxy
    score = _clamp(asymmetry / (1.0 - _SAFE_SYMMETRY_PROXY + 1e-9))
    return score, symmetry_proxy < _SAFE_SYMMETRY_PROXY


def _score_fatigue(fatigue_drift: float) -> tuple[float, bool]:
    score = _clamp(fatigue_drift / 1.0)
    return score, fatigue_drift > _SAFE_FATIGUE_DRIFT


def _score_form(form_stability: float) -> tuple[float, bool]:
    instability = 1.0 - form_stability
    score = _clamp(instability / (1.0 - _SAFE_FORM_STABILITY + 1e-9))
    return score, form_stability < _SAFE_FORM_STABILITY


def _score_contact_time(contact_time_ms: float) -> tuple[float, bool]:
    """
    Elevated contact time relative to reference indicates loading risk.
    Below-average contact time with high speed can indicate impact risk.
    """
    ratio = contact_time_ms / _MEAN_CONTACT_TIME_MS
    if ratio > _SAFE_CONTACT_TIME_RATIO:
        score = _clamp((ratio - 1.0) / 0.5)
    elif ratio < 0.75:
        score = _clamp((0.75 - ratio) / 0.3)
    else:
        score = 0.0
    return score, ratio > _SAFE_CONTACT_TIME_RATIO or ratio < 0.75


def _score_step_variability(cv: float) -> tuple[float, bool]:
    score = _clamp(cv / 0.30)
    return score, cv > _SAFE_STEP_VARIABILITY


def _score_joint_angle_deviation(angles: JointAngles) -> tuple[float, Dict[str, float]]:
    """
    Compute average deviation of inferred joint angles from RUNNING_ANGLE_RANGES.
    Returns (overall_deviation_score, per_angle_deviation_scores).
    """
    per_angle: Dict[str, float] = {}
    total_score = 0.0
    valid_count = 0

    angle_map = {
        "inferred_left_knee_angle":  getattr(angles, "inferred_left_knee_angle", float("nan")),
        "inferred_right_knee_angle": getattr(angles, "inferred_right_knee_angle", float("nan")),
        "inferred_left_hip_angle":   getattr(angles, "inferred_left_hip_angle", float("nan")),
        "inferred_right_hip_angle":  getattr(angles, "inferred_right_hip_angle", float("nan")),
        "inferred_trunk_lean_angle": getattr(angles, "inferred_trunk_lean_angle", float("nan")),
        "inferred_pelvic_tilt_angle": getattr(angles, "inferred_pelvic_tilt_angle", float("nan")),
    }

    for angle_name, value in angle_map.items():
        if math.isnan(value):
            continue
        if angle_name not in RUNNING_ANGLE_RANGES:
            continue
        lo, hi = RUNNING_ANGLE_RANGES[angle_name]
        range_width = max(hi - lo, 1.0)
        if value < lo:
            dev = (lo - value) / range_width
        elif value > hi:
            dev = (value - hi) / range_width
        else:
            dev = 0.0
        per_angle[angle_name] = _clamp(dev)
        total_score += per_angle[angle_name]
        valid_count += 1

    if valid_count == 0:
        return 0.0, {}
    return _clamp(total_score / valid_count), per_angle


# ---------------------------------------------------------------------------
# Per-articulation risk decomposition
# ---------------------------------------------------------------------------

def _articulation_risks(
    features: InjuryRiskFeatures,
    factor_scores: Dict[str, float],
    angle_deviations: Dict[str, float],
    base_confidence: float,
) -> List[ArticulationRiskScore]:
    """
    Decompose composite factors into joint-region scores.

    Mapping rationale:
      knee   — contact time + asymmetry + knee angle deviation
      hip    — asymmetry + hip angle deviation + pelvic tilt
      ankle  — contact time + flight time ratio + step variability
      lumbar — trunk lean + fatigue drift + form stability
    """
    results: List[ArticulationRiskScore] = []

    asymmetry_s = factor_scores.get("asymmetry", 0.0)
    fatigue_s   = factor_scores.get("fatigue_drift", 0.0)
    form_s      = factor_scores.get("form_stability", 0.0)
    contact_s   = factor_scores.get("contact_time", 0.0)
    variability_s = factor_scores.get("step_variability", 0.0)

    # --- Knees ---
    left_knee_angle_dev  = angle_deviations.get("inferred_left_knee_angle", 0.0)
    right_knee_angle_dev = angle_deviations.get("inferred_right_knee_angle", 0.0)

    knee_left_score = _clamp(
        0.35 * asymmetry_s + 0.30 * contact_s + 0.25 * left_knee_angle_dev + 0.10 * variability_s
    )
    knee_right_score = _clamp(
        0.35 * asymmetry_s + 0.30 * contact_s + 0.25 * right_knee_angle_dev + 0.10 * variability_s
    )

    for joint, score in [("knee_left", knee_left_score), ("knee_right", knee_right_score)]:
        results.append(ArticulationRiskScore(
            joint=joint,
            risk_score=score,
            risk_level=classify_risk_level(score),
            confidence=base_confidence * 0.85,
            primary_driver="contact_time" if contact_s >= asymmetry_s else "asymmetry",
        ))

    # --- Hips ---
    left_hip_angle_dev   = angle_deviations.get("inferred_left_hip_angle", 0.0)
    right_hip_angle_dev  = angle_deviations.get("inferred_right_hip_angle", 0.0)
    pelvic_tilt_dev      = angle_deviations.get("inferred_pelvic_tilt_angle", 0.0)

    hip_left_score = _clamp(
        0.35 * asymmetry_s + 0.30 * left_hip_angle_dev + 0.20 * pelvic_tilt_dev + 0.15 * fatigue_s
    )
    hip_right_score = _clamp(
        0.35 * asymmetry_s + 0.30 * right_hip_angle_dev + 0.20 * pelvic_tilt_dev + 0.15 * fatigue_s
    )

    for joint, score in [("hip_left", hip_left_score), ("hip_right", hip_right_score)]:
        results.append(ArticulationRiskScore(
            joint=joint,
            risk_score=score,
            risk_level=classify_risk_level(score),
            confidence=base_confidence * 0.80,
            primary_driver="asymmetry" if asymmetry_s >= pelvic_tilt_dev else "pelvic_tilt",
        ))

    # --- Ankles ---
    flight_to_contact = features.flight_time_proxy_ms / max(features.contact_time_proxy_ms, 1.0)
    impact_risk = _clamp((0.60 - flight_to_contact) / 0.30) if flight_to_contact < 0.60 else 0.0

    ankle_score = _clamp(
        0.40 * contact_s + 0.30 * impact_risk + 0.20 * variability_s + 0.10 * asymmetry_s
    )

    for joint in ["ankle_left", "ankle_right"]:
        results.append(ArticulationRiskScore(
            joint=joint,
            risk_score=ankle_score,
            risk_level=classify_risk_level(ankle_score),
            confidence=base_confidence * 0.75,
            primary_driver="contact_time" if contact_s >= impact_risk else "impact_loading",
        ))

    # --- Lumbar ---
    trunk_lean_dev = angle_deviations.get("inferred_trunk_lean_angle", 0.0)

    lumbar_score = _clamp(
        0.30 * fatigue_s + 0.30 * trunk_lean_dev + 0.25 * form_s + 0.15 * asymmetry_s
    )

    results.append(ArticulationRiskScore(
        joint="lumbar",
        risk_score=lumbar_score,
        risk_level=classify_risk_level(lumbar_score),
        confidence=base_confidence * 0.75,
        primary_driver="trunk_lean" if trunk_lean_dev >= fatigue_s else "fatigue_drift",
    ))

    return results


# ---------------------------------------------------------------------------
# Main estimator
# ---------------------------------------------------------------------------

class InjuryRiskEstimator:
    """
    Stateless estimator that combines proxy metrics and optional inferred
    joint angles into a multi-level injury risk assessment.

    This is a rule-based + weighted scoring approach.
    It does NOT use a trained neural network; it derives risk from
    explicit biomechanical heuristics calibrated on laboratory literature.

    For production deployment with labeled injury outcome data, replace or
    augment with a trained InjuryRiskModel (see below).
    """

    def estimate(self, features: InjuryRiskFeatures) -> InjuryRiskOutput:
        """Compute injury risk from a single proxy metrics snapshot."""

        # Stage 1: Score individual factors
        asymmetry_score, asymmetry_elevated = _score_asymmetry(features.symmetry_proxy)
        fatigue_score,   fatigue_elevated   = _score_fatigue(features.fatigue_drift_score)
        form_score,      form_elevated      = _score_form(features.form_stability_score)
        contact_score,   contact_elevated   = _score_contact_time(features.contact_time_proxy_ms)
        variability_score, variab_elevated  = _score_step_variability(features.step_interval_variability)

        # Stage 2: Optional joint angle refinement
        angle_overall_score = 0.0
        angle_deviations: Dict[str, float] = {}
        used_joint_angles = False

        if features.joint_angles is not None and features.joint_angles.overall_confidence > 0.3:
            angle_overall_score, angle_deviations = _score_joint_angle_deviation(features.joint_angles)
            used_joint_angles = True

        # Stage 3: Weighted composite score
        if used_joint_angles:
            weights = _FACTOR_WEIGHTS
        else:
            # Redistribute joint-angle weight across remaining factors
            ja_weight = _FACTOR_WEIGHTS["joint_angles"]
            redistribute = ja_weight / (len(_FACTOR_WEIGHTS) - 1)
            weights = {k: v + redistribute for k, v in _FACTOR_WEIGHTS.items() if k != "joint_angles"}

        factor_scores = {
            "asymmetry":        asymmetry_score,
            "fatigue_drift":    fatigue_score,
            "form_stability":   form_score,
            "contact_time":     contact_score,
            "step_variability": variability_score,
        }

        if used_joint_angles:
            factor_scores["joint_angles"] = angle_overall_score

        overall_score = sum(weights.get(k, 0.0) * v for k, v in factor_scores.items())
        overall_score = _clamp(overall_score)

        # Stage 4: Confidence weighting
        base_confidence = features.signal_quality_score
        model_confidence = base_confidence * (0.8 + 0.2 * (1.0 - overall_score))

        # Build InjuryRiskFactor list
        risk_factors: List[InjuryRiskFactor] = [
            InjuryRiskFactor(
                factor_id="asymmetry",
                label="Gait Asymmetry",
                value=asymmetry_score,
                weight=weights.get("asymmetry", 0.0),
                elevated=asymmetry_elevated,
                description=f"Symmetry proxy: {features.symmetry_proxy:.2f} "
                            f"({'below' if asymmetry_elevated else 'within'} safe range ≥{_SAFE_SYMMETRY_PROXY})",
            ),
            InjuryRiskFactor(
                factor_id="fatigue_drift",
                label="Fatigue Drift",
                value=fatigue_score,
                weight=weights.get("fatigue_drift", 0.0),
                elevated=fatigue_elevated,
                description=f"Fatigue drift score: {features.fatigue_drift_score:.2f} "
                            f"({'above' if fatigue_elevated else 'within'} threshold {_SAFE_FATIGUE_DRIFT})",
            ),
            InjuryRiskFactor(
                factor_id="form_stability",
                label="Form Stability",
                value=form_score,
                weight=weights.get("form_stability", 0.0),
                elevated=form_elevated,
                description=f"Form stability: {features.form_stability_score:.2f} "
                            f"({'below' if form_elevated else 'within'} safe range ≥{_SAFE_FORM_STABILITY})",
            ),
            InjuryRiskFactor(
                factor_id="contact_time",
                label="Ground Contact Time",
                value=contact_score,
                weight=weights.get("contact_time", 0.0),
                elevated=contact_elevated,
                description=f"Contact time proxy: {features.contact_time_proxy_ms:.0f} ms "
                            f"(reference ~{_MEAN_CONTACT_TIME_MS:.0f} ms)",
            ),
            InjuryRiskFactor(
                factor_id="step_variability",
                label="Step Interval Variability",
                value=variability_score,
                weight=weights.get("step_variability", 0.0),
                elevated=variab_elevated,
                description=f"Step interval CV: {features.step_interval_variability:.3f} "
                            f"({'above' if variab_elevated else 'within'} safe range ≤{_SAFE_STEP_VARIABILITY})",
            ),
        ]

        if used_joint_angles:
            risk_factors.append(InjuryRiskFactor(
                factor_id="joint_angles",
                label="Inferred Joint Angle Deviations",
                value=angle_overall_score,
                weight=weights.get("joint_angles", 0.0),
                elevated=angle_overall_score > 0.3,
                description=f"Mean angle deviation from running reference ranges: {angle_overall_score:.2f}. "
                            "Based on inferred (experimental) keypoint data.",
            ))

        # Stage 5: Per-articulation decomposition
        articulation_risks = _articulation_risks(
            features, factor_scores, angle_deviations, base_confidence
        )

        # Warnings
        warnings: List[str] = []
        if base_confidence < 0.4:
            warnings.append("Low signal quality — injury risk estimate reliability is reduced.")
        if used_joint_angles and features.joint_angles is not None:
            if features.joint_angles.overall_confidence < 0.5:
                warnings.append(
                    "Inferred joint angles used for scoring have low confidence."
                )
        if overall_score >= 0.6:
            warnings.append(
                "Elevated injury risk signal detected. "
                "Consider reviewing form, reducing load, or consulting a sports-medicine professional."
            )

        return InjuryRiskOutput(
            overall_risk_score=overall_score,
            overall_risk_level=classify_risk_level(overall_score),
            articulation_risks=articulation_risks,
            risk_factors=risk_factors,
            model_confidence=_clamp(model_confidence),
            signal_quality_score=features.signal_quality_score,
            used_inferred_joint_angles=used_joint_angles,
            validation_status="experimental",
            experimental=True,
            warnings=warnings,
        )


# ---------------------------------------------------------------------------
# Placeholder for future trained model
# ---------------------------------------------------------------------------

class InjuryRiskModel:
    """
    Future: trainable neural network for injury risk prediction.

    When labeled injury outcome data is available, this class
    should be trained on session biomechanics features and
    replace or complement InjuryRiskEstimator.

    Until then, inference delegates to InjuryRiskEstimator.
    """

    def __init__(self) -> None:
        self._estimator = InjuryRiskEstimator()

    def predict(self, features: InjuryRiskFeatures) -> InjuryRiskOutput:
        """Delegate to rule-based estimator until training data is available."""
        return self._estimator.estimate(features)

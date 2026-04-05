"""
Biomechanics report generator — structured session summaries.

Aggregates inferred joint angles, stride metrics, and proxy metrics
into a session-level biomechanics report.

All outputs are EXPERIMENTAL and INFERRED from Wi-Fi CSI sensing.
"""

from __future__ import annotations

import math
from dataclasses import dataclass, field
from typing import Dict, List, Optional

import numpy as np

from biomech_ml.joint_angles import JointAngles, RUNNING_ANGLE_RANGES
from biomech_ml.stride_kinematics import StrideMetrics


# ---------------------------------------------------------------------------
# Dataclasses
# ---------------------------------------------------------------------------

@dataclass
class AngleSummary:
    """Descriptive statistics for a single joint angle across a session."""
    mean: float = float("nan")
    std: float = float("nan")
    min_val: float = float("nan")
    max_val: float = float("nan")
    sample_count: int = 0


@dataclass
class SymmetrySummary:
    """Left vs right differences for paired joint angles."""
    inferred_knee_angle_diff_mean: float = float("nan")
    inferred_hip_angle_diff_mean: float = float("nan")
    inferred_elbow_angle_diff_mean: float = float("nan")


@dataclass
class FatigueIndicators:
    """Fatigue-related trend indicators (experimental)."""
    stride_variability_trend: float = float("nan")  # slope of stride-time CV
    trunk_lean_drift: float = float("nan")  # slope of trunk lean over time
    validation_status: str = "experimental"


@dataclass
class SessionBiomechanicsReport:
    """Full session biomechanics summary — all values are experimental estimates."""

    # Joint angle summaries
    angle_summaries: Dict[str, AngleSummary] = field(default_factory=dict)

    # Stride metric summaries
    estimated_stride_time_mean: float = float("nan")
    estimated_stride_time_std: float = float("nan")
    estimated_step_time_mean: float = float("nan")
    estimated_step_time_std: float = float("nan")
    estimated_stance_phase_pct_mean: float = float("nan")
    estimated_swing_phase_pct_mean: float = float("nan")
    estimated_duty_factor_mean: float = float("nan")
    estimated_vertical_oscillation_cm_mean: float = float("nan")

    symmetry_summary: SymmetrySummary = field(default_factory=SymmetrySummary)
    fatigue_indicators: FatigueIndicators = field(default_factory=FatigueIndicators)

    form_quality_score: float = float("nan")  # composite 0–100

    confidence: float = 0.0
    validation_status: str = "experimental"
    warnings: List[str] = field(default_factory=list)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

_ANGLE_FIELDS = [
    "inferred_left_knee_angle",
    "inferred_right_knee_angle",
    "inferred_left_hip_angle",
    "inferred_right_hip_angle",
    "inferred_left_elbow_angle",
    "inferred_right_elbow_angle",
    "inferred_trunk_lean_angle",
    "inferred_pelvic_tilt_angle",
]

_PAIRED_ANGLES = [
    ("inferred_left_knee_angle", "inferred_right_knee_angle", "knee"),
    ("inferred_left_hip_angle", "inferred_right_hip_angle", "hip"),
    ("inferred_left_elbow_angle", "inferred_right_elbow_angle", "elbow"),
]


def _safe_array(values: List[float]) -> np.ndarray:
    """Filter NaN and return numpy array, or empty array."""
    arr = np.array(values, dtype=np.float64)
    return arr[~np.isnan(arr)]


def _linear_slope(values: np.ndarray) -> float:
    """Slope of linear fit over indices.  NaN if too few points."""
    if len(values) < 2:
        return float("nan")
    x = np.arange(len(values), dtype=np.float64)
    # least-squares slope
    x_mean = x.mean()
    y_mean = values.mean()
    denom = float(np.sum((x - x_mean) ** 2))
    if denom < 1e-12:
        return float("nan")
    return float(np.sum((x - x_mean) * (values - y_mean)) / denom)


# ---------------------------------------------------------------------------
# Report generator
# ---------------------------------------------------------------------------

class BiomechanicsReportGenerator:
    """Generates structured biomechanics summaries from session data."""

    def generate_session_summary(
        self,
        joint_angles_series: List[JointAngles],
        stride_metrics_series: List[StrideMetrics],
        proxy_metrics: Optional[Dict[str, float]] = None,
    ) -> SessionBiomechanicsReport:
        """Aggregate per-frame angles and per-stride metrics into a report.

        Args:
            joint_angles_series: list of JointAngles (one per frame/sample).
            stride_metrics_series: list of StrideMetrics (one per stride/window).
            proxy_metrics: optional dict of session-level proxy metrics.

        Returns:
            SessionBiomechanicsReport.
        """
        report = SessionBiomechanicsReport()

        # ---- Joint angle summaries ----
        report.angle_summaries = self._summarize_angles(joint_angles_series)

        # ---- Symmetry ----
        report.symmetry_summary = self._compute_symmetry(joint_angles_series)

        # ---- Stride metrics ----
        self._summarize_strides(stride_metrics_series, report)

        # ---- Fatigue indicators ----
        report.fatigue_indicators = self._detect_fatigue(
            joint_angles_series, stride_metrics_series
        )

        # ---- Form quality score ----
        report.form_quality_score = self._compute_form_score(report)

        # ---- Confidence ----
        confs = [a.overall_confidence for a in joint_angles_series if a.overall_confidence > 0]
        confs += [s.confidence for s in stride_metrics_series if s.confidence > 0]
        report.confidence = float(np.mean(confs)) if confs else 0.0

        # ---- Warnings ----
        report.warnings = self._generate_warnings(report)

        return report

    # ------------------------------------------------------------------
    # Internal methods
    # ------------------------------------------------------------------

    def _summarize_angles(
        self, series: List[JointAngles]
    ) -> Dict[str, AngleSummary]:
        summaries: Dict[str, AngleSummary] = {}
        for field_name in _ANGLE_FIELDS:
            values = _safe_array([getattr(a, field_name) for a in series])
            s = AngleSummary(sample_count=len(values))
            if len(values) > 0:
                s.mean = float(np.mean(values))
                s.std = float(np.std(values))
                s.min_val = float(np.min(values))
                s.max_val = float(np.max(values))
            summaries[field_name] = s
        return summaries

    def _compute_symmetry(self, series: List[JointAngles]) -> SymmetrySummary:
        sym = SymmetrySummary()
        for left_f, right_f, label in _PAIRED_ANGLES:
            diffs = _safe_array([
                abs(getattr(a, left_f) - getattr(a, right_f))
                for a in series
                if not math.isnan(getattr(a, left_f)) and not math.isnan(getattr(a, right_f))
            ])
            if len(diffs) > 0:
                setattr(sym, f"inferred_{label}_angle_diff_mean", float(np.mean(diffs)))
        return sym

    def _summarize_strides(
        self, series: List[StrideMetrics], report: SessionBiomechanicsReport
    ) -> None:
        if not series:
            return

        stride_times = _safe_array([s.estimated_stride_time_s for s in series])
        step_times = _safe_array([s.estimated_step_time_s for s in series])
        stance_vals = _safe_array([s.estimated_stance_phase_pct for s in series])
        swing_vals = _safe_array([s.estimated_swing_phase_pct for s in series])
        duty_vals = _safe_array([s.estimated_duty_factor for s in series])
        vo_vals = _safe_array([s.estimated_vertical_oscillation_cm for s in series])

        if len(stride_times) > 0:
            report.estimated_stride_time_mean = float(np.mean(stride_times))
            report.estimated_stride_time_std = float(np.std(stride_times))
        if len(step_times) > 0:
            report.estimated_step_time_mean = float(np.mean(step_times))
            report.estimated_step_time_std = float(np.std(step_times))
        if len(stance_vals) > 0:
            report.estimated_stance_phase_pct_mean = float(np.mean(stance_vals))
        if len(swing_vals) > 0:
            report.estimated_swing_phase_pct_mean = float(np.mean(swing_vals))
        if len(duty_vals) > 0:
            report.estimated_duty_factor_mean = float(np.mean(duty_vals))
        if len(vo_vals) > 0:
            report.estimated_vertical_oscillation_cm_mean = float(np.mean(vo_vals))

    def _detect_fatigue(
        self,
        angle_series: List[JointAngles],
        stride_series: List[StrideMetrics],
    ) -> FatigueIndicators:
        fi = FatigueIndicators()

        # Stride variability trend: slope of stride-time coefficient of variation
        stride_times = _safe_array([s.estimated_stride_time_s for s in stride_series])
        if len(stride_times) >= 4:
            # Windowed CV (rolling windows of 3)
            window = 3
            cvs: List[float] = []
            for i in range(len(stride_times) - window + 1):
                w = stride_times[i : i + window]
                mean_w = float(np.mean(w))
                if mean_w > 1e-9:
                    cvs.append(float(np.std(w) / mean_w))
            if len(cvs) >= 2:
                fi.stride_variability_trend = _linear_slope(np.array(cvs))

        # Trunk lean drift
        trunk_vals = _safe_array([a.inferred_trunk_lean_angle for a in angle_series])
        if len(trunk_vals) >= 4:
            fi.trunk_lean_drift = _linear_slope(trunk_vals)

        return fi

    def _compute_form_score(self, report: SessionBiomechanicsReport) -> float:
        """Composite 0–100 form quality score.

        Components (equal weight):
          1. Symmetry penalty (lower is worse)
          2. Stride variability penalty
          3. Trunk lean consistency
        """
        scores: List[float] = []

        # Symmetry — penalize large L/R differences
        sym = report.symmetry_summary
        for attr in ("inferred_knee_angle_diff_mean", "inferred_hip_angle_diff_mean", "inferred_elbow_angle_diff_mean"):
            diff = getattr(sym, attr)
            if not math.isnan(diff):
                # 0° diff → 100, ≥15° diff → 0
                scores.append(max(0.0, 100.0 * (1.0 - diff / 15.0)))

        # Stride variability — CV of stride time
        if not math.isnan(report.estimated_stride_time_mean) and not math.isnan(report.estimated_stride_time_std):
            mean_st = report.estimated_stride_time_mean
            if mean_st > 1e-9:
                cv = report.estimated_stride_time_std / mean_st
                # CV 0 → 100, CV ≥ 0.15 → 0
                scores.append(max(0.0, 100.0 * (1.0 - cv / 0.15)))

        # Trunk lean consistency — small std is better
        trunk_summary = report.angle_summaries.get("inferred_trunk_lean_angle")
        if trunk_summary and not math.isnan(trunk_summary.std):
            # std 0 → 100, std ≥ 5° → 0
            scores.append(max(0.0, 100.0 * (1.0 - trunk_summary.std / 5.0)))

        if not scores:
            return float("nan")
        return float(np.clip(np.mean(scores), 0.0, 100.0))

    def _generate_warnings(self, report: SessionBiomechanicsReport) -> List[str]:
        warnings: List[str] = []

        sym = report.symmetry_summary
        if not math.isnan(sym.inferred_knee_angle_diff_mean) and sym.inferred_knee_angle_diff_mean > 8.0:
            warnings.append(
                f"High knee angle asymmetry detected (mean diff {sym.inferred_knee_angle_diff_mean:.1f}°)"
            )
        if not math.isnan(sym.inferred_hip_angle_diff_mean) and sym.inferred_hip_angle_diff_mean > 8.0:
            warnings.append(
                f"High hip angle asymmetry detected (mean diff {sym.inferred_hip_angle_diff_mean:.1f}°)"
            )

        fi = report.fatigue_indicators
        if not math.isnan(fi.trunk_lean_drift) and fi.trunk_lean_drift > 0.05:
            warnings.append("Trunk lean increasing over time — possible fatigue")
        if not math.isnan(fi.stride_variability_trend) and fi.stride_variability_trend > 0.01:
            warnings.append("Stride variability increasing — possible fatigue")

        # Out-of-range angle means
        for angle_name, (lo, hi) in RUNNING_ANGLE_RANGES.items():
            summary = report.angle_summaries.get(angle_name)
            if summary and not math.isnan(summary.mean):
                if summary.mean < lo or summary.mean > hi:
                    warnings.append(
                        f"{angle_name} mean ({summary.mean:.1f}°) outside reference range [{lo}°, {hi}°]"
                    )

        return warnings

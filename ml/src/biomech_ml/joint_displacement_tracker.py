"""
Joint displacement longitudinal tracker.

Analyzes per-joint displacement-from-baseline trends across multiple sessions
and produces injury-risk signals based on cumulative drift patterns.

All outputs are PROXY ESTIMATES.  Validation status: experimental.
Do not use for clinical assessment or medical diagnosis.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import date
from typing import Dict, List, Optional

import numpy as np


# ─────────────────────────────────────────────────────────────────────────────
# Data contracts
# ─────────────────────────────────────────────────────────────────────────────

TRACKED_JOINTS = [
    "left_knee",
    "right_knee",
    "left_hip",
    "right_hip",
    "left_ankle",
    "right_ankle",
    "lower_back",
]

RiskLevel = str  # "normal" | "elevated" | "high"


@dataclass
class JointDisplacementRecord:
    """One session's mean proxy displacement for a single joint."""

    session_date: date
    joint_name: str
    mean_angle_deg: float
    peak_force_n: float
    displacement_from_baseline_deg: float
    risk_level: RiskLevel
    confidence: float  # 0.0–1.0
    speed_kmh: float = 0.0
    incline_percent: float = 0.0


@dataclass
class JointDriftSummary:
    """Drift analysis result for one joint over a time window."""

    joint_name: str
    mean_displacement_deg: float
    slope_deg_per_session: float  # Positive = worsening drift over time
    std_displacement_deg: float
    sample_count: int
    risk_signal: RiskLevel
    # Injury-risk proxy 0.0–1.0.  Experimental heuristic, not validated.
    injury_risk_proxy: float
    confidence: float
    validation_status: str = "experimental"
    disclaimer: str = (
        "Displacement drift is a proxy signal inferred from Wi-Fi CSI estimates. "
        "It carries substantial uncertainty and is not a clinical injury prediction."
    )


@dataclass
class AthleteDriftReport:
    """Full drift report for one athlete across all joints."""

    athlete_id: str
    window_sessions: int
    joint_summaries: Dict[str, JointDriftSummary] = field(default_factory=dict)
    anomalous_joints: List[str] = field(default_factory=list)
    overall_risk_signal: RiskLevel = "normal"
    bilateral_asymmetry_flag: bool = False
    validation_status: str = "experimental"


# ─────────────────────────────────────────────────────────────────────────────
# Tracker
# ─────────────────────────────────────────────────────────────────────────────


class JointDisplacementTracker:
    """
    Computes longitudinal drift and injury-risk proxy signals from a sequence
    of per-session joint displacement records.

    Usage::

        records: list[JointDisplacementRecord] = ...
        tracker = JointDisplacementTracker()
        report = tracker.build_athlete_report("athlete-001", records)
    """

    # Heuristic thresholds for drift-based risk signals (experimental).
    SLOPE_ELEVATED_DEG_PER_SESSION = 0.8
    SLOPE_HIGH_DEG_PER_SESSION = 1.5
    MEAN_ELEVATED_DEG = 4.0
    MEAN_HIGH_DEG = 8.0
    ASYMMETRY_THRESHOLD_DEG = 6.0  # L vs R mean difference triggers asymmetry flag

    def build_athlete_report(
        self,
        athlete_id: str,
        records: List[JointDisplacementRecord],
        min_sessions: int = 3,
    ) -> AthleteDriftReport:
        """
        Build a complete drift report for one athlete from their displacement history.

        :param athlete_id: Opaque athlete identifier.
        :param records: All joint displacement records (any joints, any dates).
        :param min_sessions: Minimum samples required to compute a slope.
        :returns: AthleteDriftReport with per-joint summaries, anomalies, overall risk.
        """
        report = AthleteDriftReport(
            athlete_id=athlete_id,
            window_sessions=len({r.session_date for r in records}),
        )

        # Group by joint
        by_joint: Dict[str, List[JointDisplacementRecord]] = {j: [] for j in TRACKED_JOINTS}
        for r in records:
            if r.joint_name in by_joint:
                by_joint[r.joint_name].append(r)

        joint_summaries: Dict[str, JointDriftSummary] = {}
        for joint, recs in by_joint.items():
            if not recs:
                continue
            summary = self._compute_joint_drift(joint, recs, min_sessions)
            joint_summaries[joint] = summary

        report.joint_summaries = joint_summaries
        report.anomalous_joints = self.flag_anomalous_joints(joint_summaries)
        report.overall_risk_signal = self._aggregate_risk(joint_summaries)
        report.bilateral_asymmetry_flag = self._check_bilateral_asymmetry(joint_summaries)
        return report

    def compute_drift_trend(
        self, records: List[JointDisplacementRecord]
    ) -> Dict[str, Dict[str, float]]:
        """
        Compute drift slope per joint.

        :returns: dict[joint_name -> {"slope": float, "mean": float, "std": float}]
        """
        by_joint: Dict[str, List[float]] = {j: [] for j in TRACKED_JOINTS}
        for r in records:
            if r.joint_name in by_joint:
                by_joint[r.joint_name].append(r.displacement_from_baseline_deg)

        result: Dict[str, Dict[str, float]] = {}
        for joint, disps in by_joint.items():
            if len(disps) < 2:
                continue
            arr = np.asarray(disps, dtype=float)
            result[joint] = {
                "slope": float(self._ols_slope(arr)),
                "mean": float(np.mean(arr)),
                "std": float(np.std(arr)),
            }
        return result

    def predict_injury_risk_from_drift(
        self, drift: Dict[str, Dict[str, float]]
    ) -> Dict[str, float]:
        """
        Heuristic injury-risk proxy per joint from drift statistics.

        Risk proxy 0.0–1.0 is NOT a validated injury prediction model.
        It is a decision-support signal for coaches and the RL layer.

        :param drift: Output of compute_drift_trend().
        :returns: dict[joint_name -> risk_proxy_0_to_1]
        """
        risks: Dict[str, float] = {}
        for joint, stats in drift.items():
            slope = stats.get("slope", 0.0)
            mean = stats.get("mean", 0.0)
            # Normalise slope contribution (cap at HIGH threshold)
            slope_score = min(1.0, abs(slope) / self.SLOPE_HIGH_DEG_PER_SESSION)
            # Normalise mean displacement contribution
            mean_score = min(1.0, abs(mean) / self.MEAN_HIGH_DEG)
            # Weighted combination — heuristic, not validated
            risk = 0.55 * slope_score + 0.45 * mean_score
            risks[joint] = round(float(risk), 3)
        return risks

    def flag_anomalous_joints(
        self,
        joint_summaries: Dict[str, JointDriftSummary],
    ) -> List[str]:
        """
        Return joints with 'elevated' or 'high' risk signal.
        """
        return [
            joint
            for joint, summary in joint_summaries.items()
            if summary.risk_signal in ("elevated", "high")
        ]

    # ── Private helpers ───────────────────────────────────────────────────────

    def _compute_joint_drift(
        self,
        joint_name: str,
        records: List[JointDisplacementRecord],
        min_sessions: int,
    ) -> JointDriftSummary:
        disps = np.asarray(
            [r.displacement_from_baseline_deg for r in records], dtype=float
        )
        mean_disp = float(np.mean(disps))
        std_disp = float(np.std(disps))
        slope = float(self._ols_slope(disps)) if len(disps) >= min_sessions else 0.0
        avg_conf = float(np.mean([r.confidence for r in records]))

        risk_signal = self._classify_risk(mean_disp, slope)

        slope_score = min(1.0, abs(slope) / self.SLOPE_HIGH_DEG_PER_SESSION)
        mean_score = min(1.0, abs(mean_disp) / self.MEAN_HIGH_DEG)
        injury_risk_proxy = round(0.55 * slope_score + 0.45 * mean_score, 3)

        return JointDriftSummary(
            joint_name=joint_name,
            mean_displacement_deg=round(mean_disp, 2),
            slope_deg_per_session=round(slope, 3),
            std_displacement_deg=round(std_disp, 2),
            sample_count=len(records),
            risk_signal=risk_signal,
            injury_risk_proxy=injury_risk_proxy,
            confidence=round(avg_conf, 3),
        )

    def _classify_risk(self, mean_deg: float, slope: float) -> RiskLevel:
        if abs(mean_deg) >= self.MEAN_HIGH_DEG or slope >= self.SLOPE_HIGH_DEG_PER_SESSION:
            return "high"
        if abs(mean_deg) >= self.MEAN_ELEVATED_DEG or slope >= self.SLOPE_ELEVATED_DEG_PER_SESSION:
            return "elevated"
        return "normal"

    def _aggregate_risk(self, summaries: Dict[str, JointDriftSummary]) -> RiskLevel:
        levels = [s.risk_signal for s in summaries.values()]
        if "high" in levels:
            return "high"
        if "elevated" in levels:
            return "elevated"
        return "normal"

    def _check_bilateral_asymmetry(
        self, summaries: Dict[str, JointDriftSummary]
    ) -> bool:
        pairs = [("left_knee", "right_knee"), ("left_hip", "right_hip"), ("left_ankle", "right_ankle")]
        for left, right in pairs:
            if left in summaries and right in summaries:
                diff = abs(
                    summaries[left].mean_displacement_deg
                    - summaries[right].mean_displacement_deg
                )
                if diff >= self.ASYMMETRY_THRESHOLD_DEG:
                    return True
        return False

    @staticmethod
    def _ols_slope(arr: np.ndarray) -> float:
        """Ordinary-least-squares slope with time index as x-axis."""
        n = len(arr)
        if n < 2:
            return 0.0
        x = np.arange(n, dtype=float)
        xm, ym = x.mean(), arr.mean()
        denom = float(np.sum((x - xm) ** 2))
        if denom == 0:
            return 0.0
        return float(np.sum((x - xm) * (arr - ym)) / denom)

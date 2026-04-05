"""
Stride kinematics — gait event detection and stride-level metrics.

Computes gait cycle parameters from inferred COCO keypoint sequences
estimated via Wi-Fi CSI sensing.

All outputs are EXPERIMENTAL — derived from Wi-Fi pose estimation,
not from force plates, pressure insoles, or optical motion capture.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Dict, List, Optional

import numpy as np

# COCO keypoint indices (ankle only needed here, hips for vertical osc)
LEFT_HIP = 11
RIGHT_HIP = 12
LEFT_ANKLE = 15
RIGHT_ANKLE = 16

MINIMUM_STRIDE_FRAMES = 3  # discard very short intervals as noise


# ---------------------------------------------------------------------------
# Dataclasses
# ---------------------------------------------------------------------------

@dataclass
class GaitEvent:
    """A detected gait event (foot strike or toe off).

    All events are inferred — not measured by force plate.
    """
    event_type: str  # 'foot_strike' | 'toe_off'
    side: str  # 'left' | 'right'
    frame_idx: int
    timestamp_s: float
    confidence: float = 0.0
    validation_status: str = "experimental"


@dataclass
class StrideMetrics:
    """Stride-level biomechanics summary.

    All values are EXPERIMENTAL proxy estimates.
    """
    estimated_stride_time_s: float = float("nan")
    estimated_step_time_s: float = float("nan")
    estimated_stance_phase_pct: float = float("nan")
    estimated_swing_phase_pct: float = float("nan")
    estimated_double_support_pct: float = float("nan")
    estimated_duty_factor: float = float("nan")
    estimated_vertical_oscillation_cm: float = float("nan")

    confidence: float = 0.0
    validation_status: str = "experimental"


# ---------------------------------------------------------------------------
# Gait event detection
# ---------------------------------------------------------------------------

def _smooth(signal: np.ndarray, kernel_size: int = 5) -> np.ndarray:
    """Simple moving-average smoothing."""
    if len(signal) < kernel_size:
        return signal.copy()
    kernel = np.ones(kernel_size) / kernel_size
    return np.convolve(signal, kernel, mode="same")


def _detect_minima(signal: np.ndarray, min_distance: int = 3) -> List[int]:
    """Detect local minima in a 1-D signal with minimum peak distance."""
    minima: List[int] = []
    for i in range(1, len(signal) - 1):
        if signal[i] < signal[i - 1] and signal[i] < signal[i + 1]:
            if not minima or (i - minima[-1]) >= min_distance:
                minima.append(i)
    return minima


def _detect_maxima(signal: np.ndarray, min_distance: int = 3) -> List[int]:
    """Detect local maxima in a 1-D signal with minimum peak distance."""
    maxima: List[int] = []
    for i in range(1, len(signal) - 1):
        if signal[i] > signal[i - 1] and signal[i] > signal[i + 1]:
            if not maxima or (i - maxima[-1]) >= min_distance:
                maxima.append(i)
    return maxima


def detect_gait_events(
    keypoints_sequence: np.ndarray,
    fps: float,
    confidence_values: Optional[np.ndarray] = None,
) -> List[GaitEvent]:
    """Detect foot-strike and toe-off events from an inferred keypoint sequence.

    Foot strike: ankle y reaches a local minimum (lowest point = ground contact).
    Toe off: ankle y reaches a local maximum just after a foot strike.

    Args:
        keypoints_sequence: shape (N_frames, 17, 2) or (N_frames, 17, 3).
        fps: frames per second of the sequence.
        confidence_values: optional (N_frames, 17) confidence array.

    Returns:
        Chronologically sorted list of GaitEvent.
    """
    if keypoints_sequence.ndim != 3 or keypoints_sequence.shape[1] != 17:
        raise ValueError(
            f"Expected (N, 17, 2+) keypoints, got {keypoints_sequence.shape}"
        )

    n_frames = keypoints_sequence.shape[0]
    if n_frames < MINIMUM_STRIDE_FRAMES:
        return []

    min_dist = max(3, int(fps * 0.15))  # ~150 ms minimum between events
    events: List[GaitEvent] = []

    for side, ankle_idx in [("left", LEFT_ANKLE), ("right", RIGHT_ANKLE)]:
        ankle_y = keypoints_sequence[:, ankle_idx, 1].astype(np.float64)
        smooth_y = _smooth(ankle_y, kernel_size=max(3, int(fps * 0.05)))

        # Foot strikes = local minima of ankle y
        strike_frames = _detect_minima(smooth_y, min_distance=min_dist)
        for f in strike_frames:
            conf = 0.6  # baseline for event detection
            if confidence_values is not None and confidence_values.shape[0] > f:
                conf = float(confidence_values[f, ankle_idx])
            events.append(
                GaitEvent(
                    event_type="foot_strike",
                    side=side,
                    frame_idx=f,
                    timestamp_s=f / fps,
                    confidence=conf,
                )
            )

        # Toe offs = local maxima of ankle y
        toeoff_frames = _detect_maxima(smooth_y, min_distance=min_dist)
        for f in toeoff_frames:
            conf = 0.5
            if confidence_values is not None and confidence_values.shape[0] > f:
                conf = float(confidence_values[f, ankle_idx])
            events.append(
                GaitEvent(
                    event_type="toe_off",
                    side=side,
                    frame_idx=f,
                    timestamp_s=f / fps,
                    confidence=conf,
                )
            )

    events.sort(key=lambda e: e.frame_idx)
    return events


# ---------------------------------------------------------------------------
# Stride metrics
# ---------------------------------------------------------------------------

def _ipsilateral_strike_intervals(events: List[GaitEvent], side: str) -> List[float]:
    """Time intervals between consecutive foot strikes on the same side."""
    strikes = [e for e in events if e.event_type == "foot_strike" and e.side == side]
    return [strikes[i + 1].timestamp_s - strikes[i].timestamp_s for i in range(len(strikes) - 1)]


def _contralateral_step_intervals(events: List[GaitEvent]) -> List[float]:
    """Time between consecutive foot strikes regardless of side."""
    strikes = [e for e in events if e.event_type == "foot_strike"]
    strikes.sort(key=lambda e: e.timestamp_s)
    intervals: List[float] = []
    for i in range(len(strikes) - 1):
        if strikes[i].side != strikes[i + 1].side:
            intervals.append(strikes[i + 1].timestamp_s - strikes[i].timestamp_s)
    return intervals


def _stance_swing_ratio(events: List[GaitEvent], side: str) -> tuple[float, float]:
    """Estimate stance and swing percentages for one side.

    Stance = foot_strike → toe_off.  Swing = toe_off → next foot_strike.
    Returns (stance_pct, swing_pct) or (NaN, NaN) if insufficient events.
    """
    side_events = [e for e in events if e.side == side]
    side_events.sort(key=lambda e: e.timestamp_s)

    stance_durations: List[float] = []
    swing_durations: List[float] = []

    i = 0
    while i < len(side_events) - 1:
        if side_events[i].event_type == "foot_strike" and side_events[i + 1].event_type == "toe_off":
            stance_durations.append(side_events[i + 1].timestamp_s - side_events[i].timestamp_s)
            # Look for next foot strike for swing
            if i + 2 < len(side_events) and side_events[i + 2].event_type == "foot_strike":
                swing_durations.append(side_events[i + 2].timestamp_s - side_events[i + 1].timestamp_s)
                i += 2
                continue
        i += 1

    if not stance_durations:
        return float("nan"), float("nan")

    avg_stance = float(np.mean(stance_durations))
    avg_swing = float(np.mean(swing_durations)) if swing_durations else float("nan")

    if np.isnan(avg_swing):
        return float("nan"), float("nan")

    total = avg_stance + avg_swing
    if total < 1e-9:
        return float("nan"), float("nan")

    return (avg_stance / total) * 100.0, (avg_swing / total) * 100.0


def compute_stride_metrics(
    gait_events: List[GaitEvent],
    keypoints_sequence: np.ndarray,
    fps: float,
) -> StrideMetrics:
    """Compute stride-level metrics from detected gait events.

    Args:
        gait_events: list from detect_gait_events().
        keypoints_sequence: shape (N_frames, 17, 2+).
        fps: frames per second.

    Returns:
        StrideMetrics with experimental proxy estimates.
    """
    result = StrideMetrics()

    if not gait_events:
        return result

    # --- Stride time (ipsilateral) ---
    left_strides = _ipsilateral_strike_intervals(gait_events, "left")
    right_strides = _ipsilateral_strike_intervals(gait_events, "right")
    all_strides = left_strides + right_strides
    if all_strides:
        result.estimated_stride_time_s = float(np.mean(all_strides))

    # --- Step time (contralateral) ---
    step_intervals = _contralateral_step_intervals(gait_events)
    if step_intervals:
        result.estimated_step_time_s = float(np.mean(step_intervals))

    # --- Stance / swing / duty factor ---
    l_stance, l_swing = _stance_swing_ratio(gait_events, "left")
    r_stance, r_swing = _stance_swing_ratio(gait_events, "right")

    stance_vals = [v for v in [l_stance, r_stance] if not np.isnan(v)]
    swing_vals = [v for v in [l_swing, r_swing] if not np.isnan(v)]

    if stance_vals:
        result.estimated_stance_phase_pct = float(np.mean(stance_vals))
    if swing_vals:
        result.estimated_swing_phase_pct = float(np.mean(swing_vals))
    if stance_vals:
        result.estimated_duty_factor = result.estimated_stance_phase_pct / 100.0

    # --- Double support estimate ---
    # Approximate: 2 × (stance% - 50%) when stance% > 50
    if not np.isnan(result.estimated_stance_phase_pct):
        ds = max(0.0, 2.0 * (result.estimated_stance_phase_pct - 50.0))
        result.estimated_double_support_pct = ds

    # --- Vertical oscillation ---
    hip_y = (
        keypoints_sequence[:, LEFT_HIP, 1] + keypoints_sequence[:, RIGHT_HIP, 1]
    ) / 2.0
    if len(hip_y) > 2:
        smooth_hip = _smooth(hip_y.astype(np.float64), kernel_size=max(3, int(fps * 0.05)))
        # Per-stride peak-to-peak
        strikes_all = [e for e in gait_events if e.event_type == "foot_strike"]
        strikes_all.sort(key=lambda e: e.frame_idx)
        osc_values: List[float] = []
        for i in range(len(strikes_all) - 1):
            seg = smooth_hip[strikes_all[i].frame_idx : strikes_all[i + 1].frame_idx]
            if len(seg) > 1:
                osc_values.append(float(np.max(seg) - np.min(seg)))
        if osc_values:
            result.estimated_vertical_oscillation_cm = float(np.mean(osc_values))

    # --- Confidence ---
    event_confs = [e.confidence for e in gait_events]
    result.confidence = float(np.mean(event_confs)) if event_confs else 0.0

    return result

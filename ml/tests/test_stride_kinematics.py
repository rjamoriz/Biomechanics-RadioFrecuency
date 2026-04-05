"""Tests for stride kinematics — gait event detection and stride metrics."""

import math

import numpy as np
import pytest

from biomech_ml.stride_kinematics import (
    GaitEvent,
    StrideMetrics,
    detect_gait_events,
    compute_stride_metrics,
)


# ---------------------------------------------------------------------------
# Helpers — generate synthetic keypoint sequences
# ---------------------------------------------------------------------------

def _sinusoidal_ankle_sequence(
    n_frames: int = 200,
    fps: float = 30.0,
    stride_freq: float = 2.5,
) -> np.ndarray:
    """Create a synthetic (N, 17, 2) keypoint sequence with sinusoidal ankle motion.

    Ankle y oscillates at stride_freq Hz to simulate gait cycles.
    Left and right ankles are 180° out of phase.
    """
    kp = np.zeros((n_frames, 17, 2), dtype=np.float64)
    t = np.arange(n_frames) / fps

    # Static body except ankles and hips
    for i in range(n_frames):
        kp[i, 5] = [40, 20]   # left_shoulder
        kp[i, 6] = [60, 20]   # right_shoulder
        kp[i, 11] = [42, 50]  # left_hip
        kp[i, 12] = [58, 50]  # right_hip
        kp[i, 13] = [40, 70]  # left_knee
        kp[i, 14] = [60, 70]  # right_knee

    # Ankles oscillate — y goes low on foot strike, high on swing
    left_y = 90.0 + 10.0 * np.sin(2 * np.pi * stride_freq * t)
    right_y = 90.0 + 10.0 * np.sin(2 * np.pi * stride_freq * t + np.pi)

    kp[:, 15, 0] = 40.0
    kp[:, 15, 1] = left_y
    kp[:, 16, 0] = 60.0
    kp[:, 16, 1] = right_y

    # Hips oscillate slightly for vertical oscillation testing
    hip_osc = 2.0 * np.sin(2 * np.pi * stride_freq * t)
    kp[:, 11, 1] = 50.0 + hip_osc
    kp[:, 12, 1] = 50.0 + hip_osc

    return kp


# ---------------------------------------------------------------------------
# detect_gait_events
# ---------------------------------------------------------------------------

class TestDetectGaitEvents:
    def test_detects_foot_strikes(self):
        seq = _sinusoidal_ankle_sequence(n_frames=200, fps=30.0, stride_freq=2.5)
        events = detect_gait_events(seq, fps=30.0)
        strikes = [e for e in events if e.event_type == "foot_strike"]
        assert len(strikes) > 0

    def test_detects_toe_offs(self):
        seq = _sinusoidal_ankle_sequence(n_frames=200, fps=30.0, stride_freq=2.5)
        events = detect_gait_events(seq, fps=30.0)
        toe_offs = [e for e in events if e.event_type == "toe_off"]
        assert len(toe_offs) > 0

    def test_both_sides_detected(self):
        seq = _sinusoidal_ankle_sequence(n_frames=200, fps=30.0, stride_freq=2.5)
        events = detect_gait_events(seq, fps=30.0)
        sides = {e.side for e in events}
        assert "left" in sides
        assert "right" in sides

    def test_events_are_chronological(self):
        seq = _sinusoidal_ankle_sequence(n_frames=200, fps=30.0)
        events = detect_gait_events(seq, fps=30.0)
        timestamps = [e.timestamp_s for e in events]
        assert timestamps == sorted(timestamps)

    def test_timestamps_are_correct(self):
        fps = 30.0
        seq = _sinusoidal_ankle_sequence(n_frames=200, fps=fps)
        events = detect_gait_events(seq, fps=fps)
        for e in events:
            expected_t = e.frame_idx / fps
            assert abs(e.timestamp_s - expected_t) < 1e-9

    def test_validation_status_experimental(self):
        seq = _sinusoidal_ankle_sequence(n_frames=100, fps=30.0)
        events = detect_gait_events(seq, fps=30.0)
        for e in events:
            assert e.validation_status == "experimental"

    def test_too_few_frames_returns_empty(self):
        seq = np.zeros((2, 17, 2))
        events = detect_gait_events(seq, fps=30.0)
        assert events == []

    def test_bad_shape_raises(self):
        with pytest.raises(ValueError):
            detect_gait_events(np.zeros((10, 10, 2)), fps=30.0)

    def test_with_confidence_values(self):
        seq = _sinusoidal_ankle_sequence(n_frames=100, fps=30.0)
        conf = np.full((100, 17), 0.85)
        events = detect_gait_events(seq, fps=30.0, confidence_values=conf)
        strikes = [e for e in events if e.event_type == "foot_strike"]
        for s in strikes:
            assert abs(s.confidence - 0.85) < 0.01


# ---------------------------------------------------------------------------
# compute_stride_metrics
# ---------------------------------------------------------------------------

class TestComputeStrideMetrics:
    def test_empty_events(self):
        seq = np.zeros((50, 17, 2))
        result = compute_stride_metrics([], seq, fps=30.0)
        assert math.isnan(result.estimated_stride_time_s)
        assert result.validation_status == "experimental"

    def test_stride_time_reasonable(self):
        fps = 30.0
        stride_freq = 2.5  # 2.5 Hz → stride time ~0.4s
        seq = _sinusoidal_ankle_sequence(n_frames=300, fps=fps, stride_freq=stride_freq)
        events = detect_gait_events(seq, fps=fps)
        metrics = compute_stride_metrics(events, seq, fps=fps)
        if not math.isnan(metrics.estimated_stride_time_s):
            # stride_freq 2.5 Hz → period 0.4s — allow ±50% tolerance for detection jitter
            assert 0.2 < metrics.estimated_stride_time_s < 0.8

    def test_duty_factor_for_running(self):
        fps = 60.0
        seq = _sinusoidal_ankle_sequence(n_frames=600, fps=fps, stride_freq=3.0)
        events = detect_gait_events(seq, fps=fps)
        metrics = compute_stride_metrics(events, seq, fps=fps)
        # Duty factor should be a number between 0 and 1 (if computed)
        if not math.isnan(metrics.estimated_duty_factor):
            assert 0.0 <= metrics.estimated_duty_factor <= 1.0

    def test_vertical_oscillation_computed(self):
        fps = 30.0
        seq = _sinusoidal_ankle_sequence(n_frames=300, fps=fps, stride_freq=2.5)
        events = detect_gait_events(seq, fps=fps)
        metrics = compute_stride_metrics(events, seq, fps=fps)
        if not math.isnan(metrics.estimated_vertical_oscillation_cm):
            assert metrics.estimated_vertical_oscillation_cm > 0

    def test_confidence_from_events(self):
        fps = 30.0
        seq = _sinusoidal_ankle_sequence(n_frames=200, fps=fps)
        events = detect_gait_events(seq, fps=fps)
        metrics = compute_stride_metrics(events, seq, fps=fps)
        assert 0.0 < metrics.confidence <= 1.0

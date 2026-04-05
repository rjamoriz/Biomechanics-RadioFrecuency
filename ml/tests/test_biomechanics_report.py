"""Tests for biomechanics report generator."""

import math

import numpy as np
import pytest

from biomech_ml.joint_angles import JointAngles, compute_joint_angles
from biomech_ml.stride_kinematics import StrideMetrics
from biomech_ml.biomechanics_report import (
    BiomechanicsReportGenerator,
    SessionBiomechanicsReport,
    AngleSummary,
)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _symmetric_angles(n: int = 20) -> list[JointAngles]:
    """Generate n JointAngles with small symmetric L/R differences."""
    rng = np.random.default_rng(42)
    results = []
    for _ in range(n):
        base_knee = 155.0 + rng.normal(0, 2)
        base_hip = 170.0 + rng.normal(0, 2)
        base_elbow = 90.0 + rng.normal(0, 3)
        results.append(JointAngles(
            inferred_left_knee_angle=base_knee + rng.normal(0, 0.5),
            inferred_right_knee_angle=base_knee + rng.normal(0, 0.5),
            inferred_left_hip_angle=base_hip + rng.normal(0, 0.5),
            inferred_right_hip_angle=base_hip + rng.normal(0, 0.5),
            inferred_left_elbow_angle=base_elbow + rng.normal(0, 1),
            inferred_right_elbow_angle=base_elbow + rng.normal(0, 1),
            inferred_trunk_lean_angle=5.0 + rng.normal(0, 0.5),
            inferred_pelvic_tilt_angle=1.0 + rng.normal(0, 0.3),
            overall_confidence=0.8,
        ))
    return results


def _asymmetric_angles(n: int = 20) -> list[JointAngles]:
    """Generate angles with large L/R knee asymmetry."""
    rng = np.random.default_rng(99)
    results = []
    for _ in range(n):
        results.append(JointAngles(
            inferred_left_knee_angle=150.0 + rng.normal(0, 2),
            inferred_right_knee_angle=135.0 + rng.normal(0, 2),  # 15° diff
            inferred_left_hip_angle=170.0,
            inferred_right_hip_angle=170.0,
            inferred_left_elbow_angle=90.0,
            inferred_right_elbow_angle=90.0,
            inferred_trunk_lean_angle=5.0,
            inferred_pelvic_tilt_angle=0.0,
            overall_confidence=0.7,
        ))
    return results


def _stride_metrics_series(n: int = 10) -> list[StrideMetrics]:
    rng = np.random.default_rng(42)
    return [
        StrideMetrics(
            estimated_stride_time_s=0.7 + rng.normal(0, 0.02),
            estimated_step_time_s=0.35 + rng.normal(0, 0.01),
            estimated_stance_phase_pct=35.0 + rng.normal(0, 1),
            estimated_swing_phase_pct=65.0 + rng.normal(0, 1),
            estimated_duty_factor=0.35,
            estimated_vertical_oscillation_cm=8.0 + rng.normal(0, 0.5),
            confidence=0.7,
        )
        for _ in range(n)
    ]


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------

class TestBiomechanicsReportGenerator:
    def test_basic_report_generation(self):
        gen = BiomechanicsReportGenerator()
        report = gen.generate_session_summary(
            _symmetric_angles(20),
            _stride_metrics_series(10),
        )
        assert isinstance(report, SessionBiomechanicsReport)
        assert report.validation_status == "experimental"

    def test_angle_summaries_populated(self):
        gen = BiomechanicsReportGenerator()
        report = gen.generate_session_summary(_symmetric_angles(20), [])
        assert "inferred_left_knee_angle" in report.angle_summaries
        summary = report.angle_summaries["inferred_left_knee_angle"]
        assert summary.sample_count == 20
        assert not math.isnan(summary.mean)
        assert not math.isnan(summary.std)

    def test_stride_metrics_summarized(self):
        gen = BiomechanicsReportGenerator()
        report = gen.generate_session_summary([], _stride_metrics_series(10))
        assert not math.isnan(report.estimated_stride_time_mean)
        assert not math.isnan(report.estimated_stride_time_std)
        assert 0.5 < report.estimated_stride_time_mean < 1.0

    def test_symmetry_summary_low_for_symmetric(self):
        gen = BiomechanicsReportGenerator()
        report = gen.generate_session_summary(_symmetric_angles(30), [])
        # Should have small L/R differences
        diff = report.symmetry_summary.inferred_knee_angle_diff_mean
        assert not math.isnan(diff)
        assert diff < 5.0  # symmetric poses → small diff

    def test_asymmetry_warning_generated(self):
        gen = BiomechanicsReportGenerator()
        report = gen.generate_session_summary(_asymmetric_angles(20), [])
        knee_warnings = [w for w in report.warnings if "knee" in w.lower()]
        assert len(knee_warnings) > 0

    def test_form_quality_score_range(self):
        gen = BiomechanicsReportGenerator()
        report = gen.generate_session_summary(
            _symmetric_angles(20),
            _stride_metrics_series(10),
        )
        if not math.isnan(report.form_quality_score):
            assert 0.0 <= report.form_quality_score <= 100.0

    def test_empty_inputs(self):
        gen = BiomechanicsReportGenerator()
        report = gen.generate_session_summary([], [])
        assert report.validation_status == "experimental"
        assert report.confidence == 0.0

    def test_confidence_computed(self):
        gen = BiomechanicsReportGenerator()
        report = gen.generate_session_summary(
            _symmetric_angles(10),
            _stride_metrics_series(5),
        )
        assert 0.0 < report.confidence <= 1.0

    def test_fatigue_indicators_populated(self):
        """Generate angles with increasing trunk lean to trigger drift detection."""
        angles = []
        for i in range(30):
            angles.append(JointAngles(
                inferred_left_knee_angle=155.0,
                inferred_right_knee_angle=155.0,
                inferred_left_hip_angle=170.0,
                inferred_right_hip_angle=170.0,
                inferred_left_elbow_angle=90.0,
                inferred_right_elbow_angle=90.0,
                inferred_trunk_lean_angle=3.0 + i * 0.5,  # increasing lean
                inferred_pelvic_tilt_angle=0.0,
                overall_confidence=0.8,
            ))
        gen = BiomechanicsReportGenerator()
        report = gen.generate_session_summary(angles, _stride_metrics_series(10))
        assert not math.isnan(report.fatigue_indicators.trunk_lean_drift)
        assert report.fatigue_indicators.trunk_lean_drift > 0

    def test_all_nan_angles_no_crash(self):
        gen = BiomechanicsReportGenerator()
        nan_angles = [JointAngles() for _ in range(5)]  # all NaN
        report = gen.generate_session_summary(nan_angles, [])
        assert report.validation_status == "experimental"

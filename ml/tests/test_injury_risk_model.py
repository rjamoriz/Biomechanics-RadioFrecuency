"""Tests for injury_risk_model.py."""

from __future__ import annotations

import math
import pytest

from biomech_ml.injury_risk_model import (
    InjuryRiskEstimator,
    InjuryRiskFeatures,
    InjuryRiskLevel,
    InjuryRiskOutput,
    classify_risk_level,
    _score_asymmetry,
    _score_fatigue,
    _score_form,
    _score_contact_time,
    _score_step_variability,
)
from biomech_ml.joint_angles import JointAngles


# ---------------------------------------------------------------------------
# classify_risk_level
# ---------------------------------------------------------------------------

class TestClassifyRiskLevel:
    def test_low(self):
        assert classify_risk_level(0.0) == InjuryRiskLevel.LOW
        assert classify_risk_level(0.19) == InjuryRiskLevel.LOW

    def test_moderate(self):
        assert classify_risk_level(0.20) == InjuryRiskLevel.MODERATE
        assert classify_risk_level(0.39) == InjuryRiskLevel.MODERATE

    def test_elevated(self):
        assert classify_risk_level(0.40) == InjuryRiskLevel.ELEVATED
        assert classify_risk_level(0.59) == InjuryRiskLevel.ELEVATED

    def test_high(self):
        assert classify_risk_level(0.60) == InjuryRiskLevel.HIGH
        assert classify_risk_level(0.79) == InjuryRiskLevel.HIGH

    def test_critical(self):
        assert classify_risk_level(0.80) == InjuryRiskLevel.CRITICAL
        assert classify_risk_level(1.0) == InjuryRiskLevel.CRITICAL


# ---------------------------------------------------------------------------
# Individual factor scorers
# ---------------------------------------------------------------------------

class TestFactorScorers:
    def test_asymmetry_perfect(self):
        score, elevated = _score_asymmetry(1.0)
        assert score == pytest.approx(0.0)
        assert elevated is False

    def test_asymmetry_severe(self):
        score, elevated = _score_asymmetry(0.5)
        assert score > 0.5
        assert elevated is True

    def test_fatigue_zero(self):
        score, elevated = _score_fatigue(0.0)
        assert score == pytest.approx(0.0)
        assert elevated is False

    def test_fatigue_high(self):
        score, elevated = _score_fatigue(0.8)
        assert score == pytest.approx(0.8)
        assert elevated is True

    def test_form_stable(self):
        score, elevated = _score_form(1.0)
        assert score == pytest.approx(0.0)
        assert elevated is False

    def test_form_degraded(self):
        score, elevated = _score_form(0.5)
        assert score > 0.0
        assert elevated is True

    def test_contact_time_normal(self):
        score, elevated = _score_contact_time(250.0)
        assert score == pytest.approx(0.0)
        assert elevated is False

    def test_contact_time_high(self):
        score, elevated = _score_contact_time(400.0)
        assert score > 0.0
        assert elevated is True

    def test_step_variability_low(self):
        score, elevated = _score_step_variability(0.05)
        assert elevated is False

    def test_step_variability_high(self):
        score, elevated = _score_step_variability(0.25)
        assert elevated is True


# ---------------------------------------------------------------------------
# InjuryRiskEstimator
# ---------------------------------------------------------------------------

class TestInjuryRiskEstimator:
    def setup_method(self):
        self.estimator = InjuryRiskEstimator()

    def _healthy_features(self) -> InjuryRiskFeatures:
        return InjuryRiskFeatures(
            symmetry_proxy=0.95,
            fatigue_drift_score=0.05,
            form_stability_score=0.90,
            contact_time_proxy_ms=240.0,
            flight_time_proxy_ms=110.0,
            step_interval_variability=0.06,
            signal_quality_score=0.85,
        )

    def _risky_features(self) -> InjuryRiskFeatures:
        return InjuryRiskFeatures(
            symmetry_proxy=0.60,
            fatigue_drift_score=0.70,
            form_stability_score=0.50,
            contact_time_proxy_ms=380.0,
            flight_time_proxy_ms=60.0,
            step_interval_variability=0.22,
            signal_quality_score=0.70,
        )

    def test_healthy_athlete_low_risk(self):
        result = self.estimator.estimate(self._healthy_features())
        assert isinstance(result, InjuryRiskOutput)
        assert result.overall_risk_score < 0.40
        assert result.overall_risk_level in (InjuryRiskLevel.LOW, InjuryRiskLevel.MODERATE)

    def test_risky_athlete_elevated_risk(self):
        result = self.estimator.estimate(self._risky_features())
        assert result.overall_risk_score >= 0.40
        assert result.overall_risk_level in (
            InjuryRiskLevel.ELEVATED, InjuryRiskLevel.HIGH, InjuryRiskLevel.CRITICAL
        )

    def test_output_always_experimental(self):
        result = self.estimator.estimate(self._healthy_features())
        assert result.experimental is True
        assert result.validation_status == "experimental"

    def test_score_bounded_zero_one(self):
        for features in [self._healthy_features(), self._risky_features()]:
            result = self.estimator.estimate(features)
            assert 0.0 <= result.overall_risk_score <= 1.0
            assert 0.0 <= result.model_confidence <= 1.0

    def test_articulation_risks_present(self):
        result = self.estimator.estimate(self._healthy_features())
        joints = {a.joint for a in result.articulation_risks}
        expected = {"knee_left", "knee_right", "hip_left", "hip_right", "ankle_left", "ankle_right", "lumbar"}
        assert joints == expected

    def test_risk_factors_present(self):
        result = self.estimator.estimate(self._healthy_features())
        factor_ids = {f.factor_id for f in result.risk_factors}
        assert "asymmetry" in factor_ids
        assert "fatigue_drift" in factor_ids
        assert "form_stability" in factor_ids

    def test_low_signal_quality_warning(self):
        features = self._risky_features()
        features.signal_quality_score = 0.2
        result = self.estimator.estimate(features)
        assert any("signal quality" in w.lower() for w in result.warnings)

    def test_elevated_risk_warning(self):
        result = self.estimator.estimate(self._risky_features())
        # should warn when elevated
        if result.overall_risk_score >= 0.6:
            assert len(result.warnings) > 0

    def test_with_joint_angles_used(self):
        features = self._healthy_features()
        angles = JointAngles(
            inferred_left_knee_angle=120.0,
            inferred_right_knee_angle=118.0,
            inferred_left_hip_angle=165.0,
            inferred_right_hip_angle=163.0,
            inferred_trunk_lean_angle=5.0,
            inferred_pelvic_tilt_angle=3.0,
            confidence_left_knee=0.8,
            confidence_right_knee=0.8,
            confidence_left_hip=0.7,
            confidence_right_hip=0.7,
            confidence_trunk_lean=0.6,
            confidence_pelvic_tilt=0.6,
            overall_confidence=0.72,
        )
        features.joint_angles = angles
        result = self.estimator.estimate(features)
        assert result.used_inferred_joint_angles is True
        assert any(f.factor_id == "joint_angles" for f in result.risk_factors)

    def test_without_joint_angles_not_used(self):
        features = self._healthy_features()
        features.joint_angles = None
        result = self.estimator.estimate(features)
        assert result.used_inferred_joint_angles is False
        assert not any(f.factor_id == "joint_angles" for f in result.risk_factors)

    def test_risky_athlete_has_elevated_articulation(self):
        result = self.estimator.estimate(self._risky_features())
        max_score = max(a.risk_score for a in result.articulation_risks)
        assert max_score > 0.3

    def test_articulation_scores_bounded(self):
        result = self.estimator.estimate(self._risky_features())
        for art in result.articulation_risks:
            assert 0.0 <= art.risk_score <= 1.0
            assert 0.0 <= art.confidence <= 1.0

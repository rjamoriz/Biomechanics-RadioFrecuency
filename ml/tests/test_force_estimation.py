"""Tests for SpringMassForceEstimator proxy force estimates."""

import math
import pytest
from biomech_ml.force_estimation import ForceEstimateInput, SpringMassForceEstimator


@pytest.fixture
def estimator():
    return SpringMassForceEstimator()


@pytest.fixture
def typical_input():
    return ForceEstimateInput(
        contact_time_ms=250.0,
        flight_time_ms=120.0,
        cadence_spm=180.0,
        body_weight_kg=70.0,
    )


class TestForceEstimateOutputClass:
    def test_output_class_is_proxy_metric(self, estimator, typical_input):
        result = estimator.estimate(typical_input)
        assert result.output_class == "proxy_metric"

    def test_experimental_flag_always_true(self, estimator, typical_input):
        result = estimator.estimate(typical_input)
        assert result.experimental is True

    def test_validation_status_is_unvalidated(self, estimator, typical_input):
        result = estimator.estimate(typical_input)
        assert result.validation_status == "unvalidated"


class TestPeakVGRF:
    def test_peak_vgrf_greater_than_body_weight(self, estimator, typical_input):
        """vGRF must exceed body weight during flight."""
        bw_n = typical_input.body_weight_kg * 9.81
        result = estimator.estimate(typical_input)
        assert result.peak_vgrf_proxy_n > bw_n

    def test_peak_vgrf_normalized_typical_range(self, estimator, typical_input):
        """Normalized vGRF for typical running should be 2–3× body weight."""
        result = estimator.estimate(typical_input)
        assert 1.5 <= result.peak_vgrf_proxy_bw <= 4.0

    def test_higher_flight_time_increases_vgrf(self, estimator):
        low_flight = ForceEstimateInput(
            contact_time_ms=250.0, flight_time_ms=80.0,
            cadence_spm=180.0, body_weight_kg=70.0
        )
        high_flight = ForceEstimateInput(
            contact_time_ms=250.0, flight_time_ms=200.0,
            cadence_spm=180.0, body_weight_kg=70.0
        )
        low = estimator.estimate(low_flight)
        high = estimator.estimate(high_flight)
        assert high.peak_vgrf_proxy_n > low.peak_vgrf_proxy_n

    def test_heavier_athlete_has_higher_absolute_vgrf(self, estimator):
        light = ForceEstimateInput(
            contact_time_ms=250.0, flight_time_ms=120.0,
            cadence_spm=180.0, body_weight_kg=60.0
        )
        heavy = ForceEstimateInput(
            contact_time_ms=250.0, flight_time_ms=120.0,
            cadence_spm=180.0, body_weight_kg=90.0
        )
        assert estimator.estimate(heavy).peak_vgrf_proxy_n > estimator.estimate(light).peak_vgrf_proxy_n


class TestLegStiffness:
    def test_leg_stiffness_positive(self, estimator, typical_input):
        result = estimator.estimate(typical_input)
        assert result.leg_stiffness_proxy_kn_per_m > 0

    def test_leg_stiffness_plausible_range(self, estimator, typical_input):
        """Typical running leg stiffness: 8–25 kN/m (Farley & Gonzalez 1996)."""
        result = estimator.estimate(typical_input)
        assert 5.0 <= result.leg_stiffness_proxy_kn_per_m <= 50.0


class TestVerticalOscillation:
    def test_vertical_oscillation_positive(self, estimator, typical_input):
        result = estimator.estimate(typical_input)
        assert result.vertical_oscillation_proxy_cm > 0

    def test_longer_flight_increases_oscillation(self, estimator):
        short = ForceEstimateInput(
            contact_time_ms=250.0, flight_time_ms=50.0,
            cadence_spm=180.0, body_weight_kg=70.0
        )
        long_ = ForceEstimateInput(
            contact_time_ms=250.0, flight_time_ms=200.0,
            cadence_spm=180.0, body_weight_kg=70.0
        )
        assert estimator.estimate(long_).vertical_oscillation_proxy_cm > \
               estimator.estimate(short).vertical_oscillation_proxy_cm


class TestConfidence:
    def test_typical_input_has_high_confidence(self, estimator, typical_input):
        result = estimator.estimate(typical_input)
        assert result.confidence >= 0.8

    def test_extreme_cadence_reduces_confidence(self, estimator):
        extreme = ForceEstimateInput(
            contact_time_ms=250.0, flight_time_ms=120.0,
            cadence_spm=100.0,  # well below 140 SPM
            body_weight_kg=70.0
        )
        result = estimator.estimate(extreme)
        assert result.confidence < 0.8

    def test_confidence_bounded_0_1(self, estimator):
        for cadence in [50, 180, 300]:
            inp = ForceEstimateInput(
                contact_time_ms=250.0, flight_time_ms=120.0,
                cadence_spm=cadence, body_weight_kg=70.0
            )
            result = estimator.estimate(inp)
            assert 0.0 <= result.confidence <= 1.0

    def test_quality_note_warns_proxy(self, estimator, typical_input):
        result = estimator.estimate(typical_input)
        assert "proxy" in result.signal_quality_context.lower()

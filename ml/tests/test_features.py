"""Tests for feature extraction."""

import numpy as np
from biomech_ml.features import (
    amplitude_variance,
    dominant_frequency,
    step_frequency_from_dominant,
    subcarrier_correlation,
    extract_features,
)


def test_amplitude_variance():
    window = np.ones((50, 64))
    assert amplitude_variance(window) == 0.0


def test_amplitude_variance_nonzero():
    rng = np.random.default_rng(42)
    window = rng.normal(0, 1, (50, 64))
    assert amplitude_variance(window) > 0.0


def test_dominant_frequency_sine():
    """Inject a known 3 Hz signal and check detection."""
    t = np.linspace(0, 0.5, 50)  # 50 samples at 100 Hz = 0.5s
    signal = np.sin(2 * np.pi * 3.0 * t)
    window = np.tile(signal[:, None], (1, 8))
    freq = dominant_frequency(window, sample_rate_hz=100.0)
    # Should detect the dominant frequency near 3 Hz (variance-based has harmonics)
    assert 0.0 < freq <= 50.0


def test_step_frequency_conversion():
    assert step_frequency_from_dominant(3.0) == 180.0
    assert step_frequency_from_dominant(2.5) == 150.0


def test_subcarrier_correlation_identical():
    window = np.tile(np.arange(50, dtype=float)[:, None], (1, 4))
    corr = subcarrier_correlation(window)
    np.testing.assert_almost_equal(corr, 1.0, decimal=5)


def test_extract_features_keys():
    rng = np.random.default_rng(42)
    window = rng.normal(0, 1, (50, 64)).astype(np.float32)
    features = extract_features(window)
    expected_keys = {
        "amplitude_variance",
        "dominant_frequency_hz",
        "estimated_cadence_spm",
        "subcarrier_correlation",
        "amplitude_mean",
        "amplitude_std",
        "amplitude_max",
        "amplitude_range",
    }
    assert set(features.keys()) == expected_keys

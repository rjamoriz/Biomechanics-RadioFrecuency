"""Tests for preprocessing utilities."""

import numpy as np
from biomech_ml.preprocessing import (
    parse_csi_line,
    extract_amplitude_phase,
    create_windows,
    normalize_amplitude,
)


def test_parse_csi_line_valid():
    line = "CSI,1000,-55,6,AA:BB:CC:DD,4,3,4,1,0"
    result = parse_csi_line(line)
    assert result is not None
    assert result["timestamp"] == 1000
    assert result["rssi"] == -55
    assert result["channel"] == 6
    assert result["mac"] == "AA:BB:CC:DD"
    assert result["csi_values"] == [3, 4, 1, 0]


def test_parse_csi_line_invalid_prefix():
    assert parse_csi_line("NOISE,1,2,3,MAC,2,1,2") is None


def test_parse_csi_line_wrong_length():
    assert parse_csi_line("CSI,1,-50,6,MAC,5,1,2,3") is None


def test_extract_amplitude_phase():
    csi = [3, 4, 1, 0, 0, 0]
    amp, phase = extract_amplitude_phase(csi)
    assert len(amp) == 3
    assert len(phase) == 3
    np.testing.assert_almost_equal(amp[0], 5.0)
    np.testing.assert_almost_equal(amp[1], 1.0)
    np.testing.assert_almost_equal(amp[2], 0.0)


def test_create_windows():
    data = np.random.randn(100, 64).astype(np.float32)
    windows = create_windows(data, window_size=50, stride=10)
    assert windows.shape[0] > 0
    assert windows.shape[1] == 50
    assert windows.shape[2] == 64


def test_create_windows_too_short():
    data = np.random.randn(10, 64).astype(np.float32)
    windows = create_windows(data, window_size=50, stride=10)
    assert windows.shape[0] == 0


def test_normalize_amplitude():
    data = np.array([[1.0, 2.0], [3.0, 4.0], [5.0, 6.0]])
    normed = normalize_amplitude(data)
    # After z-score, mean should be ~0
    np.testing.assert_almost_equal(normed.mean(axis=0), [0.0, 0.0], decimal=5)

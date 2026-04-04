"""
Feature extraction from preprocessed CSI windows.

Extracts temporal and frequency domain features for proxy metric models.
"""

import numpy as np


def amplitude_variance(window: np.ndarray) -> float:
    """Mean variance across subcarriers in a window."""
    return float(np.var(window, axis=0).mean())


def dominant_frequency(window: np.ndarray, sample_rate_hz: float = 100.0) -> float:
    """Dominant frequency via FFT on amplitude variance time series.

    Takes the per-timestep mean amplitude variance and finds the peak frequency.
    """
    signal = np.var(window, axis=1)
    fft = np.fft.rfft(signal - signal.mean())
    magnitudes = np.abs(fft)

    freqs = np.fft.rfftfreq(len(signal), d=1.0 / sample_rate_hz)

    # Ignore DC component
    if len(magnitudes) > 1:
        magnitudes[0] = 0

    peak_idx = np.argmax(magnitudes)
    return float(freqs[peak_idx])


def step_frequency_from_dominant(dominant_freq_hz: float) -> float:
    """Convert dominant frequency to steps-per-minute.

    Assumes the dominant frequency corresponds to the step frequency.
    Typical running cadence: 2.5-3.5 Hz (150-210 SPM).
    """
    return dominant_freq_hz * 60.0


def subcarrier_correlation(window: np.ndarray) -> float:
    """Mean pair-wise correlation between subcarriers.

    High correlation may indicate body motion dominance;
    low correlation may indicate noise or multi-path interference.
    """
    n_subcarriers = window.shape[1]
    if n_subcarriers < 2:
        return 0.0

    corr_matrix = np.corrcoef(window.T)
    # Extract upper triangle (excluding diagonal)
    mask = np.triu(np.ones_like(corr_matrix, dtype=bool), k=1)
    correlations = corr_matrix[mask]

    if len(correlations) == 0:
        return 0.0

    return float(np.nanmean(correlations))


def extract_features(window: np.ndarray, sample_rate_hz: float = 100.0) -> dict:
    """Extract all features from a single window.

    Args:
        window: shape (window_size, num_subcarriers)
        sample_rate_hz: packet rate in Hz

    Returns:
        Feature dict with named values.
    """
    dom_freq = dominant_frequency(window, sample_rate_hz)

    return {
        "amplitude_variance": amplitude_variance(window),
        "dominant_frequency_hz": dom_freq,
        "estimated_cadence_spm": step_frequency_from_dominant(dom_freq),
        "subcarrier_correlation": subcarrier_correlation(window),
        "amplitude_mean": float(np.mean(window)),
        "amplitude_std": float(np.std(window)),
        "amplitude_max": float(np.max(window)),
        "amplitude_range": float(np.ptp(window)),
    }

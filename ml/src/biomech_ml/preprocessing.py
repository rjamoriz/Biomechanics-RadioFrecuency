"""
Preprocessing utilities for raw CSI data.

Handles:
- Loading raw CSI CSV files
- Amplitude and phase extraction from interleaved I/Q
- Subcarrier selection
- Windowing and segment creation
- Normalization
"""

import numpy as np
from typing import Tuple


def parse_csi_line(line: str) -> dict | None:
    """Parse a single CSI serial line into a structured dict.

    Expected format:
        CSI,<timestamp>,<rssi>,<channel>,<mac>,<csi_len>,<val1>,...,<valN>

    Returns None if the line is malformed.
    """
    parts = line.strip().split(",")
    if len(parts) < 7 or parts[0] != "CSI":
        return None

    try:
        csi_len = int(parts[5])
        values = [int(v) for v in parts[6:]]
    except ValueError:
        return None

    if len(values) != csi_len:
        return None

    return {
        "timestamp": int(parts[1]),
        "rssi": int(parts[2]),
        "channel": int(parts[3]),
        "mac": parts[4],
        "csi_values": values,
    }


def extract_amplitude_phase(csi_values: list[int]) -> Tuple[np.ndarray, np.ndarray]:
    """Split interleaved I/Q values into amplitude and phase arrays.

    CSI values are pairs of [real, imag] for each subcarrier.
    """
    arr = np.array(csi_values, dtype=np.float32)
    if len(arr) % 2 != 0:
        arr = arr[:-1]

    real = arr[0::2]
    imag = arr[1::2]

    amplitude = np.sqrt(real**2 + imag**2)
    phase = np.arctan2(imag, real)

    return amplitude, phase


def create_windows(
    amplitudes: np.ndarray,
    window_size: int = 50,
    stride: int = 10,
) -> np.ndarray:
    """Create overlapping windows from a 2D amplitude array (packets x subcarriers).

    Returns shape (num_windows, window_size, num_subcarriers).
    """
    num_packets, num_subcarriers = amplitudes.shape
    windows = []

    for start in range(0, num_packets - window_size + 1, stride):
        window = amplitudes[start : start + window_size]
        windows.append(window)

    if not windows:
        return np.empty((0, window_size, num_subcarriers), dtype=np.float32)

    return np.stack(windows, axis=0)


def normalize_amplitude(amplitudes: np.ndarray, eps: float = 1e-8) -> np.ndarray:
    """Z-score normalization per subcarrier."""
    mean = amplitudes.mean(axis=0, keepdims=True)
    std = amplitudes.std(axis=0, keepdims=True)
    return (amplitudes - mean) / (std + eps)

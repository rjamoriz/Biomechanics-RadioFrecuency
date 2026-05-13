"""
Synthetic CSI data generator for training proxy-metric models.

Generates plausible Wi-Fi CSI amplitude windows from parameterized gait inputs.
Output is SYNTHETIC — not real RF measurements. Use only for model pre-training
and data augmentation. Do NOT present synthetic data as measured signals.

Gait-to-CSI mapping is an approximation based on:
  - Step-frequency modulation of signal variance (cadence)
  - Left/right asymmetry modeled as amplitude ratio between sub-windows
  - Contact-time proxy reflected in duty-cycle of the periodic signal
  - Additive Gaussian noise + pink noise for realistic subcarrier variation
"""

from __future__ import annotations

import math
from dataclasses import dataclass, field
from typing import Optional

import numpy as np


@dataclass(frozen=True)
class GaitLabels:
    """Ground-truth labels for a synthetic window.

    These are the values that were used to GENERATE the window —
    they serve as training labels for proxy-metric models.
    """

    cadence_spm: float
    symmetry_proxy: float       # 0.0 (fully asymmetric) – 1.0 (perfectly symmetric)
    contact_time_ms: float
    flight_time_ms: float
    treadmill_speed_kmh: float
    synthetic: bool = True
    output_class: str = "synthetic_training_data"


@dataclass
class SyntheticWindow:
    """A single synthetic CSI amplitude window + associated ground-truth labels."""

    amplitude: np.ndarray   # shape: (window_size, num_subcarriers), float32
    labels: GaitLabels


class SyntheticCsiGenerator:
    """Generates synthetic CSI amplitude windows from gait parameters.

    Each call to ``generate_window()`` produces one (window, labels) pair.
    Use ``generate_batch()`` to produce training datasets.

    Design decisions:
    - Cadence → dominant periodic component in variance time series
    - Symmetry → amplitude asymmetry between left/right half of contact cycle
    - Contact time → duty cycle of the periodic envelope
    - Noise → Gaussian white + pink (1/f) per subcarrier
    - Subcarrier-to-subcarrier variation → multipath-like random phase offsets

    NOT physically accurate. Correlation with real CSI depends on environment
    calibration. Always label as 'synthetic' in downstream pipelines.
    """

    def __init__(
        self,
        num_subcarriers: int = 64,
        window_size: int = 100,
        sample_rate_hz: float = 100.0,
        rng_seed: Optional[int] = None,
    ):
        self.num_subcarriers = num_subcarriers
        self.window_size = window_size
        self.sample_rate_hz = sample_rate_hz
        self._rng = np.random.default_rng(rng_seed)

    def generate_window(
        self,
        cadence_spm: float = 180.0,
        symmetry: float = 0.95,
        contact_time_ms: float = 250.0,
        flight_time_ms: float = 120.0,
        treadmill_speed_kmh: float = 10.0,
        noise_level: float = 0.05,
    ) -> SyntheticWindow:
        """Generate one synthetic amplitude window.

        Args:
            cadence_spm: Steps per minute (typical range 140–220).
            symmetry: Step symmetry proxy 0–1 (1 = perfect).
            contact_time_ms: Ground contact time proxy in ms.
            flight_time_ms: Aerial phase duration proxy in ms.
            treadmill_speed_kmh: Treadmill belt speed (affects signal magnitude).
            noise_level: Std of additive Gaussian noise (relative to signal).

        Returns:
            SyntheticWindow with amplitude array and GaitLabels.
        """
        t = np.linspace(0, self.window_size / self.sample_rate_hz,
                        self.window_size, endpoint=False)

        step_freq_hz = cadence_spm / 60.0
        duty_cycle = (contact_time_ms / 1000.0) * step_freq_hz  # fraction of cycle in contact

        # Base periodic envelope — half-sine contact phases
        envelope = self._gait_envelope(t, step_freq_hz, duty_cycle, symmetry)

        # Scale by speed (more body motion at higher speeds = higher amplitude variance)
        speed_scale = 0.5 + treadmill_speed_kmh / 20.0

        # Generate per-subcarrier amplitudes with random phase + multipath offsets
        amplitude = np.zeros((self.window_size, self.num_subcarriers), dtype=np.float32)
        subcarrier_phases = self._rng.uniform(0, 2 * math.pi, self.num_subcarriers)
        subcarrier_gains = self._rng.uniform(0.7, 1.3, self.num_subcarriers)

        for sc in range(self.num_subcarriers):
            # Subcarrier-specific phase shift simulates multipath
            sc_signal = envelope * math.cos(subcarrier_phases[sc]) * subcarrier_gains[sc]
            sc_signal = sc_signal * speed_scale

            # Add pink noise (1/f)
            pink = self._pink_noise(self.window_size) * noise_level * speed_scale
            # Add white noise
            white = self._rng.normal(0, noise_level * 0.5, self.window_size)

            amplitude[:, sc] = np.abs(sc_signal + pink + white).astype(np.float32)

        labels = GaitLabels(
            cadence_spm=cadence_spm,
            symmetry_proxy=symmetry,
            contact_time_ms=contact_time_ms,
            flight_time_ms=flight_time_ms,
            treadmill_speed_kmh=treadmill_speed_kmh,
            synthetic=True,
        )

        return SyntheticWindow(amplitude=amplitude, labels=labels)

    def generate_batch(
        self,
        n_samples: int,
        cadence_range: tuple[float, float] = (150.0, 200.0),
        symmetry_range: tuple[float, float] = (0.80, 1.0),
        contact_time_range: tuple[float, float] = (180.0, 320.0),
        flight_time_range: tuple[float, float] = (80.0, 200.0),
        speed_range: tuple[float, float] = (7.0, 18.0),
        noise_level: float = 0.05,
    ) -> tuple[np.ndarray, dict[str, np.ndarray]]:
        """Generate a batch of synthetic windows for model training.

        Returns:
            Tuple of:
              - amplitudes: np.ndarray of shape (n_samples, window_size, num_subcarriers)
              - label_arrays: dict with keys matching GaitLabels fields, each shape (n_samples,)
        """
        amplitudes = np.zeros(
            (n_samples, self.window_size, self.num_subcarriers), dtype=np.float32
        )
        label_arrays: dict[str, list] = {
            "cadence_spm": [],
            "symmetry_proxy": [],
            "contact_time_ms": [],
            "flight_time_ms": [],
            "treadmill_speed_kmh": [],
        }

        for i in range(n_samples):
            cadence = self._rng.uniform(*cadence_range)
            symmetry = self._rng.uniform(*symmetry_range)
            contact_ms = self._rng.uniform(*contact_time_range)
            flight_ms = self._rng.uniform(*flight_time_range)
            speed = self._rng.uniform(*speed_range)

            win = self.generate_window(
                cadence_spm=cadence,
                symmetry=symmetry,
                contact_time_ms=contact_ms,
                flight_time_ms=flight_ms,
                treadmill_speed_kmh=speed,
                noise_level=noise_level,
            )

            amplitudes[i] = win.amplitude
            label_arrays["cadence_spm"].append(cadence)
            label_arrays["symmetry_proxy"].append(symmetry)
            label_arrays["contact_time_ms"].append(contact_ms)
            label_arrays["flight_time_ms"].append(flight_ms)
            label_arrays["treadmill_speed_kmh"].append(speed)

        return amplitudes, {k: np.array(v, dtype=np.float32) for k, v in label_arrays.items()}

    # ─── Internal helpers ─────────────────────────────────────────────────────

    def _gait_envelope(
        self,
        t: np.ndarray,
        step_freq_hz: float,
        duty_cycle: float,
        symmetry: float,
    ) -> np.ndarray:
        """Generate a periodic gait envelope from step frequency and duty cycle.

        Alternates left/right steps with asymmetry modeled as amplitude ratio.
        """
        cycle_period = 1.0 / step_freq_hz if step_freq_hz > 0 else 1.0
        phase = (t % cycle_period) / cycle_period  # 0..1 within each step cycle

        # First half of cycle = left step, second half = right step
        left_amp = 1.0
        right_amp = symmetry  # reduce right amplitude by symmetry factor

        envelope = np.zeros_like(t)
        in_contact = phase < duty_cycle

        left_half = phase < 0.5
        right_half = ~left_half

        # Half-sine contact pulse for each foot
        contact_phase_norm = np.where(
            left_half,
            phase / max(duty_cycle, 1e-6),
            (phase - 0.5) / max(duty_cycle, 1e-6),
        )
        contact_phase_norm = np.clip(contact_phase_norm, 0.0, 1.0)
        pulse = np.sin(contact_phase_norm * math.pi)

        # Apply amplitude by foot and contact mask
        envelope = (
            np.where(left_half, left_amp, right_amp)
            * np.where(phase % 0.5 < duty_cycle, pulse, 0.0)
        )

        return envelope.astype(np.float64)

    def _pink_noise(self, n: int) -> np.ndarray:
        """Generate approximate pink (1/f) noise via FFT shaping."""
        white = self._rng.standard_normal(n)
        fft = np.fft.rfft(white)
        freqs = np.fft.rfftfreq(n)
        freqs[0] = 1.0  # avoid division by zero at DC
        fft /= np.sqrt(freqs)
        fft[0] = 0.0  # zero DC
        pink = np.fft.irfft(fft, n=n)
        # Normalize
        std = pink.std()
        if std > 0:
            pink /= std
        return pink.astype(np.float64)

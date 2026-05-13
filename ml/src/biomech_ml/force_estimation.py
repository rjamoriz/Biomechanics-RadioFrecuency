"""
Force estimation proxies for treadmill running biomechanics.

IMPORTANT: These are PROXY estimates derived from gait-timing metrics (cadence,
contact time, flight time). They are NOT direct force measurements. They do NOT
replace a force plate or instrumented treadmill. All outputs carry an explicit
confidence score and must be labeled as proxy / experimental in all downstream
uses.

Spring-mass model references:
  - Morin et al. (2005) — spring-mass model approach for running
  - Dalleau et al. (1998) — energy cost of running and spring-mass model
"""

from __future__ import annotations

import math
from dataclasses import dataclass, field
from typing import Optional


@dataclass(frozen=True)
class ForceEstimateInput:
    """Inputs required for proxy force estimation.

    All timing values in milliseconds. Body weight in kg.
    """

    contact_time_ms: float          # Ground contact time proxy
    flight_time_ms: float           # Aerial phase proxy
    cadence_spm: float              # Steps per minute
    body_weight_kg: float           # Required for absolute force scaling
    step_frequency_hz: Optional[float] = None   # Derived from cadence if None
    leg_length_m: Optional[float] = None        # Assumed 0.92 m if None


@dataclass
class ForceEstimate:
    """Proxy force estimates from spring-mass biomechanical model.

    All absolute values (N, kN/m, kJ) are PROXY estimates with significant
    uncertainty. Normalized values (multiples of body weight) have lower
    uncertainty at typical running speeds.

    validation_status: always 'unvalidated' until compared against
    a force plate or validated reference.
    """

    # --- Proxy metrics -------------------------------------------------------
    peak_vgrf_proxy_n: float
    """Peak vertical ground reaction force proxy (Newtons).
    Spring-mass estimate: F_max ≈ (π/2) × BW × (flight_time/contact_time + 1).
    Uncertainty: ±15–25% vs force plate. Labeled experimental.
    """

    peak_vgrf_proxy_bw: float
    """Peak vGRF normalized to body weight (dimensionless multiples of BW)."""

    loading_rate_proxy_n_per_s: float
    """Estimated average loading rate proxy (N/s).
    Derived as: peak_vGRF / (contact_time / 2).
    Uncertainty increases at slow cadences.
    """

    leg_stiffness_proxy_kn_per_m: float
    """Spring-mass leg stiffness proxy (kN/m).
    k_leg = F_max / delta_L, where delta_L is estimated leg compression.
    """

    vertical_oscillation_proxy_cm: float
    """Estimated center-of-mass vertical oscillation (cm).
    Derived from flight time and gravitational acceleration.
    """

    impulse_proxy_n_s: float
    """Approximate vertical impulse proxy (N·s) over one contact phase."""

    # --- Metadata ------------------------------------------------------------
    confidence: float
    """0.0–1.0. Lower when cadence or contact-time is outside typical range."""

    signal_quality_context: str
    """Human-readable confidence note for UI / report display."""

    validation_status: str = "unvalidated"
    experimental: bool = True
    output_class: str = "proxy_metric"


# Constants
_G = 9.81  # m/s²
_DEFAULT_LEG_LENGTH_M = 0.92
_TYPICAL_CADENCE_RANGE = (140.0, 220.0)  # SPM — outside this range confidence drops
_TYPICAL_CONTACT_TIME_RANGE = (150.0, 350.0)  # ms


class SpringMassForceEstimator:
    """Estimates proxy force metrics from gait-timing inputs using the spring-mass model.

    Usage:
        estimator = SpringMassForceEstimator()
        result = estimator.estimate(ForceEstimateInput(...))
    """

    def estimate(self, inputs: ForceEstimateInput) -> ForceEstimate:
        ct_s = inputs.contact_time_ms / 1000.0
        ft_s = inputs.flight_time_ms / 1000.0
        bw_n = inputs.body_weight_kg * _G
        leg_len = inputs.leg_length_m or _DEFAULT_LEG_LENGTH_M

        # Validate inputs
        confidence = self._compute_confidence(inputs)

        # Peak vGRF proxy — spring-mass impulse-momentum model (Morin 2005)
        # F_max = (π / 2) × BW × (Tf / Tc + 1)
        peak_vgrf_n = (math.pi / 2) * bw_n * (ft_s / ct_s + 1.0) if ct_s > 0 else bw_n

        peak_vgrf_bw = peak_vgrf_n / bw_n if bw_n > 0 else 0.0

        # Average loading rate proxy: rise from 0 to peak in half contact time
        loading_rate = peak_vgrf_n / (ct_s / 2) if ct_s > 0 else 0.0

        # Vertical oscillation: free-fall distance during flight phase
        # delta_y = (1/8) × g × Tf²  (symmetric parabolic trajectory)
        vert_osc_m = (1.0 / 8.0) * _G * (ft_s ** 2)
        vert_osc_cm = vert_osc_m * 100.0

        # Leg compression at midstance (geometric spring-mass model)
        # Estimate running speed from cadence (proxy: ~3 m/s at 180 SPM, linear)
        # Used only for leg-angle geometry — not exposed as an output metric.
        step_freq_hz = (inputs.cadence_spm / 60.0) if inputs.step_frequency_hz is None \
                       else inputs.step_frequency_hz
        estimated_speed_ms = (inputs.cadence_spm / 180.0) * 3.0  # ~10.8 km/h at 180 SPM

        # Half-sweep angle during contact (spring-mass geometry, McMahon & Cheng 1990)
        # sin(θ) = v × tc / (2 × L0)
        sin_theta = min(estimated_speed_ms * ct_s / (2.0 * leg_len), 0.999)
        cos_theta = math.sqrt(1.0 - sin_theta ** 2)
        delta_l_angle_m = leg_len * (1.0 - cos_theta)
        delta_l_m = vert_osc_m + delta_l_angle_m
        delta_l_m = max(delta_l_m, 0.001)  # avoid division by zero

        leg_stiffness_n_per_m = peak_vgrf_n / delta_l_m
        leg_stiffness_kn_per_m = leg_stiffness_n_per_m / 1000.0

        # Impulse proxy: F_max × Tc / π  (half-sine approximation)
        impulse_n_s = peak_vgrf_n * ct_s / math.pi

        quality_note = self._quality_note(inputs, confidence)

        return ForceEstimate(
            peak_vgrf_proxy_n=round(peak_vgrf_n, 1),
            peak_vgrf_proxy_bw=round(peak_vgrf_bw, 3),
            loading_rate_proxy_n_per_s=round(loading_rate, 1),
            leg_stiffness_proxy_kn_per_m=round(leg_stiffness_kn_per_m, 2),
            vertical_oscillation_proxy_cm=round(vert_osc_cm, 1),
            impulse_proxy_n_s=round(impulse_n_s, 3),
            confidence=round(confidence, 3),
            signal_quality_context=quality_note,
            validation_status="unvalidated",
            experimental=True,
            output_class="proxy_metric",
        )

    # ─── Helpers ─────────────────────────────────────────────────────────────

    def _compute_confidence(self, inputs: ForceEstimateInput) -> float:
        confidence = 1.0

        # Cadence outside typical range
        lo, hi = _TYPICAL_CADENCE_RANGE
        if not (lo <= inputs.cadence_spm <= hi):
            deviation = min(abs(inputs.cadence_spm - lo), abs(inputs.cadence_spm - hi))
            confidence -= min(0.4, deviation / 100.0)

        # Contact time outside typical range
        ct_lo, ct_hi = _TYPICAL_CONTACT_TIME_RANGE
        if not (ct_lo <= inputs.contact_time_ms <= ct_hi):
            confidence -= 0.2

        # Flight time sanity
        if inputs.flight_time_ms < 0 or inputs.flight_time_ms > 500:
            confidence -= 0.3

        # Body weight sanity
        if not (30 <= inputs.body_weight_kg <= 200):
            confidence -= 0.3

        return max(0.0, min(1.0, confidence))

    def _quality_note(self, inputs: ForceEstimateInput, confidence: float) -> str:
        notes = []
        if confidence < 0.5:
            notes.append("low confidence — inputs outside typical running range")
        if not (_TYPICAL_CADENCE_RANGE[0] <= inputs.cadence_spm <= _TYPICAL_CADENCE_RANGE[1]):
            notes.append(f"cadence {inputs.cadence_spm:.0f} SPM outside 140–220 SPM range")
        if not (_TYPICAL_CONTACT_TIME_RANGE[0] <= inputs.contact_time_ms <= _TYPICAL_CONTACT_TIME_RANGE[1]):
            notes.append(f"contact time {inputs.contact_time_ms:.0f} ms outside 150–350 ms range")
        notes.append("proxy estimate — not a force plate measurement")
        return "; ".join(notes)

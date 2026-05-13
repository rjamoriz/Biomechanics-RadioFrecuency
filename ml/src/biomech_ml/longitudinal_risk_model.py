"""
Longitudinal injury risk forecasting model.

Combines ACWR, personal baseline deviations, and recent pain reports to
produce 7/14/28-day injury risk estimates per athlete.

All outputs are labeled as experimental proxy metrics.  They must not be
used for clinical diagnosis or autonomous treatment decisions.
"""

from __future__ import annotations

import math
from dataclasses import dataclass, field
from datetime import date, timedelta
from typing import Sequence

from biomech_ml.personal_baseline import (
    DeviationScore,
    MetricObservation,
    PersonalBaselineAnalyzer,
)


# ─── Input contracts ──────────────────────────────────────────────────────────


@dataclass(frozen=True)
class TrainingLoadRecord:
    """Minimal ACWR record from the backend TrainingLoad entity."""

    athlete_id: str
    session_date: date
    acute_load: float
    chronic_load: float
    acwr: float
    strain: float = 0.0


@dataclass(frozen=True)
class PainRecord:
    """Minimal pain observation from the backend PainReport entity."""

    athlete_id: str
    reported_date: date
    pain_scale: int  # 0–10
    body_region: str


@dataclass(frozen=True)
class BiomechObservation:
    """A proxy metric observation used for baseline deviation scoring."""

    athlete_id: str
    metric_name: str
    value: float
    observed_date: date


# ─── Output contracts ─────────────────────────────────────────────────────────


@dataclass
class HorizonRisk:
    """Risk estimate for a single forecast horizon."""

    horizon_days: int
    risk_score: float  # 0.0–1.0
    risk_level: str  # "low" | "moderate" | "high"
    confidence: float  # 0.0–1.0


@dataclass
class LongitudinalRiskForecast:
    """
    Multi-horizon injury risk forecast for one athlete.

    This is a proxy estimate — not a validated clinical tool.
    Outputs must not be used for medical diagnosis.
    """

    athlete_id: str
    forecast_date: date
    horizon_7d: HorizonRisk
    horizon_14d: HorizonRisk
    horizon_28d: HorizonRisk
    dominant_factors: list[str]
    acwr_contribution: float
    pain_contribution: float
    baseline_deviation_contribution: float
    signal_quality: float
    output_class: str = "proxy_metric"
    validation_status: str = "unvalidated"
    experimental: bool = True


# ─── Risk thresholds ──────────────────────────────────────────────────────────

_ACWR_HIGH = 1.5
_ACWR_CAUTION = 1.3
_ACWR_UNDER = 0.8

_PAIN_HIGH = 7
_PAIN_MODERATE = 4

_PAIN_WINDOW_DAYS = 14
_LOAD_WINDOW_DAYS = 28


def _risk_level(score: float) -> str:
    if score >= 0.65:
        return "high"
    if score >= 0.35:
        return "moderate"
    return "low"


# ─── Component scorers ───────────────────────────────────────────────────────


def _score_acwr(acwr: float) -> float:
    """Map ACWR to a 0–1 risk contribution.  Monotone in the danger zone."""
    if acwr <= 0:
        return 0.1  # no data / zero is also a signal
    if acwr < _ACWR_UNDER:
        # under-training: mild risk
        return 0.15 * (1.0 - acwr / _ACWR_UNDER)
    if acwr <= _ACWR_CAUTION:
        # optimal zone: negligible
        return 0.05
    if acwr <= _ACWR_HIGH:
        # caution zone: linear 0.2 → 0.5
        t = (acwr - _ACWR_CAUTION) / (_ACWR_HIGH - _ACWR_CAUTION)
        return 0.2 + 0.3 * t
    # above 1.5: steep increase, capped at 0.9
    excess = acwr - _ACWR_HIGH
    return min(0.9, 0.5 + 0.25 * excess)


def _score_pain(reports: Sequence[PainRecord], window_days: int, reference_date: date) -> float:
    """
    Aggregate recent pain reports into a 0–1 risk contribution.

    Uses cumulative decay-weighted severity rather than normalised average, so
    that old reports contribute less than recent ones and a single mild report
    at 5 days gives a clearly lower score than a severe recent report.
    Half-life = 5 days.  Score = 1 − exp(−weighted_sum).
    """
    cutoff = reference_date - timedelta(days=window_days)
    recent = [r for r in reports if cutoff <= r.reported_date <= reference_date]
    if not recent:
        return 0.0

    weighted_sum = 0.0
    for r in recent:
        age_days = (reference_date - r.reported_date).days
        decay = math.exp(-age_days * math.log(2) / 5.0)  # half-life = 5 days
        severity = r.pain_scale / 10.0
        weighted_sum += severity * decay

    # 1 − exp(−x): 0→0, 0.5→0.39, 1.0→0.63, 2.0→0.86
    return min(0.85, 1.0 - math.exp(-weighted_sum))


def _score_baseline_deviations(scores: Sequence[DeviationScore]) -> float:
    """
    Combine baseline deviation scores into a 0–1 risk contribution.

    Uses max-pool over z-scores, downweighted by low confidence.
    """
    if not scores:
        return 0.0

    weighted_scores = []
    for s in scores:
        if s.deviation_flag == "insufficient_data":
            continue
        # Normalise |z| to 0–1 via sigmoid-like mapping; 0→0, 2→0.5, 4→0.8
        z_abs = abs(s.z_score)
        mapped = z_abs / (z_abs + 2.0)
        weighted_scores.append(mapped * s.confidence)

    if not weighted_scores:
        return 0.0

    # Use soft-max-pool: 0.7 × max + 0.3 × mean
    mx = max(weighted_scores)
    mn = sum(weighted_scores) / len(weighted_scores)
    return min(0.8, 0.7 * mx + 0.3 * mn)


# ─── Main forecaster ──────────────────────────────────────────────────────────


class LongitudinalRiskForecaster:
    """
    Produces 7/14/28-day injury risk estimates from longitudinal athlete data.

    Risk scores are proxy estimates derived from ACWR, personal baseline
    deviations, and self-reported pain.  They are experimental outputs and
    must not be used as a substitute for clinical assessment.

    Parameters
    ----------
    acwr_weight:
        Contribution weight for ACWR component (default 0.45).
    pain_weight:
        Contribution weight for pain component (default 0.35).
    deviation_weight:
        Contribution weight for baseline-deviation component (default 0.20).
    baseline_window_days:
        Rolling window used when computing baseline stats (default 28).
    """

    def __init__(
        self,
        acwr_weight: float = 0.70,
        pain_weight: float = 0.20,
        deviation_weight: float = 0.10,
        baseline_window_days: int = 28,
    ) -> None:
        if abs(acwr_weight + pain_weight + deviation_weight - 1.0) > 1e-6:
            raise ValueError("Weights must sum to 1.0")
        self.acwr_weight = acwr_weight
        self.pain_weight = pain_weight
        self.deviation_weight = deviation_weight
        self._baseline_analyzer = PersonalBaselineAnalyzer(window_days=baseline_window_days)

    def forecast(
        self,
        athlete_id: str,
        load_history: Sequence[TrainingLoadRecord],
        pain_history: Sequence[PainRecord],
        biomech_observations: Sequence[BiomechObservation] | None = None,
        reference_date: date | None = None,
    ) -> LongitudinalRiskForecast:
        """
        Generate a multi-horizon risk forecast for one athlete.

        Parameters
        ----------
        athlete_id:
            Identifier of the athlete.
        load_history:
            Training load records (ACWR pre-computed by backend).
        pain_history:
            Pain report records.
        biomech_observations:
            Optional proxy metric observations for deviation scoring.
        reference_date:
            Date to forecast from.  Defaults to today.
        """
        ref = reference_date or date.today()

        # ── ACWR component ────────────────────────────────────────────────────
        acwr_score, acwr_signal_quality = self._compute_acwr_component(load_history, ref)

        # ── Pain component ────────────────────────────────────────────────────
        pain_score = _score_pain(pain_history, _PAIN_WINDOW_DAYS, ref)

        # ── Baseline deviation component ──────────────────────────────────────
        deviation_score, deviation_quality = self._compute_deviation_component(
            biomech_observations or [], ref
        )

        # ── Weighted composite ────────────────────────────────────────────────
        composite = (
            self.acwr_weight * acwr_score
            + self.pain_weight * pain_score
            + self.deviation_weight * deviation_score
        )
        composite = max(0.0, min(1.0, composite))

        # ── Horizon decay: risk diminishes over longer horizons when ACWR is acute
        base_7 = composite
        base_14 = composite * 0.92
        base_28 = composite * 0.82

        signal_quality = (
            0.5 * acwr_signal_quality
            + 0.3 * (1.0 if pain_history else 0.3)
            + 0.2 * deviation_quality
        )

        # ── Confidence per horizon (degrades over time) ───────────────────────
        conf_7 = signal_quality * 0.90
        conf_14 = signal_quality * 0.70
        conf_28 = signal_quality * 0.50

        # ── Dominant factors ──────────────────────────────────────────────────
        factors = self._identify_factors(
            acwr_score, pain_score, deviation_score, load_history, pain_history, ref
        )

        return LongitudinalRiskForecast(
            athlete_id=athlete_id,
            forecast_date=ref,
            horizon_7d=HorizonRisk(7, round(base_7, 4), _risk_level(base_7), round(conf_7, 4)),
            horizon_14d=HorizonRisk(14, round(base_14, 4), _risk_level(base_14), round(conf_28, 4)),
            horizon_28d=HorizonRisk(28, round(base_28, 4), _risk_level(base_28), round(conf_28, 4)),
            dominant_factors=factors,
            acwr_contribution=round(acwr_score, 4),
            pain_contribution=round(pain_score, 4),
            baseline_deviation_contribution=round(deviation_score, 4),
            signal_quality=round(signal_quality, 4),
        )

    # ── Internals ─────────────────────────────────────────────────────────────

    def _compute_acwr_component(
        self, load_history: Sequence[TrainingLoadRecord], ref: date
    ) -> tuple[float, float]:
        """Return (acwr_risk_score, signal_quality)."""
        cutoff = ref - timedelta(days=_LOAD_WINDOW_DAYS)
        recent = [r for r in load_history if cutoff <= r.session_date <= ref]
        if not recent:
            return 0.2, 0.1  # low-information default, minimal quality

        # Use most recent ACWR record
        latest = max(recent, key=lambda r: r.session_date)
        acwr_score = _score_acwr(latest.acwr)
        quality = min(1.0, len(recent) / 10.0)  # full quality at 10+ records
        return acwr_score, quality

    def _compute_deviation_component(
        self, observations: Sequence[BiomechObservation], ref: date
    ) -> tuple[float, float]:
        """Return (deviation_risk_score, signal_quality)."""
        if not observations:
            return 0.0, 0.0

        scores: list[DeviationScore] = []
        metric_obs: dict[str, list[MetricObservation]] = {}
        for o in sorted(observations, key=lambda x: x.observed_date):
            key = o.metric_name
            if key not in metric_obs:
                metric_obs[key] = []
            history = metric_obs[key].copy()
            current = MetricObservation(
                athlete_id=o.athlete_id,
                metric_name=o.metric_name,
                value=o.value,
                observed_date=o.observed_date,
            )
            if o.observed_date == ref:
                score = self._baseline_analyzer.score_observation(current, history)
                scores.append(score)
            metric_obs[key].append(current)

        if not scores:
            # score all observations, use last per metric
            for metric_name, obs_list in metric_obs.items():
                if obs_list:
                    current = obs_list[-1]
                    history = obs_list[:-1]
                    score = self._baseline_analyzer.score_observation(current, history)
                    scores.append(score)

        deviation_score = _score_baseline_deviations(scores)
        quality = min(1.0, len(scores) / 5.0)
        return deviation_score, quality

    def _identify_factors(
        self,
        acwr_score: float,
        pain_score: float,
        deviation_score: float,
        load_history: Sequence[TrainingLoadRecord],
        pain_history: Sequence[PainRecord],
        ref: date,
    ) -> list[str]:
        """Return list of dominant risk factor labels."""
        factors: list[str] = []

        if acwr_score >= 0.4:
            recent = [r for r in load_history if r.session_date > ref - timedelta(days=7)]
            if recent:
                latest_acwr = max(recent, key=lambda r: r.session_date).acwr
                if latest_acwr > _ACWR_HIGH:
                    factors.append(f"acwr_high ({latest_acwr:.2f})")
                elif latest_acwr > _ACWR_CAUTION:
                    factors.append(f"acwr_caution ({latest_acwr:.2f})")
            else:
                factors.append("acwr_elevated")

        if pain_score >= 0.3:
            recent_pain = [
                r for r in pain_history
                if r.reported_date > ref - timedelta(days=_PAIN_WINDOW_DAYS)
            ]
            if recent_pain:
                max_pain = max(r.pain_scale for r in recent_pain)
                regions = list({r.body_region for r in recent_pain})
                factors.append(f"pain_{'/'.join(regions[:2])} ({max_pain}/10)")

        if deviation_score >= 0.3:
            factors.append("biomech_deviation_elevated")

        if not factors:
            factors.append("no_dominant_factor")

        return factors

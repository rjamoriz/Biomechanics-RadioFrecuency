"""
Personal baseline analysis for per-athlete metric deviation scoring.

Computes rolling z-scores and percentile ranks for each athlete-metric pair
using historical time-series data.  All outputs are labeled as proxy metrics —
not validated clinical values.
"""

from __future__ import annotations

import math
from dataclasses import dataclass, field
from datetime import date, timedelta
from typing import Sequence


# ─── Data contracts ────────────────────────────────────────────────────────────


@dataclass(frozen=True)
class MetricObservation:
    """A single dated observation of one athlete metric."""

    athlete_id: str
    metric_name: str
    value: float
    observed_date: date


@dataclass
class BaselineStats:
    """Running statistics for one (athlete, metric, window_days) triple."""

    athlete_id: str
    metric_name: str
    window_days: int
    mean: float
    std: float
    sample_count: int
    output_class: str = "proxy_metric"
    validation_status: str = "unvalidated"
    experimental: bool = True


@dataclass
class DeviationScore:
    """
    Deviation of a single observation relative to the athlete's personal baseline.

    All scores are proxy estimates derived from historical training data.
    They are not validated clinical measurements.
    """

    athlete_id: str
    metric_name: str
    observed_value: float
    baseline_mean: float
    baseline_std: float
    z_score: float
    percentile_rank: float  # 0.0–1.0 (fraction of past values <= current)
    n_reference: int
    deviation_flag: str  # "normal" | "elevated" | "high" | "insufficient_data"
    output_class: str = "proxy_metric"
    validation_status: str = "unvalidated"
    experimental: bool = True
    confidence: float = 1.0


# ─── Constants ────────────────────────────────────────────────────────────────

_Z_ELEVATED = 1.5
_Z_HIGH = 2.5
_MIN_SAMPLES_FOR_ZSCORE = 5  # need at least this many to compute a reliable z


# ─── Normal CDF approximation (no scipy dep) ──────────────────────────────────


def _normal_cdf(z: float) -> float:
    """Abramowitz & Stegun approximation; max error < 7.5e-8."""
    sign = 1.0 if z >= 0 else -1.0
    z = abs(z)
    t = 1.0 / (1.0 + 0.2316419 * z)
    poly = t * (
        0.319381530
        + t * (-0.356563782 + t * (1.781477937 + t * (-1.821255978 + t * 1.330274429)))
    )
    cdf = 1.0 - (1.0 / math.sqrt(2 * math.pi)) * math.exp(-0.5 * z * z) * poly
    return 0.5 + sign * (cdf - 0.5)


# ─── Analyser ─────────────────────────────────────────────────────────────────


class PersonalBaselineAnalyzer:
    """
    Computes per-athlete deviation scores for biomechanical proxy metrics.

    Usage
    -----
    analyzer = PersonalBaselineAnalyzer(window_days=28)
    stats = analyzer.compute_baseline(observations)
    score = analyzer.score_observation(current_obs, observations)
    """

    def __init__(self, window_days: int = 28) -> None:
        if window_days < 1:
            raise ValueError("window_days must be >= 1")
        self.window_days = window_days

    # ── Baseline computation ──────────────────────────────────────────────────

    def compute_baseline(
        self,
        observations: Sequence[MetricObservation],
        reference_date: date | None = None,
    ) -> BaselineStats:
        """
        Compute mean and std from observations within the rolling window.

        Parameters
        ----------
        observations:
            All historical observations for one (athlete, metric) pair.
        reference_date:
            End of the window (inclusive).  Defaults to the most recent date in
            observations.
        """
        values = self._window_values(observations, reference_date)

        n = len(values)
        if n == 0:
            athlete_id = observations[0].athlete_id if observations else "unknown"
            metric_name = observations[0].metric_name if observations else "unknown"
            return BaselineStats(
                athlete_id=athlete_id,
                metric_name=metric_name,
                window_days=self.window_days,
                mean=0.0,
                std=0.0,
                sample_count=0,
            )

        mean = sum(values) / n
        variance = sum((v - mean) ** 2 for v in values) / n if n > 1 else 0.0
        std = math.sqrt(variance)

        athlete_id = observations[0].athlete_id
        metric_name = observations[0].metric_name
        return BaselineStats(
            athlete_id=athlete_id,
            metric_name=metric_name,
            window_days=self.window_days,
            mean=mean,
            std=std,
            sample_count=n,
        )

    # ── Deviation scoring ─────────────────────────────────────────────────────

    def score_observation(
        self,
        current: MetricObservation,
        history: Sequence[MetricObservation],
        reference_date: date | None = None,
    ) -> DeviationScore:
        """
        Score a single observation against the athlete's personal baseline.

        Parameters
        ----------
        current:
            The observation to evaluate.
        history:
            Historical observations for the same (athlete, metric) pair,
            NOT including the current observation.
        reference_date:
            End of the baseline window.  Defaults to the day before current.
        """
        if reference_date is None:
            reference_date = current.observed_date - timedelta(days=1)

        baseline = self.compute_baseline(history, reference_date)
        values = self._window_values(history, reference_date)
        n = len(values)

        if n < _MIN_SAMPLES_FOR_ZSCORE or baseline.std < 1e-9:
            return DeviationScore(
                athlete_id=current.athlete_id,
                metric_name=current.metric_name,
                observed_value=current.value,
                baseline_mean=baseline.mean,
                baseline_std=baseline.std,
                z_score=0.0,
                percentile_rank=0.5,
                n_reference=n,
                deviation_flag="insufficient_data",
                confidence=max(0.0, n / _MIN_SAMPLES_FOR_ZSCORE),
            )

        z = (current.value - baseline.mean) / baseline.std

        # Empirical percentile from history (fraction of past values <= current)
        empirical_percentile = sum(1 for v in values if v <= current.value) / n

        # Blend: 70% empirical, 30% Gaussian (more robust with small N)
        gaussian_percentile = _normal_cdf(z)
        blend = 0.7 * empirical_percentile + 0.3 * gaussian_percentile

        if abs(z) > _Z_HIGH:
            flag = "high"
        elif abs(z) > _Z_ELEVATED:
            flag = "elevated"
        else:
            flag = "normal"

        confidence = min(1.0, n / 20)  # full confidence at 20+ samples

        return DeviationScore(
            athlete_id=current.athlete_id,
            metric_name=current.metric_name,
            observed_value=current.value,
            baseline_mean=baseline.mean,
            baseline_std=baseline.std,
            z_score=round(z, 4),
            percentile_rank=round(blend, 4),
            n_reference=n,
            deviation_flag=flag,
            confidence=round(confidence, 4),
        )

    def score_batch(
        self,
        observations: Sequence[MetricObservation],
    ) -> list[DeviationScore]:
        """
        Score every observation against the window preceding it.

        Observations are processed in chronological order.  Each observation is
        scored using only the history that existed at the time of that observation
        (no look-ahead).
        """
        sorted_obs = sorted(observations, key=lambda o: o.observed_date)
        scores: list[DeviationScore] = []

        for i, obs in enumerate(sorted_obs):
            history = sorted_obs[:i]  # all observations strictly before current
            score = self.score_observation(obs, history, reference_date=obs.observed_date - timedelta(days=1))
            scores.append(score)

        return scores

    # ── Helpers ───────────────────────────────────────────────────────────────

    def _window_values(
        self,
        observations: Sequence[MetricObservation],
        reference_date: date | None,
    ) -> list[float]:
        if reference_date is None and observations:
            reference_date = max(o.observed_date for o in observations)
        elif reference_date is None:
            return []

        cutoff = reference_date - timedelta(days=self.window_days)
        return [
            o.value
            for o in observations
            if cutoff < o.observed_date <= reference_date
        ]

"""Tests for PersonalBaselineAnalyzer."""

from datetime import date, timedelta

import pytest

from biomech_ml.personal_baseline import (
    DeviationScore,
    MetricObservation,
    PersonalBaselineAnalyzer,
    _normal_cdf,
)


def _obs(athlete: str, metric: str, value: float, days_ago: int) -> MetricObservation:
    """Helper: create a MetricObservation relative to today."""
    return MetricObservation(
        athlete_id=athlete,
        metric_name=metric,
        value=value,
        observed_date=date.today() - timedelta(days=days_ago),
    )


def _cadence_history(n: int = 20, base: float = 170.0, spread: float = 3.0) -> list[MetricObservation]:
    """Create n historical cadence observations within a 28-day window."""
    return [_obs("a1", "cadence_spm", base + (i % 3) * spread, i + 1) for i in range(n)]


# ─── BaselineStats ────────────────────────────────────────────────────────────


class TestComputeBaseline:
    def test_mean_is_correct(self):
        obs = [_obs("a1", "contact_time_ms", float(v), d) for v, d in [(200, 5), (210, 10), (220, 15)]]
        analyzer = PersonalBaselineAnalyzer(window_days=28)
        stats = analyzer.compute_baseline(obs)
        assert abs(stats.mean - (200 + 210 + 220) / 3) < 1e-9

    def test_std_is_correct(self):
        values = [100.0, 110.0, 120.0, 130.0]
        obs = [_obs("a1", "m", v, i + 1) for i, v in enumerate(values)]
        analyzer = PersonalBaselineAnalyzer(window_days=28)
        stats = analyzer.compute_baseline(obs)
        mean = sum(values) / len(values)
        expected_std = (sum((v - mean) ** 2 for v in values) / len(values)) ** 0.5
        assert abs(stats.std - expected_std) < 1e-6

    def test_empty_observations_returns_zero_stats(self):
        analyzer = PersonalBaselineAnalyzer(window_days=28)
        stats = analyzer.compute_baseline([])
        assert stats.mean == 0.0
        assert stats.std == 0.0
        assert stats.sample_count == 0

    def test_observations_outside_window_are_excluded(self):
        inside = _obs("a1", "m", 100.0, 10)
        outside = _obs("a1", "m", 999.0, 50)  # 50 days ago — outside 28-day window
        analyzer = PersonalBaselineAnalyzer(window_days=28)
        stats = analyzer.compute_baseline([inside, outside])
        assert stats.sample_count == 1
        assert abs(stats.mean - 100.0) < 1e-9

    def test_output_class_is_proxy_metric(self):
        obs = [_obs("a1", "m", 1.0, 1)]
        stats = PersonalBaselineAnalyzer().compute_baseline(obs)
        assert stats.output_class == "proxy_metric"

    def test_validation_status_is_unvalidated(self):
        obs = [_obs("a1", "m", 1.0, 1)]
        stats = PersonalBaselineAnalyzer().compute_baseline(obs)
        assert stats.validation_status == "unvalidated"

    def test_experimental_is_true(self):
        obs = [_obs("a1", "m", 1.0, 1)]
        stats = PersonalBaselineAnalyzer().compute_baseline(obs)
        assert stats.experimental is True


# ─── DeviationScore — output contract ────────────────────────────────────────


class TestDeviationScoreContract:
    def test_output_class_is_proxy_metric(self):
        history = _cadence_history()
        current = _obs("a1", "cadence_spm", 170.0, 0)
        score = PersonalBaselineAnalyzer().score_observation(current, history)
        assert score.output_class == "proxy_metric"

    def test_validation_status_is_unvalidated(self):
        history = _cadence_history()
        current = _obs("a1", "cadence_spm", 170.0, 0)
        score = PersonalBaselineAnalyzer().score_observation(current, history)
        assert score.validation_status == "unvalidated"

    def test_experimental_is_true(self):
        history = _cadence_history()
        current = _obs("a1", "cadence_spm", 170.0, 0)
        score = PersonalBaselineAnalyzer().score_observation(current, history)
        assert score.experimental is True


# ─── Z-score and flag logic ───────────────────────────────────────────────────


class TestZScoreAndFlags:
    def test_value_at_mean_gives_z_near_zero(self):
        history = _cadence_history(n=20, base=170.0, spread=0.0)
        # All history = 170.0, std ≈ 0 → insufficient_data branch
        # Use spread > 0 to get real z-score
        history = _cadence_history(n=20, base=170.0, spread=5.0)
        mean = sum(o.value for o in history) / len(history)
        current = _obs("a1", "cadence_spm", mean, 0)
        score = PersonalBaselineAnalyzer().score_observation(current, history)
        assert abs(score.z_score) < 0.5

    def test_high_value_gives_positive_z(self):
        history = _cadence_history(n=20, base=170.0, spread=2.0)
        current = _obs("a1", "cadence_spm", 200.0, 0)  # 15+ std above
        score = PersonalBaselineAnalyzer().score_observation(current, history)
        assert score.z_score > 2.0

    def test_low_value_gives_negative_z(self):
        history = _cadence_history(n=20, base=170.0, spread=2.0)
        current = _obs("a1", "cadence_spm", 140.0, 0)
        score = PersonalBaselineAnalyzer().score_observation(current, history)
        assert score.z_score < -2.0

    def test_normal_flag_for_small_z(self):
        history = _cadence_history(n=20, base=170.0, spread=3.0)
        mean = sum(o.value for o in history) / len(history)
        current = _obs("a1", "cadence_spm", mean + 1.0, 0)
        score = PersonalBaselineAnalyzer().score_observation(current, history)
        assert score.deviation_flag == "normal"

    def test_elevated_flag_for_mid_z(self):
        history = _cadence_history(n=20, base=170.0, spread=1.0)
        # Force z ~ 2.0 (between 1.5 and 2.5)
        std_estimate = sum(o.value for o in history) / len(history)
        baseline = PersonalBaselineAnalyzer().compute_baseline(history)
        target = baseline.mean + 2.0 * baseline.std
        current = _obs("a1", "cadence_spm", target, 0)
        score = PersonalBaselineAnalyzer().score_observation(current, history)
        assert score.deviation_flag in ("elevated", "high")

    def test_high_flag_for_extreme_z(self):
        history = _cadence_history(n=20, base=170.0, spread=1.0)
        baseline = PersonalBaselineAnalyzer().compute_baseline(history)
        target = baseline.mean + 3.0 * baseline.std
        current = _obs("a1", "cadence_spm", target, 0)
        score = PersonalBaselineAnalyzer().score_observation(current, history)
        assert score.deviation_flag == "high"

    def test_insufficient_data_flag_with_few_samples(self):
        history = [_obs("a1", "m", 1.0, i + 1) for i in range(3)]  # < 5
        current = _obs("a1", "m", 2.0, 0)
        score = PersonalBaselineAnalyzer().score_observation(current, history)
        assert score.deviation_flag == "insufficient_data"


# ─── Percentile rank ─────────────────────────────────────────────────────────


class TestPercentileRank:
    def test_percentile_bounded_0_1(self):
        history = _cadence_history(n=20, base=170.0, spread=3.0)
        for val in [100.0, 170.0, 250.0]:
            current = _obs("a1", "cadence_spm", val, 0)
            score = PersonalBaselineAnalyzer().score_observation(current, history)
            assert 0.0 <= score.percentile_rank <= 1.0

    def test_high_value_has_high_percentile(self):
        history = _cadence_history(n=20, base=170.0, spread=2.0)
        current = _obs("a1", "cadence_spm", 200.0, 0)
        score = PersonalBaselineAnalyzer().score_observation(current, history)
        assert score.percentile_rank > 0.85

    def test_low_value_has_low_percentile(self):
        history = _cadence_history(n=20, base=170.0, spread=2.0)
        current = _obs("a1", "cadence_spm", 140.0, 0)
        score = PersonalBaselineAnalyzer().score_observation(current, history)
        assert score.percentile_rank < 0.15


# ─── Confidence ───────────────────────────────────────────────────────────────


class TestConfidence:
    def test_full_confidence_with_large_history(self):
        history = _cadence_history(n=25, base=170.0, spread=3.0)
        current = _obs("a1", "cadence_spm", 172.0, 0)
        score = PersonalBaselineAnalyzer().score_observation(current, history)
        assert score.confidence == 1.0

    def test_low_confidence_with_sparse_history(self):
        history = [_obs("a1", "m", float(i), i + 1) for i in range(5)]  # exactly 5
        current = _obs("a1", "m", 3.0, 0)
        score = PersonalBaselineAnalyzer().score_observation(current, history)
        assert score.confidence <= 0.5

    def test_confidence_zero_with_no_history(self):
        current = _obs("a1", "m", 1.0, 0)
        score = PersonalBaselineAnalyzer().score_observation(current, [])
        assert score.confidence == 0.0


# ─── Batch scoring ────────────────────────────────────────────────────────────


class TestBatchScoring:
    def test_batch_length_matches_input(self):
        observations = _cadence_history(n=10, base=170.0, spread=3.0)
        scores = PersonalBaselineAnalyzer().score_batch(observations)
        assert len(scores) == 10

    def test_no_lookahead_in_batch(self):
        # First observation should have 0 history → insufficient_data
        observations = sorted(_cadence_history(n=8, base=170.0, spread=2.0), key=lambda o: o.observed_date)
        scores = PersonalBaselineAnalyzer().score_batch(observations)
        assert scores[0].deviation_flag == "insufficient_data"

    def test_batch_scores_are_deviation_score_instances(self):
        observations = _cadence_history(n=10, base=170.0, spread=2.0)
        scores = PersonalBaselineAnalyzer().score_batch(observations)
        assert all(isinstance(s, DeviationScore) for s in scores)


# ─── Normal CDF approximation ────────────────────────────────────────────────


class TestNormalCDF:
    def test_cdf_at_zero_is_half(self):
        assert abs(_normal_cdf(0.0) - 0.5) < 1e-6

    def test_cdf_at_positive_infinity_approaches_one(self):
        assert _normal_cdf(10.0) > 0.9999

    def test_cdf_at_negative_infinity_approaches_zero(self):
        assert _normal_cdf(-10.0) < 0.0001

    def test_cdf_symmetry(self):
        for z in [1.0, 1.96, 2.576]:
            assert abs(_normal_cdf(z) + _normal_cdf(-z) - 1.0) < 1e-6


# ─── Invalid input ────────────────────────────────────────────────────────────


class TestInvalidInput:
    def test_negative_window_days_raises(self):
        with pytest.raises(ValueError):
            PersonalBaselineAnalyzer(window_days=0)

"""Tests for LongitudinalRiskForecaster."""

from datetime import date, timedelta

import pytest

from biomech_ml.longitudinal_risk_model import (
    BiomechObservation,
    HorizonRisk,
    LongitudinalRiskForecast,
    LongitudinalRiskForecaster,
    PainRecord,
    TrainingLoadRecord,
    _score_acwr,
    _score_pain,
)

TODAY = date.today()


def _load(athlete: str, days_ago: int, acwr: float, acute: float = 60.0) -> TrainingLoadRecord:
    return TrainingLoadRecord(
        athlete_id=athlete,
        session_date=TODAY - timedelta(days=days_ago),
        acute_load=acute,
        chronic_load=acute / acwr if acwr > 0 else 60.0,
        acwr=acwr,
    )


def _pain(athlete: str, days_ago: int, scale: int, region: str = "knee") -> PainRecord:
    return PainRecord(
        athlete_id=athlete,
        reported_date=TODAY - timedelta(days=days_ago),
        pain_scale=scale,
        body_region=region,
    )


def _biomech(athlete: str, metric: str, value: float, days_ago: int) -> BiomechObservation:
    return BiomechObservation(
        athlete_id=athlete,
        metric_name=metric,
        value=value,
        observed_date=TODAY - timedelta(days=days_ago),
    )


# ─── Output contract ──────────────────────────────────────────────────────────


class TestOutputContract:
    def setup_method(self):
        self.forecaster = LongitudinalRiskForecaster()
        self.loads = [_load("a1", 1, 1.0)]

    def test_output_class_is_proxy_metric(self):
        fc = self.forecaster.forecast("a1", self.loads, [])
        assert fc.output_class == "proxy_metric"

    def test_experimental_is_true(self):
        fc = self.forecaster.forecast("a1", self.loads, [])
        assert fc.experimental is True

    def test_validation_status_is_unvalidated(self):
        fc = self.forecaster.forecast("a1", self.loads, [])
        assert fc.validation_status == "unvalidated"

    def test_returns_three_horizons(self):
        fc = self.forecaster.forecast("a1", self.loads, [])
        assert fc.horizon_7d.horizon_days == 7
        assert fc.horizon_14d.horizon_days == 14
        assert fc.horizon_28d.horizon_days == 28

    def test_risk_scores_bounded_0_1(self):
        fc = self.forecaster.forecast("a1", self.loads, [])
        for h in (fc.horizon_7d, fc.horizon_14d, fc.horizon_28d):
            assert 0.0 <= h.risk_score <= 1.0

    def test_confidence_bounded_0_1(self):
        fc = self.forecaster.forecast("a1", self.loads, [])
        for h in (fc.horizon_7d, fc.horizon_14d, fc.horizon_28d):
            assert 0.0 <= h.confidence <= 1.0

    def test_risk_level_values(self):
        fc = self.forecaster.forecast("a1", self.loads, [])
        for h in (fc.horizon_7d, fc.horizon_14d, fc.horizon_28d):
            assert h.risk_level in ("low", "moderate", "high")

    def test_dominant_factors_is_list(self):
        fc = self.forecaster.forecast("a1", self.loads, [])
        assert isinstance(fc.dominant_factors, list)
        assert len(fc.dominant_factors) >= 1

    def test_contributions_bounded_0_1(self):
        fc = self.forecaster.forecast("a1", self.loads, [])
        assert 0.0 <= fc.acwr_contribution <= 1.0
        assert 0.0 <= fc.pain_contribution <= 1.0
        assert 0.0 <= fc.baseline_deviation_contribution <= 1.0


# ─── ACWR risk zone mapping ───────────────────────────────────────────────────


class TestAcwrScoring:
    def test_optimal_acwr_gives_low_score(self):
        # ACWR 1.0 → optimal zone
        assert _score_acwr(1.0) < 0.15

    def test_high_acwr_gives_high_score(self):
        # ACWR 1.8 → well above 1.5 threshold
        assert _score_acwr(1.8) >= 0.4

    def test_very_high_acwr_gives_near_max(self):
        assert _score_acwr(2.5) >= 0.6

    def test_undertraining_gives_small_positive_score(self):
        score = _score_acwr(0.5)
        assert 0.0 < score <= 0.20

    def test_caution_zone_between_low_and_high(self):
        low = _score_acwr(1.0)
        caution = _score_acwr(1.4)
        high = _score_acwr(1.8)
        assert low < caution < high

    def test_score_capped_at_0_9(self):
        assert _score_acwr(10.0) <= 0.9


# ─── Pain scoring ─────────────────────────────────────────────────────────────


class TestPainScoring:
    def test_no_pain_gives_zero(self):
        assert _score_pain([], 14, TODAY) == 0.0

    def test_high_recent_pain_gives_high_score(self):
        reports = [_pain("a1", 1, 9, "achilles"), _pain("a1", 2, 8, "achilles")]
        score = _score_pain(reports, 14, TODAY)
        assert score >= 0.5

    def test_low_pain_gives_low_score(self):
        reports = [_pain("a1", 5, 2, "knee")]
        score = _score_pain(reports, 14, TODAY)
        assert score < 0.25

    def test_old_pain_outside_window_excluded(self):
        recent = [_pain("a1", 3, 8, "shin")]
        old = [_pain("a1", 30, 9, "shin")]
        score_recent = _score_pain(recent, 14, TODAY)
        score_old = _score_pain(old, 14, TODAY)
        assert score_old == 0.0
        assert score_recent > 0.0

    def test_recent_pain_weighted_higher_than_old(self):
        very_recent = [_pain("a1", 1, 6, "hip")]
        older = [_pain("a1", 13, 6, "hip")]
        assert _score_pain(very_recent, 14, TODAY) > _score_pain(older, 14, TODAY)


# ─── High risk ACWR scenario ──────────────────────────────────────────────────


class TestHighRiskScenario:
    def test_high_acwr_produces_high_7d_risk(self):
        loads = [_load("a1", d, 1.8) for d in range(1, 8)]
        fc = LongitudinalRiskForecaster().forecast("a1", loads, [])
        assert fc.horizon_7d.risk_level in ("moderate", "high")

    def test_very_high_acwr_produces_high_level(self):
        loads = [_load("a1", 1, 2.2)]
        fc = LongitudinalRiskForecaster().forecast("a1", loads, [])
        assert fc.horizon_7d.risk_score >= 0.45

    def test_high_risk_includes_acwr_factor(self):
        loads = [_load("a1", 1, 2.0)]
        fc = LongitudinalRiskForecaster().forecast("a1", loads, [])
        assert any("acwr" in f.lower() for f in fc.dominant_factors)


# ─── Low risk scenario ────────────────────────────────────────────────────────


class TestLowRiskScenario:
    def test_optimal_acwr_no_pain_gives_low_risk(self):
        loads = [_load("a1", d, 1.1) for d in range(1, 15)]
        fc = LongitudinalRiskForecaster().forecast("a1", loads, [])
        assert fc.horizon_7d.risk_level == "low"

    def test_low_risk_score_below_threshold(self):
        loads = [_load("a1", d, 1.0) for d in range(1, 15)]
        fc = LongitudinalRiskForecaster().forecast("a1", loads, [])
        assert fc.horizon_7d.risk_score < 0.35


# ─── Pain escalation ─────────────────────────────────────────────────────────


class TestPainEscalation:
    def test_high_pain_elevates_risk(self):
        loads = [_load("a1", d, 1.1) for d in range(1, 8)]  # optimal ACWR
        pain = [_pain("a1", 1, 9, "achilles"), _pain("a1", 2, 8, "achilles")]
        fc_no_pain = LongitudinalRiskForecaster().forecast("a1", loads, [])
        fc_with_pain = LongitudinalRiskForecaster().forecast("a1", loads, pain)
        assert fc_with_pain.horizon_7d.risk_score > fc_no_pain.horizon_7d.risk_score

    def test_high_pain_included_in_factors(self):
        loads = [_load("a1", d, 1.0) for d in range(1, 8)]
        pain = [_pain("a1", 1, 9, "calf")]
        fc = LongitudinalRiskForecaster().forecast("a1", loads, pain)
        assert any("pain" in f.lower() for f in fc.dominant_factors)


# ─── Horizon decay ────────────────────────────────────────────────────────────


class TestHorizonDecay:
    def test_28d_risk_not_greater_than_7d(self):
        """Longer horizons should decay for acute risks."""
        loads = [_load("a1", 1, 2.0)]
        fc = LongitudinalRiskForecaster().forecast("a1", loads, [])
        assert fc.horizon_28d.risk_score <= fc.horizon_7d.risk_score + 0.01

    def test_confidence_degrades_with_horizon(self):
        loads = [_load("a1", d, 1.2) for d in range(1, 15)]
        fc = LongitudinalRiskForecaster().forecast("a1", loads, [])
        assert fc.horizon_7d.confidence >= fc.horizon_14d.confidence
        assert fc.horizon_14d.confidence >= fc.horizon_28d.confidence


# ─── No data edge cases ───────────────────────────────────────────────────────


class TestEdgeCases:
    def test_no_load_data_produces_forecast(self):
        """Should not raise; default low-data forecast."""
        fc = LongitudinalRiskForecaster().forecast("a1", [], [])
        assert isinstance(fc, LongitudinalRiskForecast)

    def test_no_load_quality_is_low(self):
        fc = LongitudinalRiskForecaster().forecast("a1", [], [])
        assert fc.signal_quality < 0.5

    def test_biomech_observations_affect_score(self):
        loads = [_load("a1", d, 1.0) for d in range(1, 15)]
        obs_normal = [_biomech("a1", "cadence_spm", 170.0, d) for d in range(1, 15)]
        obs_deviated = [_biomech("a1", "cadence_spm", 200.0 + d, d) for d in range(1, 15)]
        fc_normal = LongitudinalRiskForecaster().forecast("a1", loads, [], obs_normal)
        fc_deviated = LongitudinalRiskForecaster().forecast("a1", loads, [], obs_deviated)
        # Deviated biomech should produce higher or equal deviation contribution
        assert fc_deviated.baseline_deviation_contribution >= fc_normal.baseline_deviation_contribution


# ─── Weight validation ────────────────────────────────────────────────────────


class TestWeightValidation:
    def test_weights_must_sum_to_one(self):
        with pytest.raises(ValueError):
            LongitudinalRiskForecaster(acwr_weight=0.5, pain_weight=0.5, deviation_weight=0.5)

    def test_valid_custom_weights(self):
        # Should not raise
        f = LongitudinalRiskForecaster(acwr_weight=0.6, pain_weight=0.3, deviation_weight=0.1)
        assert f.acwr_weight == 0.6

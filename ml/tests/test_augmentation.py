"""
Tests for CSI-specific data augmentation functions and CsiAugmentor pipeline.
"""

import pytest
import torch

from biomech_ml.augmentation import (
    time_warp,
    noise_injection,
    amplitude_scaling,
    subcarrier_dropout,
    mixup,
    phase_shift,
    CsiAugmentor,
    AugmentorConfig,
)


# ── Fixtures ────────────────────────────────────────────────────────── #

@pytest.fixture
def batch_3d():
    """(batch=4, channels=2, subcarriers=32)"""
    torch.manual_seed(42)
    return torch.randn(4, 2, 32)


@pytest.fixture
def batch_4d():
    """(batch=4, seq_len=8, channels=2, subcarriers=32)"""
    torch.manual_seed(42)
    return torch.randn(4, 8, 2, 32)


# ── Shape preservation ──────────────────────────────────────────────── #

class TestShapePreservation:
    def test_time_warp_3d(self, batch_3d):
        assert time_warp(batch_3d).shape == batch_3d.shape

    def test_time_warp_4d(self, batch_4d):
        assert time_warp(batch_4d).shape == batch_4d.shape

    def test_noise_injection_3d(self, batch_3d):
        assert noise_injection(batch_3d).shape == batch_3d.shape

    def test_noise_injection_4d(self, batch_4d):
        assert noise_injection(batch_4d).shape == batch_4d.shape

    def test_amplitude_scaling_3d(self, batch_3d):
        assert amplitude_scaling(batch_3d).shape == batch_3d.shape

    def test_amplitude_scaling_4d(self, batch_4d):
        assert amplitude_scaling(batch_4d).shape == batch_4d.shape

    def test_subcarrier_dropout_3d(self, batch_3d):
        assert subcarrier_dropout(batch_3d).shape == batch_3d.shape

    def test_subcarrier_dropout_4d(self, batch_4d):
        assert subcarrier_dropout(batch_4d).shape == batch_4d.shape

    def test_phase_shift_3d(self, batch_3d):
        assert phase_shift(batch_3d).shape == batch_3d.shape

    def test_phase_shift_4d(self, batch_4d):
        assert phase_shift(batch_4d).shape == batch_4d.shape


# ── Noise injection ─────────────────────────────────────────────────── #

class TestNoiseInjection:
    def test_changes_values(self, batch_3d):
        noisy = noise_injection(batch_3d, scale=0.1)
        assert not torch.allclose(noisy, batch_3d), "Noise should change values"

    def test_zero_noise_preserves(self, batch_3d):
        same = noise_injection(batch_3d, scale=0.0)
        assert torch.allclose(same, batch_3d), "Zero noise should preserve input"

    def test_noise_magnitude(self, batch_3d):
        scale = 0.05
        noisy = noise_injection(batch_3d, scale=scale)
        diff = (noisy - batch_3d).abs().mean()
        # Expected mean of |N(0, scale)| = scale * sqrt(2/pi) ≈ scale * 0.8
        assert diff < scale * 3, "Noise magnitude seems too large"


# ── Amplitude scaling ───────────────────────────────────────────────── #

class TestAmplitudeScaling:
    def test_stays_in_range(self):
        x = torch.ones(8, 2, 32)
        scaled = amplitude_scaling(x, range=(0.8, 1.2))
        # All values should be between 0.8 and 1.2 for unit input
        assert (scaled >= 0.79).all() and (scaled <= 1.21).all()

    def test_per_subcarrier_variation(self, batch_3d):
        scaled = amplitude_scaling(batch_3d, range=(0.5, 2.0))
        # Different subcarriers should get different scales
        # Use extreme range to make it almost certain
        assert not torch.allclose(scaled, batch_3d, atol=0.01)


# ── Subcarrier dropout ──────────────────────────────────────────────── #

class TestSubcarrierDropout:
    def test_zeros_some_channels(self):
        torch.manual_seed(0)
        x = torch.ones(16, 2, 64)
        dropped = subcarrier_dropout(x, drop_rate=0.5)
        # With 50% drop rate on 64 subcarriers, some should be zero
        zero_cols = (dropped == 0).all(dim=1).any(dim=0)
        assert zero_cols.any(), "Some subcarrier columns should be zeroed"

    def test_zero_drop_preserves(self, batch_3d):
        same = subcarrier_dropout(batch_3d, drop_rate=0.0)
        assert torch.allclose(same, batch_3d)

    def test_full_drop_zeros_all(self, batch_3d):
        zeroed = subcarrier_dropout(batch_3d, drop_rate=1.0)
        assert (zeroed == 0).all()


# ── Mixup ───────────────────────────────────────────────────────────── #

class TestMixup:
    def test_output_shape(self, batch_3d):
        x2 = torch.randn_like(batch_3d)
        mixed, lam = mixup(batch_3d, x2, alpha=0.2)
        assert mixed.shape == batch_3d.shape

    def test_lambda_in_range(self, batch_3d):
        x2 = torch.randn_like(batch_3d)
        _, lam = mixup(batch_3d, x2, alpha=0.2)
        assert 0 <= lam <= 1

    def test_interpolation(self):
        x1 = torch.ones(2, 2, 16) * 10
        x2 = torch.zeros(2, 2, 16)
        mixed, lam = mixup(x1, x2, alpha=0.2)
        # mixed = lam * x1 + (1-lam) * x2 = lam * 10
        expected = lam * 10
        assert torch.allclose(mixed, torch.full_like(mixed, expected), atol=1e-5)


# ── Phase shift ─────────────────────────────────────────────────────── #

class TestPhaseShift:
    def test_amplitude_unchanged_3d(self, batch_3d):
        shifted = phase_shift(batch_3d, max_shift=1.0)
        # Channel 0 (amplitude) should be unchanged
        assert torch.allclose(shifted[:, 0, :], batch_3d[:, 0, :])

    def test_phase_channel_changed_3d(self, batch_3d):
        shifted = phase_shift(batch_3d, max_shift=1.0)
        # Channel 1 (phase) should be different
        assert not torch.allclose(shifted[:, 1, :], batch_3d[:, 1, :])

    def test_amplitude_unchanged_4d(self, batch_4d):
        shifted = phase_shift(batch_4d, max_shift=1.0)
        assert torch.allclose(shifted[:, :, 0, :], batch_4d[:, :, 0, :])

    def test_phase_channel_changed_4d(self, batch_4d):
        shifted = phase_shift(batch_4d, max_shift=1.0)
        assert not torch.allclose(shifted[:, :, 1, :], batch_4d[:, :, 1, :])


# ── CsiAugmentor pipeline ──────────────────────────────────────────── #

class TestCsiAugmentor:
    def test_default_chain_3d(self, batch_3d):
        aug = CsiAugmentor()
        result = aug(batch_3d)
        assert result.shape == batch_3d.shape

    def test_default_chain_4d(self, batch_4d):
        aug = CsiAugmentor()
        result = aug(batch_4d)
        assert result.shape == batch_4d.shape

    def test_all_disabled(self, batch_3d):
        cfg = AugmentorConfig(
            enable_time_warp=False,
            enable_noise=False,
            enable_amplitude_scaling=False,
            enable_subcarrier_dropout=False,
            enable_phase_shift=False,
        )
        aug = CsiAugmentor(cfg)
        result = aug(batch_3d)
        assert torch.allclose(result, batch_3d), "All disabled should return identity"

    def test_only_noise_enabled(self, batch_3d):
        cfg = AugmentorConfig(
            enable_time_warp=False,
            enable_noise=True,
            noise_scale=0.1,
            enable_amplitude_scaling=False,
            enable_subcarrier_dropout=False,
            enable_phase_shift=False,
        )
        aug = CsiAugmentor(cfg)
        result = aug(batch_3d)
        assert not torch.allclose(result, batch_3d)
        assert result.shape == batch_3d.shape

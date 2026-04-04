"""
Tests for CsiContrastiveEncoder — forward pass, L2 normalization, NT-Xent loss,
augmentation, parameter count, and safetensors roundtrip.
"""

import math
import tempfile
from pathlib import Path

import pytest
import torch

from biomech_ml.contrastive import (
    EMBEDDING_DIM,
    CsiAugmentation,
    CsiContrastiveEncoder,
    NTXentLoss,
    count_encoder_parameters,
    export_encoder_onnx,
    save_encoder_safetensors,
    load_encoder_safetensors,
)


# ── Fixtures ────────────────────────────────────────────────────────── #

@pytest.fixture
def encoder():
    return CsiContrastiveEncoder(num_subcarriers=16, window_size=32, d_model=32)


@pytest.fixture
def sample_input():
    torch.manual_seed(42)
    return torch.randn(4, 2, 32, 16)


@pytest.fixture
def augmentation():
    return CsiAugmentation()


# ── Output shape ────────────────────────────────────────────────────── #

class TestEncoderOutput:
    def test_output_shape(self, encoder, sample_input):
        z = encoder(sample_input)
        assert z.shape == (4, EMBEDDING_DIM), f"Expected (4, 128), got {z.shape}"

    def test_single_sample(self, encoder):
        x = torch.randn(1, 2, 32, 16)
        z = encoder(x)
        assert z.shape == (1, EMBEDDING_DIM)

    def test_backbone_output(self, encoder, sample_input):
        h = encoder.forward_backbone(sample_input)
        assert h.shape == (4, 32)  # d_model=32

    def test_encode_alias(self, encoder, sample_input):
        z1 = encoder(sample_input)
        z2 = encoder.encode(sample_input)
        # Same input → same output in eval mode
        encoder.eval()
        with torch.no_grad():
            z1 = encoder(sample_input)
            z2 = encoder.encode(sample_input)
        assert torch.allclose(z1, z2)


# ── L2 normalization ───────────────────────────────────────────────── #

class TestL2Normalization:
    def test_embeddings_are_unit_vectors(self, encoder, sample_input):
        encoder.eval()
        with torch.no_grad():
            z = encoder(sample_input)
        norms = torch.norm(z, p=2, dim=1)
        assert torch.allclose(norms, torch.ones(4), atol=1e-5), (
            f"Embeddings should be L2-normalized (unit vectors). Norms: {norms}"
        )

    def test_normalization_across_batches(self, encoder):
        encoder.eval()
        with torch.no_grad():
            z = encoder(torch.randn(16, 2, 32, 16))
        norms = torch.norm(z, p=2, dim=1)
        assert torch.allclose(norms, torch.ones(16), atol=1e-5)


# ── NT-Xent loss ────────────────────────────────────────────────────── #

class TestNTXentLoss:
    def test_loss_is_scalar(self):
        loss_fn = NTXentLoss(temperature=0.07)
        z_i = torch.randn(8, 128)
        z_j = torch.randn(8, 128)
        z_i = torch.nn.functional.normalize(z_i, dim=1)
        z_j = torch.nn.functional.normalize(z_j, dim=1)
        loss = loss_fn(z_i, z_j)
        assert loss.dim() == 0, "Loss should be scalar"
        assert loss.item() > 0, "Loss should be positive"

    def test_identical_pairs_have_low_loss(self):
        loss_fn = NTXentLoss(temperature=0.07)
        z = torch.nn.functional.normalize(torch.randn(8, 128), dim=1)
        loss_identical = loss_fn(z, z)
        loss_random = loss_fn(z, torch.nn.functional.normalize(torch.randn(8, 128), dim=1))
        assert loss_identical < loss_random, (
            "Identical pairs should have lower loss than random pairs"
        )

    def test_loss_differentiable(self):
        loss_fn = NTXentLoss(temperature=0.07)
        z_i = torch.randn(4, 128, requires_grad=True)
        z_j = torch.randn(4, 128, requires_grad=True)
        loss = loss_fn(z_i, z_j)
        loss.backward()
        assert z_i.grad is not None


# ── Augmentation ────────────────────────────────────────────────────── #

class TestAugmentation:
    def test_produces_valid_shapes(self, augmentation):
        x = torch.randn(2, 32, 16)  # (C, W, S)
        v1, v2 = augmentation(x)
        assert v1.shape == x.shape
        assert v2.shape == x.shape

    def test_views_are_different(self, augmentation):
        torch.manual_seed(0)
        x = torch.randn(2, 64, 64)
        v1, v2 = augmentation(x)
        # Views should differ (augmentations are stochastic)
        assert not torch.allclose(v1, v2, atol=1e-6), "Two views should differ"

    def test_no_nan_in_augmentation(self, augmentation):
        x = torch.randn(2, 32, 16)
        v1, v2 = augmentation(x)
        assert not torch.isnan(v1).any()
        assert not torch.isnan(v2).any()


# ── Parameter count ─────────────────────────────────────────────────── #

class TestParameterCount:
    def test_encoder_under_200k(self):
        """Default encoder should be ~100-200K params for edge viability."""
        enc = CsiContrastiveEncoder(num_subcarriers=64, window_size=64)
        n = count_encoder_parameters(enc)
        assert n < 500_000, f"Encoder too large: {n:,} params (target < 200K)"
        assert n > 10_000, f"Encoder suspiciously small: {n:,} params"

    def test_small_encoder_smaller(self, encoder):
        full = CsiContrastiveEncoder(num_subcarriers=64, window_size=64)
        assert count_encoder_parameters(encoder) < count_encoder_parameters(full)


# ── Export/load roundtrip ───────────────────────────────────────────── #

class TestSerialization:
    def test_safetensors_roundtrip(self, encoder, sample_input):
        encoder.eval()
        with torch.no_grad():
            z_before = encoder(sample_input)

        with tempfile.TemporaryDirectory() as tmpdir:
            path = str(Path(tmpdir) / "encoder.safetensors")
            save_encoder_safetensors(encoder, path)

            loaded = load_encoder_safetensors(
                path, num_subcarriers=16, window_size=32, d_model=32,
            )
            with torch.no_grad():
                z_after = loaded(sample_input)

        assert torch.allclose(z_before, z_after, atol=1e-6), (
            "Safetensors roundtrip should preserve model output"
        )

    def test_onnx_export_creates_file(self, encoder):
        with tempfile.TemporaryDirectory() as tmpdir:
            path = str(Path(tmpdir) / "encoder.onnx")
            export_encoder_onnx(encoder, path, num_subcarriers=16, window_size=32)
            assert Path(path).exists()
            assert Path(path).stat().st_size > 0

    def test_safetensors_file_size(self, encoder):
        """Safetensors should be compact for a small test encoder."""
        with tempfile.TemporaryDirectory() as tmpdir:
            path = str(Path(tmpdir) / "encoder.safetensors")
            save_encoder_safetensors(encoder, path)
            size_kb = Path(path).stat().st_size / 1024
            assert size_kb < 1500, f"Safetensors too large: {size_kb:.1f} KB"

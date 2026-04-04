"""
Tests for CsiPoseNet — forward pass, ONNX export roundtrip, feature dimensions.
"""

import pytest
import torch
import numpy as np
from pathlib import Path
import tempfile

from biomech_ml.model import CsiPoseNet, count_parameters, export_onnx, NUM_KEYPOINTS, KEYPOINT_DIM, NUM_PROXY_METRICS


# ── Fixtures ────────────────────────────────────────────────────────── #

@pytest.fixture
def model():
    """Standard model with default subcarrier/window config."""
    return CsiPoseNet(num_subcarriers=64, window_size=64)


@pytest.fixture
def small_model():
    """Smaller model for faster tests."""
    return CsiPoseNet(num_subcarriers=16, window_size=32, d_model=32, n_heads=2)


@pytest.fixture
def sample_input():
    """Batch of 4, channels=2, window=64, subcarriers=64."""
    torch.manual_seed(42)
    return torch.randn(4, 2, 64, 64)


@pytest.fixture
def small_input():
    torch.manual_seed(42)
    return torch.randn(2, 2, 32, 16)


# ── Forward pass ────────────────────────────────────────────────────── #

class TestForwardPass:
    def test_output_shapes(self, model, sample_input):
        kp, pm = model(sample_input)
        assert kp.shape == (4, NUM_KEYPOINTS * KEYPOINT_DIM), f"Expected (4, 51), got {kp.shape}"
        assert pm.shape == (4, NUM_PROXY_METRICS), f"Expected (4, 3), got {pm.shape}"

    def test_single_sample(self, model):
        x = torch.randn(1, 2, 64, 64)
        kp, pm = model(x)
        assert kp.shape == (1, 51)
        assert pm.shape == (1, 3)

    def test_small_model_output_shapes(self, small_model, small_input):
        kp, pm = small_model(small_input)
        assert kp.shape == (2, 51)
        assert pm.shape == (2, 3)

    def test_no_nan_in_output(self, model, sample_input):
        kp, pm = model(sample_input)
        assert not torch.isnan(kp).any(), "Keypoint output contains NaN"
        assert not torch.isnan(pm).any(), "Proxy metric output contains NaN"

    def test_deterministic_with_seed(self, model, sample_input):
        model.eval()
        with torch.no_grad():
            kp1, pm1 = model(sample_input)
            kp2, pm2 = model(sample_input)
        assert torch.allclose(kp1, kp2), "Model not deterministic in eval mode"
        assert torch.allclose(pm1, pm2), "Model not deterministic in eval mode"


# ── Parameter count ─────────────────────────────────────────────────── #

class TestParameterCount:
    def test_under_target(self, model):
        n = count_parameters(model)
        # Target: ~500K params for edge deployment
        assert n < 1_000_000, f"Model too large for edge: {n:,} params"
        assert n > 50_000, f"Model suspiciously small: {n:,} params"

    def test_small_model_smaller(self, model, small_model):
        assert count_parameters(small_model) < count_parameters(model)


# ── ONNX export ─────────────────────────────────────────────────────── #

class TestOnnxExport:
    def test_export_creates_file(self, small_model, small_input):
        with tempfile.TemporaryDirectory() as tmpdir:
            path = export_onnx(small_model, small_input[:1], Path(tmpdir) / "model.onnx")
            assert path.exists()
            assert path.stat().st_size > 0

    def test_onnx_roundtrip(self, small_model, small_input):
        """Export to ONNX, load with onnxruntime, verify output shapes match PyTorch."""
        try:
            import onnxruntime as ort
        except ImportError:
            pytest.skip("onnxruntime not installed")

        small_model.eval()
        single = small_input[:1]

        with torch.no_grad():
            pt_kp, pt_pm = small_model(single)

        with tempfile.TemporaryDirectory() as tmpdir:
            onnx_path = export_onnx(small_model, single, Path(tmpdir) / "model.onnx")
            sess = ort.InferenceSession(str(onnx_path))

            ort_inputs = {sess.get_inputs()[0].name: single.numpy()}
            ort_outputs = sess.run(None, ort_inputs)

            assert len(ort_outputs) == 2, f"Expected 2 outputs, got {len(ort_outputs)}"
            assert ort_outputs[0].shape == (1, 51), f"Keypoint shape mismatch: {ort_outputs[0].shape}"
            assert ort_outputs[1].shape == (1, 3), f"Proxy shape mismatch: {ort_outputs[1].shape}"

            # Values should be close (float32 precision)
            np.testing.assert_allclose(ort_outputs[0], pt_kp.numpy(), atol=1e-4)
            np.testing.assert_allclose(ort_outputs[1], pt_pm.numpy(), atol=1e-4)


# ── Feature dimensions ──────────────────────────────────────────────── #

class TestFeatureDimensions:
    def test_input_matches_dataset_output(self):
        """Feature vector dimensions from dataset should match model input."""
        # Dataset returns (C=2, W, S) — model expects (B, C, W, S)
        C, W, S = 2, 64, 64
        x = torch.randn(1, C, W, S)
        model = CsiPoseNet(num_subcarriers=S, window_size=W)
        kp, pm = model(x)
        assert kp.shape[-1] == 51
        assert pm.shape[-1] == 3

    def test_various_subcarrier_counts(self):
        """Model should handle different subcarrier counts."""
        for sc in [32, 52, 64, 128]:
            m = CsiPoseNet(num_subcarriers=sc, window_size=32)
            x = torch.randn(1, 2, 32, sc)
            kp, pm = m(x)
            assert kp.shape == (1, 51)
            assert pm.shape == (1, 3)

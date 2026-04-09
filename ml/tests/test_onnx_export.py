"""
Tests for ONNX export, validation, and inference session.
"""

import pytest
import numpy as np
import torch

from biomech_ml.onnx_export import (
    export_temporal_model,
    export_pretrain_encoder,
    validate_onnx_model,
    OnnxInferenceSession,
    ValidationResult,
    HAS_ORT,
    VALIDATION_STATES,
)
from biomech_ml.temporal_model import CsiTemporalModel, TemporalConfig
from biomech_ml.transfer_learning import CsiPretrainEncoder, PretrainConfig

# Skip all tests if onnxruntime is not installed
pytestmark = pytest.mark.skipif(not HAS_ORT, reason="onnxruntime not installed")


# ── Fixtures ────────────────────────────────────────────────────────── #


@pytest.fixture
def temporal_config():
    return TemporalConfig(num_subcarriers=16, hidden_dim=32, conv_channels=[16, 32])


@pytest.fixture
def temporal_model(temporal_config):
    model = CsiTemporalModel(temporal_config)
    model.eval()
    return model


@pytest.fixture
def pretrain_config():
    return PretrainConfig(
        embed_dim=32,
        projection_dim=16,
        num_subcarriers=16,
        conv_channels=[16, 32],
        conv_kernels=[3, 3],
    )


@pytest.fixture
def pretrain_encoder_model(pretrain_config):
    enc = CsiPretrainEncoder(pretrain_config)
    enc.eval()
    return enc


@pytest.fixture
def temporal_input():
    torch.manual_seed(42)
    return torch.randn(2, 8, 2, 16)


@pytest.fixture
def encoder_input():
    torch.manual_seed(42)
    return torch.randn(2, 2, 16)


# ── Export temporal model ────────────────────────────────────────────── #


class TestExportTemporalModel:
    def test_export_creates_file(self, temporal_model, tmp_path):
        path = export_temporal_model(temporal_model, tmp_path / "model.onnx")
        assert path.exists()
        assert path.suffix == ".onnx"

    def test_export_with_static_axes(self, temporal_model, tmp_path):
        path = export_temporal_model(
            temporal_model, tmp_path / "static.onnx", dynamic_axes=False
        )
        assert path.exists()

    def test_export_creates_parent_dirs(self, temporal_model, tmp_path):
        path = export_temporal_model(
            temporal_model, tmp_path / "sub" / "dir" / "model.onnx"
        )
        assert path.exists()


# ── Export pretrain encoder ──────────────────────────────────────────── #


class TestExportPretrainEncoder:
    def test_export_creates_file(self, pretrain_encoder_model, tmp_path):
        path = export_pretrain_encoder(pretrain_encoder_model, tmp_path / "encoder.onnx")
        assert path.exists()


# ── Validate ONNX model ─────────────────────────────────────────────── #


class TestValidateOnnx:
    def test_validate_temporal_close_outputs(self, temporal_model, temporal_input, tmp_path):
        onnx_path = export_temporal_model(temporal_model, tmp_path / "model.onnx")
        result = validate_onnx_model(
            onnx_path, temporal_input, pytorch_model=temporal_model
        )
        assert isinstance(result, ValidationResult)
        assert result.all_close
        assert result.max_diff < 1e-2

    def test_validate_returns_output_names(self, temporal_model, temporal_input, tmp_path):
        onnx_path = export_temporal_model(temporal_model, tmp_path / "model.onnx")
        result = validate_onnx_model(
            onnx_path, temporal_input, pytorch_model=temporal_model
        )
        assert "gait_phase" in result.output_names
        assert "stride_events" in result.output_names
        assert "fatigue_trend" in result.output_names

    def test_validate_without_pytorch_model(self, temporal_model, temporal_input, tmp_path):
        onnx_path = export_temporal_model(temporal_model, tmp_path / "model.onnx")
        result = validate_onnx_model(onnx_path, temporal_input)
        assert result.all_close  # trivially True with no reference
        assert result.max_diff == 0.0


# ── OnnxInferenceSession ────────────────────────────────────────────── #


class TestOnnxInferenceSession:
    def test_predict_returns_dict(self, temporal_model, tmp_path):
        onnx_path = export_temporal_model(temporal_model, tmp_path / "model.onnx")
        session = OnnxInferenceSession(onnx_path)
        inp = np.random.randn(1, 8, 2, 16).astype(np.float32)
        result = session.predict(inp)
        assert isinstance(result, dict)
        assert len(result) == 3

    def test_predict_with_torch_tensor(self, temporal_model, tmp_path):
        onnx_path = export_temporal_model(temporal_model, tmp_path / "model.onnx")
        session = OnnxInferenceSession(onnx_path)
        inp = torch.randn(1, 8, 2, 16)
        result = session.predict(inp)
        assert isinstance(result, dict)

    def test_latency_tracking(self, temporal_model, tmp_path):
        onnx_path = export_temporal_model(temporal_model, tmp_path / "model.onnx")
        session = OnnxInferenceSession(onnx_path)
        inp = np.random.randn(1, 8, 2, 16).astype(np.float32)
        session.predict(inp)
        session.predict(inp)
        assert len(session.latencies) == 2
        assert session.mean_latency_ms > 0

    def test_output_names_match(self, temporal_model, tmp_path):
        onnx_path = export_temporal_model(temporal_model, tmp_path / "model.onnx")
        session = OnnxInferenceSession(onnx_path)
        assert "gait_phase" in session.output_names

    def test_invalid_input_type_raises(self, temporal_model, tmp_path):
        onnx_path = export_temporal_model(temporal_model, tmp_path / "model.onnx")
        session = OnnxInferenceSession(onnx_path)
        with pytest.raises(TypeError):
            session.predict([1, 2, 3])

    def test_dynamic_batch_size(self, temporal_model, tmp_path):
        onnx_path = export_temporal_model(temporal_model, tmp_path / "model.onnx")
        session = OnnxInferenceSession(onnx_path)
        for batch_size in [1, 4, 8]:
            inp = np.random.randn(batch_size, 8, 2, 16).astype(np.float32)
            result = session.predict(inp)
            assert result["gait_phase"].shape[0] == batch_size


# ── ValidationResult ─────────────────────────────────────────────────── #


class TestValidationResult:
    def test_valid_states(self):
        for state in VALIDATION_STATES:
            vr = ValidationResult(
                max_diff=0.0, mean_diff=0.0, all_close=True,
                output_names=[], validation_state=state,
            )
            assert vr.validation_state == state

    def test_invalid_state_raises(self):
        with pytest.raises(ValueError, match="Invalid validation_state"):
            ValidationResult(
                max_diff=0.0, mean_diff=0.0, all_close=True,
                output_names=[], validation_state="bogus",
            )

"""
ONNX model export pipeline for biomechanics CSI models.

Provides export, validation, and inference utilities for deploying
PyTorch models (CsiTemporalModel, CsiPretrainEncoder) via ONNX Runtime.

All exported models produce EXPERIMENTAL proxy estimates derived from
Wi-Fi CSI sensing. Confidence and validation state must be tracked
externally in production deployments.
"""

from __future__ import annotations

import logging
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import numpy as np
import torch
import torch.nn as nn

logger = logging.getLogger(__name__)

# Conditional onnxruntime import
try:
    import onnxruntime as ort
    HAS_ORT = True
except ImportError:
    ort = None  # type: ignore[assignment]
    HAS_ORT = False

VALIDATION_STATES = ("unvalidated", "experimental", "station-validated", "externally-validated")


@dataclass
class ValidationResult:
    """Result of ONNX model validation against PyTorch reference."""

    max_diff: float
    mean_diff: float
    all_close: bool
    output_names: list[str]
    validation_state: str = "experimental"

    def __post_init__(self) -> None:
        if self.validation_state not in VALIDATION_STATES:
            raise ValueError(
                f"Invalid validation_state '{self.validation_state}'. "
                f"Must be one of {VALIDATION_STATES}"
            )


def export_temporal_model(
    model: nn.Module,
    path: str | Path,
    opset: int = 17,
    dynamic_axes: bool = True,
) -> Path:
    """Export a CsiTemporalModel to ONNX format.

    Args:
        model: CsiTemporalModel instance
        path: output .onnx file path
        opset: ONNX opset version
        dynamic_axes: if True, mark batch and seq_len as dynamic

    Returns:
        Path to the exported ONNX file.
    """
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    model.eval()

    # Dummy input: (batch=1, seq_len=8, channels=2, subcarriers)
    num_sub = getattr(model, "config", None)
    if num_sub is not None:
        num_sub = num_sub.num_subcarriers
    else:
        num_sub = 64
    dummy = torch.randn(1, 8, 2, num_sub)

    axes: dict[str, dict[int, str]] | None = None
    if dynamic_axes:
        axes = {
            "csi_input": {0: "batch", 1: "seq_len"},
            "gait_phase": {0: "batch", 1: "seq_len"},
            "stride_events": {0: "batch", 1: "seq_len"},
            "fatigue_trend": {0: "batch"},
        }

    with torch.no_grad():
        torch.onnx.export(
            model,
            dummy,
            str(path),
            opset_version=opset,
            input_names=["csi_input"],
            output_names=["gait_phase", "stride_events", "fatigue_trend"],
            dynamic_axes=axes,
        )

    logger.info("Exported temporal model to %s (opset=%d)", path, opset)
    return path


def export_pretrain_encoder(
    encoder: nn.Module,
    path: str | Path,
    opset: int = 17,
) -> Path:
    """Export a CsiPretrainEncoder (encode-only path) to ONNX.

    Args:
        encoder: CsiPretrainEncoder instance
        path: output .onnx file path
        opset: ONNX opset version

    Returns:
        Path to the exported ONNX file.
    """
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    encoder.eval()

    config = getattr(encoder, "config", None)
    num_sub = config.num_subcarriers if config else 64
    in_ch = config.in_channels if config else 2
    dummy = torch.randn(1, in_ch, num_sub)

    # Wrap to only call encode()
    class _EncodeWrapper(nn.Module):
        def __init__(self, enc: nn.Module) -> None:
            super().__init__()
            self.enc = enc

        def forward(self, x: torch.Tensor) -> torch.Tensor:
            return self.enc.encode(x)

    wrapper = _EncodeWrapper(encoder)
    wrapper.eval()

    with torch.no_grad():
        torch.onnx.export(
            wrapper,
            dummy,
            str(path),
            opset_version=opset,
            input_names=["csi_input"],
            output_names=["embedding"],
            dynamic_axes={"csi_input": {0: "batch"}, "embedding": {0: "batch"}},
        )

    logger.info("Exported pretrain encoder to %s (opset=%d)", path, opset)
    return path


def validate_onnx_model(
    onnx_path: str | Path,
    sample_input: torch.Tensor,
    pytorch_model: nn.Module | None = None,
    rtol: float = 1e-3,
    atol: float = 1e-5,
) -> ValidationResult:
    """Validate an ONNX model by comparing outputs to PyTorch reference.

    Args:
        onnx_path: path to .onnx file
        sample_input: input tensor matching the model's expected shape
        pytorch_model: PyTorch model for reference (if None, only checks ONNX runs)
        rtol: relative tolerance for allclose
        atol: absolute tolerance for allclose

    Returns:
        ValidationResult with comparison metrics.

    Raises:
        RuntimeError: if onnxruntime is not available.
    """
    if not HAS_ORT:
        raise RuntimeError(
            "onnxruntime is required for ONNX validation. "
            "Install with: pip install onnxruntime"
        )

    session = ort.InferenceSession(str(onnx_path))
    input_name = session.get_inputs()[0].name
    ort_inputs = {input_name: sample_input.numpy()}
    ort_outputs = session.run(None, ort_inputs)
    output_names = [o.name for o in session.get_outputs()]

    if pytorch_model is not None:
        pytorch_model.eval()
        with torch.no_grad():
            pt_out = pytorch_model(sample_input)

        # Flatten pytorch outputs to list
        if isinstance(pt_out, dict):
            pt_list = [pt_out[name].numpy() for name in output_names]
        elif isinstance(pt_out, torch.Tensor):
            pt_list = [pt_out.numpy()]
        else:
            pt_list = [t.numpy() if isinstance(t, torch.Tensor) else t for t in pt_out]

        diffs = []
        for ort_arr, pt_arr in zip(ort_outputs, pt_list):
            diffs.append(np.abs(ort_arr - pt_arr))

        all_diffs = np.concatenate([d.flatten() for d in diffs])
        max_diff = np.float32(all_diffs.max()).item()
        mean_diff = np.float32(all_diffs.mean()).item()
        all_close = bool(np.allclose(
            np.concatenate([o.flatten() for o in ort_outputs]),
            np.concatenate([p.flatten() for p in pt_list]),
            rtol=rtol,
            atol=atol,
        ))
    else:
        max_diff = 0.0
        mean_diff = 0.0
        all_close = True

    return ValidationResult(
        max_diff=max_diff,
        mean_diff=mean_diff,
        all_close=all_close,
        output_names=output_names,
    )


class OnnxInferenceSession:
    """Wrapper around onnxruntime.InferenceSession with latency tracking and input validation.

    Provides a predict() interface that returns a dict of named outputs
    and tracks inference latency.

    All predictions are EXPERIMENTAL proxy estimates.
    """

    def __init__(self, onnx_path: str | Path) -> None:
        if not HAS_ORT:
            raise RuntimeError(
                "onnxruntime is required for OnnxInferenceSession. "
                "Install with: pip install onnxruntime"
            )
        self.path = Path(onnx_path)
        self.session = ort.InferenceSession(str(self.path))
        self._input_meta = self.session.get_inputs()
        self._output_meta = self.session.get_outputs()
        self._latencies: list[float] = []

    @property
    def input_names(self) -> list[str]:
        return [inp.name for inp in self._input_meta]

    @property
    def output_names(self) -> list[str]:
        return [out.name for out in self._output_meta]

    @property
    def latencies(self) -> list[float]:
        """List of recent inference latencies in milliseconds."""
        return list(self._latencies)

    @property
    def mean_latency_ms(self) -> float:
        """Mean inference latency in milliseconds."""
        if not self._latencies:
            return 0.0
        return np.float32(np.mean(self._latencies)).item()

    def predict(self, csi_frames: np.ndarray | torch.Tensor) -> dict[str, np.ndarray]:
        """Run inference on CSI frames.

        Args:
            csi_frames: input array/tensor matching the model's expected shape.
                Will be converted to float32 numpy array.

        Returns:
            Dict mapping output name → numpy array.
        """
        if isinstance(csi_frames, torch.Tensor):
            csi_frames = csi_frames.numpy()

        if not isinstance(csi_frames, np.ndarray):
            raise TypeError(f"Expected np.ndarray or torch.Tensor, got {type(csi_frames)}")

        csi_frames = csi_frames.astype(np.float32)

        # Validate rank
        expected_dims = len(self._input_meta[0].shape)
        if expected_dims and csi_frames.ndim != expected_dims:
            raise ValueError(
                f"Input has {csi_frames.ndim} dims, model expects {expected_dims}"
            )

        input_name = self._input_meta[0].name
        t0 = time.perf_counter()
        outputs = self.session.run(None, {input_name: csi_frames})
        elapsed_ms = (time.perf_counter() - t0) * 1000.0
        self._latencies.append(elapsed_ms)

        return {name: arr for name, arr in zip(self.output_names, outputs)}

"""
Tests for model quantization — INT8, INT4, INT2.
"""

import tempfile
from pathlib import Path

import pytest
import torch

from biomech_ml.contrastive import CsiContrastiveEncoder
from biomech_ml.quantize import (
    compute_model_hash,
    export_quantized_binary,
    quantize_to_int2,
    quantize_to_int4,
    quantize_to_int8,
)


# ── Fixtures ────────────────────────────────────────────────────────── #

@pytest.fixture
def encoder():
    torch.manual_seed(42)
    return CsiContrastiveEncoder(num_subcarriers=16, window_size=32, d_model=32)


# ── INT8 ────────────────────────────────────────────────────────────── #

class TestInt8Quantization:
    def test_produces_bytes(self, encoder):
        q = quantize_to_int8(encoder)
        assert isinstance(q, bytes)
        assert len(q) > 0

    def test_smaller_than_fp32(self, encoder):
        q = quantize_to_int8(encoder)
        fp32_size = sum(p.numel() * 4 for p in encoder.parameters())
        assert len(q) < fp32_size, "INT8 should be smaller than FP32"


# ── INT4 ────────────────────────────────────────────────────────────── #

class TestInt4Quantization:
    def test_produces_bytes(self, encoder):
        q = quantize_to_int4(encoder)
        assert isinstance(q, bytes)
        assert len(q) > 0

    def test_smaller_than_int8(self, encoder):
        q8 = quantize_to_int8(encoder)
        q4 = quantize_to_int4(encoder)
        assert len(q4) < len(q8), "INT4 should be smaller than INT8"

    def test_approximate_target_size(self, encoder):
        """INT4 of a small encoder should be reasonably compact."""
        q = quantize_to_int4(encoder)
        size_kb = len(q) / 1024
        # Small test encoder with residual blocks — verify it's under 250 KB
        assert size_kb < 250, f"INT4 quantization too large: {size_kb:.1f} KB"


# ── INT2 ────────────────────────────────────────────────────────────── #

class TestInt2Quantization:
    def test_produces_bytes(self, encoder):
        q = quantize_to_int2(encoder)
        assert isinstance(q, bytes)
        assert len(q) > 0

    def test_smaller_than_int4(self, encoder):
        q4 = quantize_to_int4(encoder)
        q2 = quantize_to_int2(encoder)
        assert len(q2) < len(q4), "INT2 should be smaller than INT4"


# ── Export ──────────────────────────────────────────────────────────── #

class TestExport:
    def test_export_creates_file(self, encoder):
        q = quantize_to_int8(encoder)
        with tempfile.TemporaryDirectory() as tmpdir:
            path = export_quantized_binary(
                q, Path(tmpdir) / "test-int8", model_hash="abc123", bits=8,
            )
            assert path.exists()
            assert path.suffix == ".bin"
            assert path.stat().st_size == len(q)

    def test_export_creates_metadata(self, encoder):
        import json

        q = quantize_to_int4(encoder)
        with tempfile.TemporaryDirectory() as tmpdir:
            bin_path = export_quantized_binary(
                q, Path(tmpdir) / "test-int4", model_hash="abc123", bits=4,
            )
            meta_path = bin_path.with_suffix(".meta.json")
            assert meta_path.exists()

            with open(meta_path) as f:
                meta = json.load(f)

            assert meta["bits"] == 4
            assert meta["size_bytes"] == len(q)
            assert meta["original_model_hash"] == "abc123"
            assert meta["experimental"] is True

    def test_valid_binary(self, encoder):
        """Quantized binary should not be empty and should be readable."""
        q = quantize_to_int8(encoder)
        with tempfile.TemporaryDirectory() as tmpdir:
            path = export_quantized_binary(q, Path(tmpdir) / "test", bits=8)
            with open(path, "rb") as f:
                data = f.read()
            assert len(data) == len(q)


# ── Model hash ──────────────────────────────────────────────────────── #

class TestModelHash:
    def test_deterministic_hash(self, encoder):
        h1 = compute_model_hash(encoder)
        h2 = compute_model_hash(encoder)
        assert h1 == h2

    def test_different_models_different_hash(self):
        torch.manual_seed(1)
        e1 = CsiContrastiveEncoder(num_subcarriers=16, window_size=32, d_model=32)
        torch.manual_seed(99)
        e2 = CsiContrastiveEncoder(num_subcarriers=16, window_size=32, d_model=32)
        assert compute_model_hash(e1) != compute_model_hash(e2)

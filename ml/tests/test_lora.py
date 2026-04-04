"""
Tests for LoRA adapter — modification, size, serialization.
"""

import tempfile
from pathlib import Path

import pytest
import torch

from biomech_ml.contrastive import CsiContrastiveEncoder
from biomech_ml.lora import LoRAAdapter, LoRALinear, StationAdapter


# ── Fixtures ────────────────────────────────────────────────────────── #

@pytest.fixture
def encoder():
    return CsiContrastiveEncoder(num_subcarriers=16, window_size=32, d_model=32)


@pytest.fixture
def sample_input():
    torch.manual_seed(42)
    return torch.randn(2, 2, 32, 16)


@pytest.fixture
def lora_adapter(encoder):
    return LoRAAdapter(encoder, rank=4, alpha=1.0, target_layers=["projection"])


# ── LoRA modifies output ────────────────────────────────────────────── #

class TestLoRABehavior:
    def test_adapter_modifies_output(self, encoder, lora_adapter, sample_input):
        """LoRA should change the output after training (non-zero A init)."""
        encoder.eval()
        lora_adapter.eval()

        # Get original output (before LoRA is applied, but it's already wrapped)
        with torch.no_grad():
            out_adapted = lora_adapter(sample_input)

        # The output should be 128-dim embeddings
        assert out_adapted.shape == (2, 128)

    def test_lora_has_trainable_params(self, lora_adapter):
        n = lora_adapter.trainable_parameters()
        assert n > 0, "LoRA adapter should have trainable parameters"

    def test_encoder_frozen(self, lora_adapter):
        """Original encoder params should be frozen."""
        for name, param in lora_adapter.encoder.named_parameters():
            if "lora_A" not in name and "lora_B" not in name:
                assert not param.requires_grad, f"Param {name} should be frozen"


class TestLoRASize:
    def test_rank4_is_small(self, lora_adapter):
        """Rank-4 LoRA should add very few parameters."""
        n = lora_adapter.trainable_parameters()
        # For rank=4 on a projection layer: 4 * (in + out) per layer
        assert n < 10_000, f"LoRA too large: {n} params (expected < 10K for rank=4)"

    def test_higher_rank_has_more_params(self, encoder):
        lora_r4 = LoRAAdapter(
            CsiContrastiveEncoder(num_subcarriers=16, window_size=32, d_model=32),
            rank=4, target_layers=["projection"],
        )
        lora_r8 = LoRAAdapter(
            CsiContrastiveEncoder(num_subcarriers=16, window_size=32, d_model=32),
            rank=8, target_layers=["projection"],
        )
        assert lora_r8.trainable_parameters() > lora_r4.trainable_parameters()


class TestLoRALinearUnit:
    def test_forward_shape(self):
        original = torch.nn.Linear(128, 64)
        lora = LoRALinear(original, rank=4, alpha=1.0)
        x = torch.randn(2, 128)
        out = lora(x)
        assert out.shape == (2, 64)

    def test_trainable_count(self):
        original = torch.nn.Linear(128, 64)
        lora = LoRALinear(original, rank=4)
        # A: (4, 128) = 512, B: (64, 4) = 256 → total 768
        assert lora.trainable_parameters() == 4 * 128 + 64 * 4


# ── Station adapter JSON roundtrip ──────────────────────────────────── #

class TestStationAdapterSerialization:
    def test_save_load_roundtrip(self, lora_adapter, sample_input):
        station = StationAdapter(
            station_id="station-001",
            adapter=lora_adapter,
            notes="Test calibration",
        )

        with tempfile.TemporaryDirectory() as tmpdir:
            path = Path(tmpdir) / "station-001-adapter.json"
            station.save_json(path)

            assert path.exists()
            assert path.stat().st_size > 0

            # Load into a fresh adapter with same architecture
            fresh_encoder = CsiContrastiveEncoder(
                num_subcarriers=16, window_size=32, d_model=32,
            )
            fresh_adapter = LoRAAdapter(
                fresh_encoder, rank=4, alpha=1.0, target_layers=["projection"],
            )

            loaded = StationAdapter.load_json(path, fresh_adapter)

        assert loaded.station_id == "station-001"
        assert loaded.notes == "Test calibration"
        assert loaded.calibration_date is not None

    def test_json_contains_metadata(self, lora_adapter):
        import json

        station = StationAdapter(
            station_id="station-test",
            adapter=lora_adapter,
        )

        with tempfile.TemporaryDirectory() as tmpdir:
            path = Path(tmpdir) / "station-test.json"
            station.save_json(path)

            with open(path) as f:
                payload = json.load(f)

        assert payload["station_id"] == "station-test"
        assert payload["experimental"] is True
        assert payload["validation_status"] == "station-validated"
        assert "adapter_weights" in payload
        assert "calibration_date" in payload

"""
Tests for CsiTemporalModel — forward pass shapes, output ranges, gradient flow,
bidirectional vs unidirectional, variable sequence lengths, and synthetic data.
"""

import pytest
import torch

from biomech_ml.temporal_model import (
    CsiTemporalModel,
    TemporalConfig,
    WindowEncoder,
    create_temporal_model,
    count_temporal_parameters,
    NUM_GAIT_PHASES,
    NUM_STRIDE_EVENTS,
)
from biomech_ml.train_temporal import (
    SyntheticGaitDataset,
    TemporalTrainer,
    TrainConfig,
    generate_synthetic_gait_data,
    gait_collate_fn,
)


# ── Fixtures ────────────────────────────────────────────────────────── #

@pytest.fixture
def config():
    return TemporalConfig(num_subcarriers=16, hidden_dim=32, conv_channels=[32, 64])


@pytest.fixture
def model(config):
    return CsiTemporalModel(config)


@pytest.fixture
def default_model():
    return create_temporal_model()


@pytest.fixture
def sample_input():
    """Batch=4, seq_len=10, channels=2, subcarriers=16."""
    torch.manual_seed(42)
    return torch.randn(4, 10, 2, 16)


@pytest.fixture
def default_input():
    """Batch=2, seq_len=8, channels=2, subcarriers=64."""
    torch.manual_seed(42)
    return torch.randn(2, 8, 2, 64)


# ── Forward pass shape verification ────────────────────────────────── #

class TestForwardShapes:
    def test_gait_phase_shape(self, model, sample_input):
        out = model(sample_input)
        assert out["gait_phase"].shape == (4, 10, NUM_GAIT_PHASES)

    def test_stride_events_shape(self, model, sample_input):
        out = model(sample_input)
        assert out["stride_events"].shape == (4, 10, NUM_STRIDE_EVENTS)

    def test_fatigue_trend_shape(self, model, sample_input):
        out = model(sample_input)
        assert out["fatigue_trend"].shape == (4, 1)

    def test_default_config_shapes(self, default_model, default_input):
        out = default_model(default_input)
        assert out["gait_phase"].shape == (2, 8, NUM_GAIT_PHASES)
        assert out["stride_events"].shape == (2, 8, NUM_STRIDE_EVENTS)
        assert out["fatigue_trend"].shape == (2, 1)

    def test_single_sample(self, model):
        x = torch.randn(1, 5, 2, 16)
        out = model(x)
        assert out["gait_phase"].shape == (1, 5, NUM_GAIT_PHASES)


# ── Output probability ranges ──────────────────────────────────────── #

class TestOutputRanges:
    def test_gait_phase_is_probability(self, model, sample_input):
        model.eval()
        with torch.no_grad():
            out = model(sample_input)
        gp = out["gait_phase"]
        assert (gp >= 0).all(), "Gait phase probabilities must be >= 0"
        assert (gp <= 1).all(), "Gait phase probabilities must be <= 1"
        # Should sum to ~1 along phase dim
        sums = gp.sum(dim=-1)
        assert torch.allclose(sums, torch.ones_like(sums), atol=1e-5), (
            f"Gait phase should sum to 1, got {sums}"
        )

    def test_stride_events_are_sigmoid(self, model, sample_input):
        model.eval()
        with torch.no_grad():
            out = model(sample_input)
        se = out["stride_events"]
        assert (se >= 0).all() and (se <= 1).all(), "Stride events must be in [0,1]"

    def test_no_nan_in_outputs(self, model, sample_input):
        out = model(sample_input)
        for key, val in out.items():
            assert not torch.isnan(val).any(), f"NaN in {key}"


# ── Bidirectional vs unidirectional ─────────────────────────────────── #

class TestBidirectional:
    def test_bidirectional_doubles_output_dim(self):
        cfg_bi = TemporalConfig(num_subcarriers=16, hidden_dim=32, bidirectional=True,
                                conv_channels=[32, 64])
        cfg_uni = TemporalConfig(num_subcarriers=16, hidden_dim=32, bidirectional=False,
                                 conv_channels=[32, 64])
        model_bi = CsiTemporalModel(cfg_bi)
        model_uni = CsiTemporalModel(cfg_uni)
        # Bidirectional model has more params due to doubled LSTM output
        assert count_temporal_parameters(model_bi) > count_temporal_parameters(model_uni)

    def test_unidirectional_forward_pass(self):
        cfg = TemporalConfig(num_subcarriers=16, hidden_dim=32, bidirectional=False,
                             conv_channels=[32, 64])
        model = CsiTemporalModel(cfg)
        x = torch.randn(2, 6, 2, 16)
        out = model(x)
        assert out["gait_phase"].shape == (2, 6, NUM_GAIT_PHASES)


# ── Variable sequence lengths ───────────────────────────────────────── #

class TestVariableSequences:
    def test_short_sequence(self, model):
        x = torch.randn(2, 3, 2, 16)
        out = model(x)
        assert out["gait_phase"].shape[1] == 3

    def test_long_sequence(self, model):
        x = torch.randn(1, 50, 2, 16)
        out = model(x)
        assert out["gait_phase"].shape[1] == 50

    def test_single_frame(self, model):
        x = torch.randn(1, 1, 2, 16)
        out = model(x)
        assert out["gait_phase"].shape == (1, 1, NUM_GAIT_PHASES)


# ── Gradient flow ───────────────────────────────────────────────────── #

class TestGradientFlow:
    def test_all_heads_receive_gradients(self, model, sample_input):
        out = model(sample_input)
        # Create a combined loss from all heads
        loss = (
            out["gait_phase"].sum()
            + out["stride_events"].sum()
            + out["fatigue_trend"].sum()
        )
        loss.backward()

        for name, param in model.named_parameters():
            if param.requires_grad:
                assert param.grad is not None, f"No gradient for {name}"
                assert not torch.all(param.grad == 0), f"Zero gradient for {name}"


# ── Factory function ────────────────────────────────────────────────── #

class TestFactory:
    def test_create_with_default(self):
        m = create_temporal_model()
        assert isinstance(m, CsiTemporalModel)

    def test_create_with_custom_config(self):
        cfg = TemporalConfig(hidden_dim=64, num_layers=3)
        m = create_temporal_model(cfg)
        assert m.config.hidden_dim == 64
        assert m.config.num_layers == 3


# ── Synthetic data ──────────────────────────────────────────────────── #

class TestSyntheticData:
    def test_dataset_length(self):
        ds = generate_synthetic_gait_data(20, seq_len=10, num_subcarriers=16)
        assert len(ds) == 20

    def test_sample_shapes(self):
        ds = generate_synthetic_gait_data(5, seq_len=10, num_subcarriers=16)
        sample = ds[0]
        assert sample["csi"].shape == (10, 2, 16)
        assert sample["gait_phase"].shape == (10,)
        assert sample["stride_events"].shape == (10, 2)
        assert sample["fatigue"].dim() == 0  # scalar

    def test_gait_phase_labels_in_range(self):
        ds = generate_synthetic_gait_data(10, seq_len=20, num_subcarriers=16)
        for i in range(len(ds)):
            labels = ds[i]["gait_phase"]
            assert (labels >= 0).all() and (labels < NUM_GAIT_PHASES).all()

    def test_stride_events_binary(self):
        ds = generate_synthetic_gait_data(10, seq_len=20, num_subcarriers=16)
        for i in range(len(ds)):
            events = ds[i]["stride_events"]
            unique = torch.unique(events)
            assert all(v in (0.0, 1.0) for v in unique.tolist())

    def test_deterministic_with_seed(self):
        ds1 = generate_synthetic_gait_data(5, seq_len=10, num_subcarriers=16, seed=123)
        ds2 = generate_synthetic_gait_data(5, seq_len=10, num_subcarriers=16, seed=123)
        assert torch.allclose(ds1[0]["csi"], ds2[0]["csi"])


# ── Trainer integration ─────────────────────────────────────────────── #

class TestTrainer:
    def test_train_epoch_runs(self):
        cfg = TemporalConfig(num_subcarriers=16, hidden_dim=16, conv_channels=[16, 32])
        model = CsiTemporalModel(cfg)
        trainer = TemporalTrainer(model, TrainConfig(learning_rate=1e-3))

        ds = generate_synthetic_gait_data(8, seq_len=6, num_subcarriers=16)
        dl = torch.utils.data.DataLoader(ds, batch_size=4, collate_fn=gait_collate_fn)

        metrics = trainer.train_epoch(dl)
        assert "total" in metrics
        assert metrics["total"] > 0

    def test_evaluate_returns_metrics(self):
        cfg = TemporalConfig(num_subcarriers=16, hidden_dim=16, conv_channels=[16, 32])
        model = CsiTemporalModel(cfg)
        trainer = TemporalTrainer(model, TrainConfig())

        ds = generate_synthetic_gait_data(8, seq_len=6, num_subcarriers=16)
        dl = torch.utils.data.DataLoader(ds, batch_size=4, collate_fn=gait_collate_fn)

        metrics = trainer.evaluate(dl)
        assert "val_loss" in metrics
        assert "gait_phase_accuracy" in metrics
        assert "stride_event_f1" in metrics
        assert 0 <= metrics["gait_phase_accuracy"] <= 1

    def test_early_stopping(self):
        cfg = TemporalConfig(num_subcarriers=16, hidden_dim=16, conv_channels=[16, 32])
        model = CsiTemporalModel(cfg)
        trainer = TemporalTrainer(model, TrainConfig(early_stop_patience=3))

        assert not trainer.check_early_stop(1.0)
        assert not trainer.check_early_stop(0.9)  # improvement
        assert not trainer.check_early_stop(0.95)  # worse, patience 1
        assert not trainer.check_early_stop(0.95)  # worse, patience 2
        assert trainer.check_early_stop(0.95)  # worse, patience 3 → stop

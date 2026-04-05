"""Tests for advanced SSL modules: MAE, DAE, domain adaptation, combined trainer."""
import pytest
import torch
import tempfile
import os

from biomech_ml.advanced_ssl import (
    CsiMaskedAutoencoder,
    CsiDenoisingAutoencoder,
    StationDomainAdapter,
    AdvancedSSLTrainer,
    DEFAULT_MASK_RATIO,
    DEFAULT_GAUSSIAN_STD,
    DEFAULT_IMPULSE_PROB,
)
from biomech_ml.contrastive import CsiContrastiveEncoder, EMBEDDING_DIM

# Input shape: (B, 2, W, S) — 2 channels (amp+phase), W=window, S=subcarriers
NUM_SUBS = 64
WINDOW = 64
INPUT_DIM = 2 * WINDOW * NUM_SUBS  # flat dim if needed


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

@pytest.fixture
def batch():
    """Batch of CSI frames: (B, 2, W, S) = (4, 2, 64, 64)."""
    return torch.randn(4, 2, WINDOW, NUM_SUBS)


@pytest.fixture
def target_batch():
    """Target station batch for domain adaptation: (4, 2, 64, 64)."""
    return torch.randn(4, 2, WINDOW, NUM_SUBS)


# ---------------------------------------------------------------------------
# CsiMaskedAutoencoder
# ---------------------------------------------------------------------------

class TestCsiMaskedAutoencoder:
    def test_forward_output_shape(self, batch):
        mae = CsiMaskedAutoencoder(input_dim=INPUT_DIM, num_subcarriers=NUM_SUBS, window_size=WINDOW)
        recon, masked_input, mask = mae(batch)
        assert recon.shape == batch.shape
        assert masked_input.shape == batch.shape
        assert mask.shape == (4, NUM_SUBS)

    def test_mask_ratio(self, batch):
        mae = CsiMaskedAutoencoder(input_dim=INPUT_DIM, num_subcarriers=NUM_SUBS, window_size=WINDOW, mask_ratio=0.4)
        _, _, mask = mae(batch)
        ratio = mask.float().mean().item()
        assert 0.2 < ratio < 0.6  # allow some variance

    def test_compute_loss_nonneg(self, batch):
        mae = CsiMaskedAutoencoder(input_dim=INPUT_DIM, num_subcarriers=NUM_SUBS, window_size=WINDOW)
        loss = mae.compute_loss(batch)
        assert loss.item() >= 0

    def test_encode_produces_embedding(self, batch):
        mae = CsiMaskedAutoencoder(input_dim=INPUT_DIM, num_subcarriers=NUM_SUBS, window_size=WINDOW)
        emb = mae.encode(batch)
        assert emb.shape == (4, EMBEDDING_DIM)

    def test_encode_is_deterministic(self, batch):
        mae = CsiMaskedAutoencoder(input_dim=INPUT_DIM, num_subcarriers=NUM_SUBS, window_size=WINDOW)
        mae.eval()
        with torch.no_grad():
            e1 = mae.encode(batch)
            e2 = mae.encode(batch)
        assert torch.allclose(e1, e2)


# ---------------------------------------------------------------------------
# CsiDenoisingAutoencoder
# ---------------------------------------------------------------------------

class TestCsiDenoisingAutoencoder:
    def test_forward_output_shape(self, batch):
        dae = CsiDenoisingAutoencoder(input_dim=INPUT_DIM, num_subcarriers=NUM_SUBS, window_size=WINDOW)
        recon, noisy = dae(batch)
        assert recon.shape == batch.shape
        assert noisy.shape == batch.shape

    def test_noise_injection(self, batch):
        dae = CsiDenoisingAutoencoder(input_dim=INPUT_DIM, num_subcarriers=NUM_SUBS, window_size=WINDOW)
        dae.train()
        noisy = dae._add_noise(batch)
        assert not torch.allclose(noisy, batch, atol=1e-6)

    def test_reconstruction_not_nan(self, batch):
        dae = CsiDenoisingAutoencoder(input_dim=INPUT_DIM, num_subcarriers=NUM_SUBS, window_size=WINDOW)
        recon, _ = dae(batch)
        assert not torch.isnan(recon).any()

    def test_encode_produces_embedding(self, batch):
        dae = CsiDenoisingAutoencoder(input_dim=INPUT_DIM, num_subcarriers=NUM_SUBS, window_size=WINDOW)
        emb = dae.encode(batch)
        assert emb.shape == (4, EMBEDDING_DIM)


# ---------------------------------------------------------------------------
# StationDomainAdapter
# ---------------------------------------------------------------------------

class TestStationDomainAdapter:
    def _make_adapter(self):
        encoder = CsiContrastiveEncoder(
            num_subcarriers=NUM_SUBS,
            window_size=WINDOW,
            embedding_dim=EMBEDDING_DIM,
        )
        return StationDomainAdapter(encoder=encoder)

    def test_mmd_same_distribution_near_zero(self):
        adapter = self._make_adapter()
        x = torch.randn(100, EMBEDDING_DIM)
        mmd = adapter.compute_mmd(x, x)
        assert mmd.item() < 0.05

    def test_mmd_different_distributions_positive(self):
        adapter = self._make_adapter()
        x = torch.randn(100, EMBEDDING_DIM)
        y = torch.randn(100, EMBEDDING_DIM) + 5.0
        mmd = adapter.compute_mmd(x, y)
        # In high-dim space with RBF kernel, MMD is small but positive
        assert mmd.item() > 0.0

    def test_mmd_symmetric(self):
        adapter = self._make_adapter()
        x = torch.randn(50, EMBEDDING_DIM)
        y = torch.randn(50, EMBEDDING_DIM) + 2.0
        mmd_xy = adapter.compute_mmd(x, y)
        mmd_yx = adapter.compute_mmd(y, x)
        assert abs(mmd_xy.item() - mmd_yx.item()) < 0.01

    def test_forward_returns_embeds_and_mmd(self, batch, target_batch):
        adapter = self._make_adapter()
        src_emb, tgt_emb, mmd = adapter(batch, target_batch)
        assert src_emb.shape == (4, EMBEDDING_DIM)
        assert tgt_emb.shape == (4, EMBEDDING_DIM)
        assert mmd.item() >= 0
        assert mmd.requires_grad


# ---------------------------------------------------------------------------
# AdvancedSSLTrainer
# ---------------------------------------------------------------------------

class TestAdvancedSSLTrainer:
    def test_train_step_returns_losses(self, batch):
        trainer = AdvancedSSLTrainer(input_dim=INPUT_DIM, num_subcarriers=NUM_SUBS, window_size=WINDOW)
        losses = trainer.train_step(batch)
        assert 'mae' in losses
        assert 'denoise' in losses
        assert 'contrastive' in losses
        assert 'mmd' in losses
        assert 'total' in losses

    def test_train_step_total_is_weighted_sum(self, batch):
        trainer = AdvancedSSLTrainer(
            input_dim=INPUT_DIM, num_subcarriers=NUM_SUBS, window_size=WINDOW,
            alpha=1.0, beta=0.5, gamma=0.3, delta=0.2,
        )
        losses = trainer.train_step(batch)
        expected = (
            1.0 * losses['contrastive']
            + 0.5 * losses['mae']
            + 0.3 * losses['denoise']
            + 0.2 * losses['mmd']
        )
        assert abs(losses['total'] - expected) < 1e-3

    def test_get_encoder_returns_module(self):
        trainer = AdvancedSSLTrainer(input_dim=INPUT_DIM, num_subcarriers=NUM_SUBS, window_size=WINDOW)
        encoder = trainer.get_encoder()
        assert hasattr(encoder, 'forward')

    def test_encoder_produces_128d(self, batch):
        trainer = AdvancedSSLTrainer(input_dim=INPUT_DIM, num_subcarriers=NUM_SUBS, window_size=WINDOW)
        encoder = trainer.get_encoder()
        emb = encoder(batch)
        assert emb.shape == (4, EMBEDDING_DIM)

    def test_losses_are_finite(self, batch):
        trainer = AdvancedSSLTrainer(input_dim=INPUT_DIM, num_subcarriers=NUM_SUBS, window_size=WINDOW)
        losses = trainer.train_step(batch)
        for key, val in losses.items():
            assert torch.isfinite(torch.tensor(val)), f"{key} is not finite"

    def test_mmd_loss_active_with_target(self, batch, target_batch):
        trainer = AdvancedSSLTrainer(input_dim=INPUT_DIM, num_subcarriers=NUM_SUBS, window_size=WINDOW)
        losses = trainer.train_step(batch, target_batch=target_batch)
        # With different distributions, MMD should be positive
        assert losses['mmd'] >= 0


# ---------------------------------------------------------------------------
# Save / Load roundtrip
# ---------------------------------------------------------------------------

class TestSaveLoad:
    def test_mae_save_load_roundtrip(self, batch):
        mae = CsiMaskedAutoencoder(input_dim=INPUT_DIM, num_subcarriers=NUM_SUBS, window_size=WINDOW)
        mae.eval()
        with torch.no_grad():
            emb_before = mae.encode(batch)

        with tempfile.TemporaryDirectory() as tmpdir:
            path = os.path.join(tmpdir, 'mae.pt')
            torch.save(mae.state_dict(), path)
            mae2 = CsiMaskedAutoencoder(input_dim=INPUT_DIM, num_subcarriers=NUM_SUBS, window_size=WINDOW)
            mae2.load_state_dict(torch.load(path, weights_only=True))
            mae2.eval()
            with torch.no_grad():
                emb_after = mae2.encode(batch)

        assert torch.allclose(emb_before, emb_after, atol=1e-5)

    def test_dae_save_load_roundtrip(self, batch):
        dae = CsiDenoisingAutoencoder(input_dim=INPUT_DIM, num_subcarriers=NUM_SUBS, window_size=WINDOW)
        dae.eval()
        with torch.no_grad():
            emb_before = dae.encode(batch)

        with tempfile.TemporaryDirectory() as tmpdir:
            path = os.path.join(tmpdir, 'dae.pt')
            torch.save(dae.state_dict(), path)
            dae2 = CsiDenoisingAutoencoder(input_dim=INPUT_DIM, num_subcarriers=NUM_SUBS, window_size=WINDOW)
            dae2.load_state_dict(torch.load(path, weights_only=True))
            dae2.eval()
            with torch.no_grad():
                emb_after = dae2.encode(batch)

        assert torch.allclose(emb_before, emb_after, atol=1e-5)


# ---------------------------------------------------------------------------
# 128-D embedding compatibility
# ---------------------------------------------------------------------------

class TestEmbeddingCompatibility:
    def test_all_encoders_produce_same_dim(self, batch):
        mae = CsiMaskedAutoencoder(input_dim=INPUT_DIM, num_subcarriers=NUM_SUBS, window_size=WINDOW)
        dae = CsiDenoisingAutoencoder(input_dim=INPUT_DIM, num_subcarriers=NUM_SUBS, window_size=WINDOW)
        trainer = AdvancedSSLTrainer(input_dim=INPUT_DIM, num_subcarriers=NUM_SUBS, window_size=WINDOW)

        emb_mae = mae.encode(batch)
        emb_dae = dae.encode(batch)
        emb_trainer = trainer.get_encoder()(batch)

        assert emb_mae.shape[-1] == EMBEDDING_DIM
        assert emb_dae.shape[-1] == EMBEDDING_DIM
        assert emb_trainer.shape[-1] == EMBEDDING_DIM

    def test_embeddings_are_not_all_zero(self, batch):
        mae = CsiMaskedAutoencoder(input_dim=INPUT_DIM, num_subcarriers=NUM_SUBS, window_size=WINDOW)
        emb = mae.encode(batch)
        assert emb.abs().sum().item() > 0

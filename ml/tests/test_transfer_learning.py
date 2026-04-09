"""
Tests for transfer learning — contrastive pre-training and fine-tuning.
"""

import pytest
import torch
import numpy as np

from biomech_ml.transfer_learning import (
    CsiPretrainEncoder,
    PretrainConfig,
    PretrainMetadata,
    nt_xent_loss,
    pretrain_encoder,
    fine_tune_for_task,
    VALIDATION_STATES,
)


# ── Fixtures ────────────────────────────────────────────────────────── #


@pytest.fixture
def config():
    return PretrainConfig(
        embed_dim=32,
        projection_dim=16,
        num_subcarriers=16,
        conv_channels=[16, 32],
        conv_kernels=[3, 3],
        num_epochs=2,
        batch_size=8,
        lr=1e-3,
    )


@pytest.fixture
def encoder(config):
    return CsiPretrainEncoder(config)


@pytest.fixture
def sample_input():
    """(batch=4, channels=2, subcarriers=16)"""
    torch.manual_seed(42)
    return torch.randn(4, 2, 16)


@pytest.fixture
def unlabeled_dataset():
    """64 unlabeled CSI frames."""
    torch.manual_seed(42)
    return torch.randn(64, 2, 16)


@pytest.fixture
def labeled_dataset():
    """32 labeled CSI frames with 3 classes."""
    torch.manual_seed(42)
    features = torch.randn(32, 2, 16)
    labels = torch.randint(0, 3, (32,))
    return features, labels


# ── Encoder forward pass shapes ─────────────────────────────────────── #


class TestEncoderShapes:
    def test_encode_output_shape(self, encoder, sample_input):
        with torch.no_grad():
            emb = encoder.encode(sample_input)
        assert emb.shape == (4, 32)

    def test_forward_output_shape(self, encoder, sample_input):
        with torch.no_grad():
            proj = encoder(sample_input)
        assert proj.shape == (4, 16)

    def test_forward_is_normalized(self, encoder, sample_input):
        with torch.no_grad():
            proj = encoder(sample_input)
        norms = proj.norm(dim=-1)
        assert torch.allclose(norms, torch.ones_like(norms), atol=1e-5)

    def test_single_sample(self, encoder):
        x = torch.randn(1, 2, 16)
        with torch.no_grad():
            emb = encoder.encode(x)
        assert emb.shape == (1, 32)

    def test_default_config_embed_dim(self):
        enc = CsiPretrainEncoder()
        x = torch.randn(2, 2, 64)
        with torch.no_grad():
            emb = enc.encode(x)
        assert emb.shape == (2, 128)


# ── NT-Xent Loss ────────────────────────────────────────────────────── #


class TestNtXentLoss:
    def test_loss_is_scalar(self):
        z_i = torch.nn.functional.normalize(torch.randn(8, 16), dim=-1)
        z_j = torch.nn.functional.normalize(torch.randn(8, 16), dim=-1)
        loss = nt_xent_loss(z_i, z_j)
        assert loss.dim() == 0

    def test_loss_positive(self):
        z_i = torch.nn.functional.normalize(torch.randn(8, 16), dim=-1)
        z_j = torch.nn.functional.normalize(torch.randn(8, 16), dim=-1)
        loss = nt_xent_loss(z_i, z_j)
        assert loss.item() > 0

    def test_identical_pairs_lower_loss(self):
        z = torch.nn.functional.normalize(torch.randn(8, 16), dim=-1)
        loss_same = nt_xent_loss(z, z + torch.randn_like(z) * 0.01)
        loss_diff = nt_xent_loss(z, torch.nn.functional.normalize(torch.randn(8, 16), dim=-1))
        # Similar pairs should have lower loss than random
        assert loss_same.item() < loss_diff.item()

    def test_loss_gradients_flow(self):
        z_i = torch.randn(8, 16, requires_grad=True)
        z_j = torch.randn(8, 16, requires_grad=True)
        # Normalize but retain_grad on non-leaf results
        z_i_norm = torch.nn.functional.normalize(z_i, dim=-1)
        z_j_norm = torch.nn.functional.normalize(z_j, dim=-1)
        z_i_norm.retain_grad()
        z_j_norm.retain_grad()
        loss = nt_xent_loss(z_i_norm, z_j_norm)
        loss.backward()
        assert z_i.grad is not None
        assert z_j.grad is not None


# ── Pre-training ─────────────────────────────────────────────────────── #


class TestPretrain:
    def test_pretrain_runs_without_error(self, config, unlabeled_dataset):
        encoder = pretrain_encoder(unlabeled_dataset, config)
        assert isinstance(encoder, CsiPretrainEncoder)

    def test_pretrain_metadata_updated(self, config, unlabeled_dataset):
        encoder = pretrain_encoder(unlabeled_dataset, config)
        assert encoder.metadata.pretrain_epochs_completed == config.num_epochs
        assert encoder.metadata.final_loss < float("inf")
        assert encoder.metadata.validation_state == "experimental"

    def test_pretrain_encoder_produces_embeddings(self, config, unlabeled_dataset):
        encoder = pretrain_encoder(unlabeled_dataset, config)
        with torch.no_grad():
            emb = encoder.encode(unlabeled_dataset[:4])
        assert emb.shape == (4, config.embed_dim)


# ── Fine-tuning ──────────────────────────────────────────────────────── #


class TestFineTune:
    def test_fine_tune_produces_classifier(self, config, unlabeled_dataset, labeled_dataset):
        encoder = pretrain_encoder(unlabeled_dataset, config)
        model = fine_tune_for_task(encoder, labeled_dataset, num_classes=3, epochs=2)
        assert model is not None

    def test_fine_tune_output_shape(self, config, unlabeled_dataset, labeled_dataset):
        encoder = pretrain_encoder(unlabeled_dataset, config)
        model = fine_tune_for_task(encoder, labeled_dataset, num_classes=3, epochs=2)
        model.eval()
        with torch.no_grad():
            out = model(labeled_dataset[0][:4])
        assert out.shape == (4, 3)


# ── Save / Load roundtrip ───────────────────────────────────────────── #


class TestSaveLoad:
    def test_save_and_load_roundtrip(self, encoder, sample_input, tmp_path):
        path = tmp_path / "encoder.pt"
        encoder.eval()
        with torch.no_grad():
            emb_before = encoder.encode(sample_input)

        encoder.save_pretrained(path)
        loaded = CsiPretrainEncoder.load_pretrained(path)
        loaded.eval()
        with torch.no_grad():
            emb_after = loaded.encode(sample_input)

        assert torch.allclose(emb_before, emb_after, atol=1e-6)

    def test_save_creates_file(self, encoder, tmp_path):
        path = tmp_path / "subdir" / "encoder.pt"
        encoder.save_pretrained(path)
        assert path.exists()

    def test_load_preserves_config(self, encoder, tmp_path):
        path = tmp_path / "encoder.pt"
        encoder.save_pretrained(path)
        loaded = CsiPretrainEncoder.load_pretrained(path)
        assert loaded.config.embed_dim == encoder.config.embed_dim
        assert loaded.config.num_subcarriers == encoder.config.num_subcarriers


# ── Metadata validation ──────────────────────────────────────────────── #


class TestMetadata:
    def test_valid_states(self):
        for state in VALIDATION_STATES:
            m = PretrainMetadata(validation_state=state)
            assert m.validation_state == state

    def test_invalid_state_raises(self):
        with pytest.raises(ValueError, match="Invalid validation_state"):
            PretrainMetadata(validation_state="invalid")

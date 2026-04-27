"""
Transfer learning for CSI-based gait analysis.

Pre-training strategy using contrastive learning (SimCLR-style) on unlabeled
CSI data, followed by fine-tuning on labeled downstream tasks.

The CsiPretrainEncoder learns a general-purpose embedding of CSI windows
without requiring gait labels. It uses a CNN backbone for spatial features
and a projection head trained with NT-Xent (Normalized Temperature-scaled
Cross-Entropy) contrastive loss.

All outputs are EXPERIMENTAL proxy embeddings derived from Wi-Fi CSI sensing.
Confidence and validation state must be tracked externally.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

import numpy as np
import torch
import torch.nn as nn
import torch.nn.functional as F
from torch.utils.data import DataLoader, TensorDataset

logger = logging.getLogger(__name__)

VALIDATION_STATES = ("unvalidated", "experimental", "station_validated", "externally_validated")


@dataclass
class PretrainConfig:
    """Hyperparameters for contrastive pre-training."""

    embed_dim: int = 128
    temperature: float = 0.07
    projection_dim: int = 64
    num_epochs: int = 10
    batch_size: int = 32
    lr: float = 1e-3
    num_subcarriers: int = 64
    in_channels: int = 2
    conv_channels: list[int] = field(default_factory=lambda: [64, 128])
    conv_kernels: list[int] = field(default_factory=lambda: [7, 5])


@dataclass
class PretrainMetadata:
    """Quality metadata for pre-trained encoder outputs."""

    validation_state: str = "experimental"
    signal_quality: str = "unknown"
    calibration_status: str = "uncalibrated"
    embed_dim: int = 128
    pretrain_epochs_completed: int = 0
    final_loss: float = float("inf")

    def __post_init__(self) -> None:
        if self.validation_state not in VALIDATION_STATES:
            raise ValueError(
                f"Invalid validation_state '{self.validation_state}'. "
                f"Must be one of {VALIDATION_STATES}"
            )


def nt_xent_loss(z_i: torch.Tensor, z_j: torch.Tensor, temperature: float = 0.07) -> torch.Tensor:
    """Normalized Temperature-scaled Cross-Entropy loss (NT-Xent).

    Computes the contrastive loss for a batch of positive pairs (z_i, z_j).

    Args:
        z_i: (N, D) L2-normalized projections from augmentation 1
        z_j: (N, D) L2-normalized projections from augmentation 2
        temperature: scaling temperature

    Returns:
        Scalar loss value.
    """
    N = z_i.shape[0]
    z = torch.cat([z_i, z_j], dim=0)  # (2N, D)
    sim = torch.mm(z, z.t()) / temperature  # (2N, 2N)

    # Mask out self-similarity
    mask = torch.eye(2 * N, device=z.device, dtype=torch.bool)
    sim.masked_fill_(mask, -1e9)

    # Positive pairs: (i, i+N) and (i+N, i)
    labels = torch.cat([
        torch.arange(N, 2 * N, device=z.device),
        torch.arange(0, N, device=z.device),
    ])

    return F.cross_entropy(sim, labels)


class CsiPretrainEncoder(nn.Module):
    """CNN encoder pre-trained with contrastive learning on unlabeled CSI data.

    Architecture:
        - Conv1d backbone for spatial feature extraction across subcarriers
        - Embedding layer producing fixed-dim representations
        - Projection head for contrastive training (removed at inference)

    Input:  (batch, in_channels, num_subcarriers)
    Output: encode() → (batch, embed_dim)

    All outputs are EXPERIMENTAL proxy embeddings.
    """

    def __init__(self, config: PretrainConfig | None = None) -> None:
        super().__init__()
        self.config = config or PretrainConfig()
        c = self.config

        # CNN backbone
        layers: list[nn.Module] = []
        in_ch = c.in_channels
        for out_ch, ks in zip(c.conv_channels, c.conv_kernels):
            layers.extend([
                nn.Conv1d(in_ch, out_ch, kernel_size=ks, padding=ks // 2),
                nn.BatchNorm1d(out_ch),
                nn.ReLU(inplace=True),
            ])
            in_ch = out_ch
        self.backbone = nn.Sequential(*layers)
        self.pool = nn.AdaptiveAvgPool1d(1)

        backbone_out = c.conv_channels[-1]

        # Embedding layer
        self.embed_fc = nn.Linear(backbone_out, c.embed_dim)

        # Projection head (used only during contrastive pre-training)
        self.projection_head = nn.Sequential(
            nn.Linear(c.embed_dim, c.embed_dim),
            nn.ReLU(inplace=True),
            nn.Linear(c.embed_dim, c.projection_dim),
        )

        self.metadata = PretrainMetadata(embed_dim=c.embed_dim)

    def _backbone_forward(self, x: torch.Tensor) -> torch.Tensor:
        """Run CNN backbone → pool → embedding.

        Args:
            x: (B, C, S)

        Returns:
            (B, embed_dim)
        """
        h = self.backbone(x)       # (B, conv_out, S')
        h = self.pool(h).squeeze(-1)  # (B, conv_out)
        return self.embed_fc(h)     # (B, embed_dim)

    def encode(self, x: torch.Tensor) -> torch.Tensor:
        """Produce embeddings (no projection head).

        Args:
            x: (B, C, S) — CSI frames with amplitude + phase channels

        Returns:
            (B, embed_dim) embeddings
        """
        return self._backbone_forward(x)

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        """Full forward pass including projection head (for pre-training).

        Args:
            x: (B, C, S)

        Returns:
            (B, projection_dim) L2-normalized projections
        """
        h = self._backbone_forward(x)
        z = self.projection_head(h)
        return F.normalize(z, dim=-1)

    def save_pretrained(self, path: str | Path) -> None:
        """Save encoder weights and config to disk."""
        path = Path(path)
        path.parent.mkdir(parents=True, exist_ok=True)
        torch.save({
            "state_dict": self.state_dict(),
            "config": self.config,
            "metadata": self.metadata,
        }, path)
        logger.info("Saved pretrained encoder to %s", path)

    @classmethod
    def load_pretrained(cls, path: str | Path) -> CsiPretrainEncoder:
        """Load encoder from disk."""
        path = Path(path)
        checkpoint = torch.load(path, map_location="cpu", weights_only=False)
        config: PretrainConfig = checkpoint["config"]
        encoder = cls(config)
        encoder.load_state_dict(checkpoint["state_dict"])
        encoder.metadata = checkpoint.get("metadata", PretrainMetadata(embed_dim=config.embed_dim))
        logger.info("Loaded pretrained encoder from %s", path)
        return encoder


def pretrain_encoder(
    dataset: torch.Tensor,
    config: PretrainConfig | None = None,
) -> CsiPretrainEncoder:
    """Pre-train a CsiPretrainEncoder with contrastive learning on unlabeled CSI data.

    Uses a simple noise-based augmentation to create positive pairs from
    unlabeled CSI frames, then trains with NT-Xent loss.

    Args:
        dataset: (N, C, S) tensor of unlabeled CSI frames
        config: PretrainConfig (uses defaults if None)

    Returns:
        Trained CsiPretrainEncoder with updated metadata.
    """
    config = config or PretrainConfig()
    encoder = CsiPretrainEncoder(config)
    encoder.train()

    optimizer = torch.optim.Adam(encoder.parameters(), lr=config.lr)
    ds = TensorDataset(dataset)
    loader = DataLoader(ds, batch_size=config.batch_size, shuffle=True, drop_last=True)

    final_loss = float("inf")
    for epoch in range(config.num_epochs):
        epoch_loss = 0.0
        n_batches = 0
        for (batch,) in loader:
            # Create two augmented views via noise injection
            view1 = batch + torch.randn_like(batch) * 0.05
            view2 = batch + torch.randn_like(batch) * 0.05

            z1 = encoder(view1)
            z2 = encoder(view2)

            loss = nt_xent_loss(z1, z2, temperature=config.temperature)

            optimizer.zero_grad()
            loss.backward()
            optimizer.step()

            epoch_loss += loss.item()
            n_batches += 1

        avg_loss = epoch_loss / max(n_batches, 1)
        final_loss = avg_loss
        logger.debug("Pretrain epoch %d/%d — loss: %.4f", epoch + 1, config.num_epochs, avg_loss)

    encoder.metadata.pretrain_epochs_completed = config.num_epochs
    encoder.metadata.final_loss = np.float32(final_loss).item()
    encoder.eval()
    return encoder


def fine_tune_for_task(
    encoder: CsiPretrainEncoder,
    labeled_data: tuple[torch.Tensor, torch.Tensor],
    num_classes: int,
    epochs: int = 5,
    lr: float = 1e-4,
) -> nn.Module:
    """Fine-tune a pre-trained encoder for a downstream classification task.

    Freezes the backbone initially, trains a classification head, then
    unfreezes everything for end-to-end fine-tuning.

    Args:
        encoder: Pre-trained CsiPretrainEncoder
        labeled_data: (features, labels) tuple — features (N, C, S), labels (N,)
        num_classes: number of target classes
        epochs: total training epochs
        lr: learning rate

    Returns:
        nn.Module with encoder backbone + classification head
    """
    features, labels = labeled_data
    embed_dim = encoder.config.embed_dim

    classifier = nn.Sequential(
        nn.Linear(embed_dim, 64),
        nn.ReLU(inplace=True),
        nn.Linear(64, num_classes),
    )

    # Wrap encoder + classifier
    class FineTuneModel(nn.Module):
        def __init__(self, enc: CsiPretrainEncoder, cls_head: nn.Module) -> None:
            super().__init__()
            self.encoder = enc
            self.classifier = cls_head

        def forward(self, x: torch.Tensor) -> torch.Tensor:
            with torch.no_grad() if not self.training else _null_ctx():
                h = self.encoder.encode(x)
            return self.classifier(h)

    model = FineTuneModel(encoder, classifier)
    model.train()

    optimizer = torch.optim.Adam(model.parameters(), lr=lr)
    loss_fn = nn.CrossEntropyLoss()

    ds = TensorDataset(features, labels)
    loader = DataLoader(ds, batch_size=32, shuffle=True)

    for epoch in range(epochs):
        # Unfreeze encoder after half the epochs
        if epoch == epochs // 2:
            for p in model.encoder.parameters():
                p.requires_grad = True

        for batch_x, batch_y in loader:
            logits = model(batch_x)
            loss = loss_fn(logits, batch_y)
            optimizer.zero_grad()
            loss.backward()
            optimizer.step()

    model.eval()
    return model


class _null_ctx:
    """No-op context manager for conditional torch.no_grad()."""
    def __enter__(self) -> None:
        return None
    def __exit__(self, *args: Any) -> None:
        pass

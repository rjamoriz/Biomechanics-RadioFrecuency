"""
Contrastive learning encoder for CSI gait biomechanics.

Produces 128-dim L2-normalized embeddings from CSI amplitude+phase windows using
NT-Xent (normalized temperature-scaled cross-entropy) self-supervised training.

Architecture:
    Input:  (batch, 2, window_size, num_subcarriers) — amplitude + phase
    Backbone: temporal CNN with residual blocks (reuses ResidualConv1dBlock from model.py)
    Projection head: Linear(d_model → 256) → ReLU → Linear(256 → 128)
    Output: (batch, 128) — L2-normalized embedding

Total params: ~100-200K — small enough for edge deployment and quantization.

All outputs are EXPERIMENTAL. This is a self-supervised representation learner;
task-specific heads (see heads.py) provide the final proxy metric estimates.
"""

from __future__ import annotations

import logging
import math
from typing import Optional

import torch
import torch.nn as nn
import torch.nn.functional as F

from biomech_ml.model import ResidualConv1dBlock

logger = logging.getLogger(__name__)

EMBEDDING_DIM = 128
PROJECTION_HIDDEN = 256


class CsiContrastiveEncoder(nn.Module):
    """Contrastive encoder — produces 128-dim embeddings from CSI windows.

    Trained with NT-Xent loss. The encoder learns general CSI temporal/spectral
    patterns; task-specific heads (cadence, symmetry, contact time, etc.) are
    trained separately on frozen embeddings.

    Args:
        num_subcarriers: number of CSI subcarriers (default 64)
        window_size: number of time frames per window (default 64)
        in_channels: 2 (amplitude + phase)
        d_model: hidden dimension in temporal CNN backbone
        embedding_dim: final embedding dimensionality (default 128)
    """

    def __init__(
        self,
        num_subcarriers: int = 64,
        window_size: int = 64,
        in_channels: int = 2,
        d_model: int = 64,
        embedding_dim: int = EMBEDDING_DIM,
    ) -> None:
        super().__init__()
        self.num_subcarriers = num_subcarriers
        self.window_size = window_size
        self.embedding_dim = embedding_dim

        # ── Temporal CNN backbone ──
        # Input: (B, C_in * S, W) → temporal convolutions
        conv_in = in_channels * num_subcarriers
        self.backbone = nn.Sequential(
            ResidualConv1dBlock(conv_in, 128, kernel_size=7),
            nn.Dropout(0.1),
            ResidualConv1dBlock(128, d_model, kernel_size=5),
            nn.Dropout(0.1),
            ResidualConv1dBlock(d_model, d_model, kernel_size=3),
        )
        self.pool = nn.AdaptiveAvgPool1d(1)

        # ── Projection head (used during contrastive training, can be discarded) ──
        self.projection = nn.Sequential(
            nn.Linear(d_model, PROJECTION_HIDDEN),
            nn.ReLU(inplace=True),
            nn.Linear(PROJECTION_HIDDEN, embedding_dim),
        )

    def forward_backbone(self, x: torch.Tensor) -> torch.Tensor:
        """Extract backbone features before projection.

        Args:
            x: (B, C=2, W, S)
        Returns:
            (B, d_model) — pre-projection representation
        """
        B, C, W, S = x.shape
        t = x.permute(0, 1, 3, 2).reshape(B, C * S, W)
        t = self.backbone(t)
        return self.pool(t).squeeze(-1)

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        """Full forward: backbone → projection → L2 normalize.

        Args:
            x: (B, C=2, W, S)
        Returns:
            (B, embedding_dim) — L2-normalized embedding
        """
        h = self.forward_backbone(x)
        z = self.projection(h)
        return F.normalize(z, p=2, dim=1)

    def encode(self, x: torch.Tensor) -> torch.Tensor:
        """Inference-time encoding (same as forward but name is clearer for downstream use)."""
        return self.forward(x)


def count_encoder_parameters(model: CsiContrastiveEncoder) -> int:
    """Total trainable parameter count."""
    return sum(p.numel() for p in model.parameters() if p.requires_grad)


# ── NT-Xent Loss ────────────────────────────────────────────────────── #

class NTXentLoss(nn.Module):
    """Normalized Temperature-scaled Cross-Entropy loss for contrastive learning.

    Given a batch of 2N embeddings (N positive pairs from augmentation),
    computes the contrastive loss encouraging positive pairs to be similar
    and all other pairs to be dissimilar.

    Args:
        temperature: scaling temperature τ (default 0.07)
    """

    def __init__(self, temperature: float = 0.07) -> None:
        super().__init__()
        self.temperature = temperature

    def forward(self, z_i: torch.Tensor, z_j: torch.Tensor) -> torch.Tensor:
        """
        Args:
            z_i: (N, D) — embeddings from augmentation view 1
            z_j: (N, D) — embeddings from augmentation view 2

        Returns:
            Scalar loss.
        """
        N = z_i.shape[0]
        z = torch.cat([z_i, z_j], dim=0)  # (2N, D)

        # Cosine similarity matrix
        sim = torch.mm(z, z.t()) / self.temperature  # (2N, 2N)

        # Mask out self-similarity on diagonal
        mask = torch.eye(2 * N, dtype=torch.bool, device=z.device)
        sim.masked_fill_(mask, -1e9)

        # Positive pairs: (i, i+N) and (i+N, i)
        pos_i = torch.arange(N, device=z.device)
        pos_j = pos_i + N

        # For first N samples, positive is at index i+N
        # For last N samples, positive is at index i-N
        labels = torch.cat([pos_j, pos_i], dim=0)  # (2N,)

        return F.cross_entropy(sim, labels)


# ── Data Augmentation ───────────────────────────────────────────────── #

class CsiAugmentation:
    """Augmentation pipeline for contrastive CSI learning.

    Produces two different views of the same CSI window for positive pair generation.
    All augmentations are designed to preserve the underlying gait information
    while varying the signal characteristics.

    Args:
        time_shift_max: max frames to shift (default 4)
        subcarrier_drop_prob: probability of dropping each subcarrier (default 0.1)
        noise_std: Gaussian noise standard deviation (default 0.05)
        amp_scale_range: amplitude scaling range (default (0.8, 1.2))
    """

    def __init__(
        self,
        time_shift_max: int = 4,
        subcarrier_drop_prob: float = 0.1,
        noise_std: float = 0.05,
        amp_scale_range: tuple[float, float] = (0.8, 1.2),
    ) -> None:
        self.time_shift_max = time_shift_max
        self.subcarrier_drop_prob = subcarrier_drop_prob
        self.noise_std = noise_std
        self.amp_scale_range = amp_scale_range

    def __call__(self, x: torch.Tensor) -> tuple[torch.Tensor, torch.Tensor]:
        """Generate two augmented views of the input.

        Args:
            x: (C, W, S) — single sample (channels, window, subcarriers)
        Returns:
            (view_1, view_2) — both (C, W, S)
        """
        return self._augment(x.clone()), self._augment(x.clone())

    def _augment(self, x: torch.Tensor) -> torch.Tensor:
        """Apply random augmentations to a single view."""
        x = self._time_shift(x)
        x = self._subcarrier_dropout(x)
        x = self._gaussian_noise(x)
        x = self._amplitude_scaling(x)
        return x

    def _time_shift(self, x: torch.Tensor) -> torch.Tensor:
        """Circular shift along the time axis."""
        if self.time_shift_max <= 0:
            return x
        shift = torch.randint(-self.time_shift_max, self.time_shift_max + 1, (1,)).item()
        return torch.roll(x, shifts=int(shift), dims=1)

    def _subcarrier_dropout(self, x: torch.Tensor) -> torch.Tensor:
        """Zero out random subcarriers."""
        if self.subcarrier_drop_prob <= 0:
            return x
        mask = torch.rand(x.shape[2]) > self.subcarrier_drop_prob
        x = x * mask.unsqueeze(0).unsqueeze(0)
        return x

    def _gaussian_noise(self, x: torch.Tensor) -> torch.Tensor:
        """Add Gaussian noise."""
        if self.noise_std <= 0:
            return x
        return x + torch.randn_like(x) * self.noise_std

    def _amplitude_scaling(self, x: torch.Tensor) -> torch.Tensor:
        """Scale amplitude channel randomly."""
        lo, hi = self.amp_scale_range
        scale = torch.empty(1).uniform_(lo, hi).item()
        x[0] = x[0] * scale  # only scale amplitude channel
        return x


# ── Export helpers ──────────────────────────────────────────────────── #

def export_encoder_onnx(
    encoder: CsiContrastiveEncoder,
    path: str,
    num_subcarriers: int = 64,
    window_size: int = 64,
) -> None:
    """Export contrastive encoder to ONNX format.

    Args:
        encoder: trained encoder in eval mode
        path: destination .onnx file
        num_subcarriers: subcarrier count for dummy input
        window_size: window size for dummy input
    """
    from pathlib import Path as P

    P(path).parent.mkdir(parents=True, exist_ok=True)

    encoder.eval()
    dummy = torch.randn(1, 2, window_size, num_subcarriers)

    torch.onnx.export(
        encoder,
        dummy,
        path,
        input_names=["csi_input"],
        output_names=["embedding"],
        dynamic_axes={
            "csi_input": {0: "batch"},
            "embedding": {0: "batch"},
        },
        opset_version=17,
    )
    size_kb = P(path).stat().st_size / 1024
    logger.info("Contrastive encoder exported to %s (%.1f KB)", path, size_kb)


def save_encoder_safetensors(encoder: CsiContrastiveEncoder, path: str) -> None:
    """Save encoder weights in safetensors format (safer than pickle).

    Args:
        encoder: the encoder to save
        path: destination .safetensors file
    """
    from pathlib import Path as P
    from safetensors.torch import save_file

    P(path).parent.mkdir(parents=True, exist_ok=True)

    state_dict = {k: v for k, v in encoder.state_dict().items()}
    save_file(state_dict, path)

    size_kb = P(path).stat().st_size / 1024
    logger.info("Encoder safetensors saved to %s (%.1f KB)", path, size_kb)


def load_encoder_safetensors(
    path: str,
    num_subcarriers: int = 64,
    window_size: int = 64,
    d_model: int = 64,
) -> CsiContrastiveEncoder:
    """Load encoder from safetensors file.

    Args:
        path: source .safetensors file
        num_subcarriers, window_size, d_model: architecture hyperparams

    Returns:
        Loaded encoder in eval mode.
    """
    from safetensors.torch import load_file

    encoder = CsiContrastiveEncoder(
        num_subcarriers=num_subcarriers,
        window_size=window_size,
        d_model=d_model,
    )
    state_dict = load_file(path)
    encoder.load_state_dict(state_dict)
    encoder.eval()

    logger.info("Encoder loaded from %s", path)
    return encoder

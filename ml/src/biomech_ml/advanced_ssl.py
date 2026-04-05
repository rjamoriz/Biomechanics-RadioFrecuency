"""
Advanced Self-Supervised Learning for CSI Gait Biomechanics.

Extends the contrastive learning approach with:
    A. Masked CSI Autoencoder (MAE) — reconstruct masked subcarriers
    B. Denoising Autoencoder (DAE) — remove calibrated noise
    C. Station Domain Adapter — align distributions across stations via MMD
    D. Combined SSL Trainer — weighted multi-objective training

All models produce 128-dim embeddings compatible with existing task heads.
All outputs are EXPERIMENTAL — these are self-supervised representations.
"""

from __future__ import annotations

import logging
from pathlib import Path
from typing import Optional

import torch
import torch.nn as nn
import torch.nn.functional as F

from biomech_ml.contrastive import CsiContrastiveEncoder, NTXentLoss, EMBEDDING_DIM

logger = logging.getLogger(__name__)

# ── Constants ────────────────────────────────────────────────────────

DEFAULT_MASK_RATIO = 0.4
DEFAULT_GAUSSIAN_STD = 0.1
DEFAULT_IMPULSE_PROB = 0.05
MMD_BANDWIDTH = 1.0
DEFAULT_LR = 1e-4


# ── A. Masked CSI Autoencoder ────────────────────────────────────────

class CsiMaskedAutoencoder(nn.Module):
    """Mask random subcarrier positions, encode visible ones, reconstruct all.

    Architecture:
        Encoder: CsiContrastiveEncoder backbone (128D)
        Decoder: 2-layer MLP projecting back to input dimension
        Mask ratio: 0.4 (40% of subcarriers masked per frame)

    Loss: MSE on masked positions only (forces learning structure).

    Args:
        input_dim: number of input features (num_subcarriers * in_channels * window)
        embed_dim: embedding dimensionality (default 128)
        mask_ratio: fraction of subcarriers to mask (default 0.4)
        num_subcarriers: CSI subcarrier count (default 64)
        window_size: time frames per window (default 64)
    """

    def __init__(
        self,
        input_dim: int,
        embed_dim: int = EMBEDDING_DIM,
        mask_ratio: float = DEFAULT_MASK_RATIO,
        num_subcarriers: int = 64,
        window_size: int = 64,
    ) -> None:
        super().__init__()
        self.embed_dim = embed_dim
        self.mask_ratio = mask_ratio
        self.num_subcarriers = num_subcarriers
        self.window_size = window_size

        # Encoder: reuse contrastive encoder architecture
        self.encoder = CsiContrastiveEncoder(
            num_subcarriers=num_subcarriers,
            window_size=window_size,
            embedding_dim=embed_dim,
        )

        # Decoder: MLP back to input space
        # Input shape is (B, 2, W, S) → flatten = 2 * W * S
        self.flat_dim = 2 * window_size * num_subcarriers
        self.decoder = nn.Sequential(
            nn.Linear(embed_dim, embed_dim * 2),
            nn.ReLU(inplace=True),
            nn.Linear(embed_dim * 2, self.flat_dim),
        )

    def _generate_mask(self, batch_size: int, device: torch.device) -> torch.Tensor:
        """Generate random subcarrier mask: (B, S) boolean, True = masked."""
        num_mask = int(self.num_subcarriers * self.mask_ratio)
        mask = torch.zeros(batch_size, self.num_subcarriers, device=device, dtype=torch.bool)
        for i in range(batch_size):
            indices = torch.randperm(self.num_subcarriers, device=device)[:num_mask]
            mask[i, indices] = True
        return mask

    def forward(
        self,
        x: torch.Tensor,
        mask: Optional[torch.Tensor] = None,
    ) -> tuple[torch.Tensor, torch.Tensor, torch.Tensor]:
        """Forward pass with masking.

        Args:
            x: (B, 2, W, S) — CSI input
            mask: optional (B, S) boolean mask. If None, generates random mask.

        Returns:
            (reconstruction, masked_input, mask)
            reconstruction: (B, 2, W, S)
            masked_input: (B, 2, W, S) with masked subcarriers zeroed
            mask: (B, S) boolean
        """
        B, C, W, S = x.shape

        if mask is None:
            mask = self._generate_mask(B, x.device)

        # Apply mask: zero out masked subcarriers across all channels and time
        mask_expanded = mask.unsqueeze(1).unsqueeze(2)  # (B, 1, 1, S)
        masked_input = x * (~mask_expanded).float()

        # Encode masked input
        z = self.encoder(masked_input)  # (B, embed_dim)

        # Decode to reconstruction
        recon_flat = self.decoder(z)  # (B, flat_dim)
        reconstruction = recon_flat.view(B, C, W, S)

        return reconstruction, masked_input, mask

    def encode(self, x: torch.Tensor) -> torch.Tensor:
        """Get embedding without masking (for downstream tasks)."""
        return self.encoder(x)

    def compute_loss(self, x: torch.Tensor) -> torch.Tensor:
        """Compute MAE loss (MSE on masked positions only).

        Args:
            x: (B, 2, W, S)
        Returns:
            scalar loss
        """
        reconstruction, _, mask = self.forward(x)

        # Expand mask to match full input shape: (B, 2, W, S)
        mask_expanded = mask.unsqueeze(1).unsqueeze(2).expand_as(x)

        # MSE only on masked positions
        diff = (reconstruction - x) ** 2
        masked_diff = diff[mask_expanded]

        if masked_diff.numel() == 0:
            return torch.tensor(0.0, device=x.device, requires_grad=True)

        return masked_diff.mean()


# ── B. Denoising Autoencoder ─────────────────────────────────────────

class CsiDenoisingAutoencoder(nn.Module):
    """Add calibrated noise to CSI, learn to remove it.

    Noise model: Gaussian + impulse (mimics real WiFi interference).

    Architecture:
        Encoder: Conv1D stack → bottleneck (128D)
        Decoder: Transposed Conv1D stack → reconstruction

    Args:
        input_dim: number of input features
        embed_dim: embedding dimensionality (default 128)
        gaussian_std: standard deviation of Gaussian noise (default 0.1)
        impulse_prob: probability of impulse noise per element (default 0.05)
        num_subcarriers: CSI subcarrier count (default 64)
        window_size: time frames per window (default 64)
    """

    def __init__(
        self,
        input_dim: int,
        embed_dim: int = EMBEDDING_DIM,
        gaussian_std: float = DEFAULT_GAUSSIAN_STD,
        impulse_prob: float = DEFAULT_IMPULSE_PROB,
        num_subcarriers: int = 64,
        window_size: int = 64,
    ) -> None:
        super().__init__()
        self.embed_dim = embed_dim
        self.gaussian_std = gaussian_std
        self.impulse_prob = impulse_prob
        self.num_subcarriers = num_subcarriers
        self.window_size = window_size

        # Encoder: Conv1D stack
        conv_in = 2 * num_subcarriers  # amplitude + phase channels flattened
        self.enc_conv = nn.Sequential(
            nn.Conv1d(conv_in, 128, kernel_size=7, padding=3),
            nn.BatchNorm1d(128),
            nn.ReLU(inplace=True),
            nn.Conv1d(128, 64, kernel_size=5, padding=2),
            nn.BatchNorm1d(64),
            nn.ReLU(inplace=True),
        )
        self.enc_pool = nn.AdaptiveAvgPool1d(1)
        self.enc_proj = nn.Linear(64, embed_dim)

        # Decoder: project back and use transposed convolutions
        self.dec_proj = nn.Linear(embed_dim, 64 * window_size)
        self.dec_conv = nn.Sequential(
            nn.Conv1d(64, 128, kernel_size=5, padding=2),
            nn.BatchNorm1d(128),
            nn.ReLU(inplace=True),
            nn.Conv1d(128, conv_in, kernel_size=7, padding=3),
        )

    def _add_noise(self, x: torch.Tensor) -> torch.Tensor:
        """Add Gaussian + impulse noise to simulate real WiFi interference."""
        noisy = x.clone()

        # Gaussian noise
        if self.gaussian_std > 0:
            noisy = noisy + torch.randn_like(x) * self.gaussian_std

        # Impulse noise: random large spikes
        if self.impulse_prob > 0:
            impulse_mask = torch.rand_like(x) < self.impulse_prob
            impulse_values = torch.randn_like(x) * 3.0  # large amplitude
            noisy = torch.where(impulse_mask, impulse_values, noisy)

        return noisy

    def _encode_internal(self, x: torch.Tensor) -> torch.Tensor:
        """Encode to bottleneck. x: (B, 2, W, S)."""
        B, C, W, S = x.shape
        # Reshape: (B, C*S, W) — temporal convolution over time
        t = x.permute(0, 1, 3, 2).reshape(B, C * S, W)
        t = self.enc_conv(t)
        t = self.enc_pool(t).squeeze(-1)  # (B, 64)
        return self.enc_proj(t)  # (B, embed_dim)

    def _decode_internal(self, z: torch.Tensor, target_shape: tuple) -> torch.Tensor:
        """Decode from bottleneck. Returns (B, 2, W, S)."""
        B, C, W, S = target_shape
        t = self.dec_proj(z)  # (B, 64*W)
        t = t.view(B, 64, W)
        t = self.dec_conv(t)  # (B, C*S, W)
        return t.view(B, C, S, W).permute(0, 1, 3, 2)  # (B, C, W, S)

    def forward(self, x: torch.Tensor) -> tuple[torch.Tensor, torch.Tensor]:
        """Forward: add noise, encode, decode.

        Args:
            x: (B, 2, W, S)
        Returns:
            (clean_reconstruction, noisy_input)
        """
        noisy = self._add_noise(x)
        z = self._encode_internal(noisy)
        recon = self._decode_internal(z, x.shape)
        return recon, noisy

    def encode(self, x: torch.Tensor) -> torch.Tensor:
        """Get clean embedding (no noise added)."""
        z = self._encode_internal(x)
        return F.normalize(z, p=2, dim=1)

    def compute_loss(self, x: torch.Tensor) -> torch.Tensor:
        """MSE between reconstruction and clean input."""
        recon, _ = self.forward(x)
        return F.mse_loss(recon, x)


# ── C. Station Domain Adapter ────────────────────────────────────────

class StationDomainAdapter(nn.Module):
    """Align feature distributions across stations using MMD loss.

    When training: source and target station share encoder weights.
    MMD loss penalizes distribution distance in embedding space.
    Enables a model trained on Station A to work on Station B.

    Args:
        encoder: shared encoder module (e.g. CsiContrastiveEncoder)
        embed_dim: embedding dimensionality (default 128)
        bandwidth: RBF kernel bandwidth for MMD (default 1.0)
    """

    def __init__(
        self,
        encoder: nn.Module,
        embed_dim: int = EMBEDDING_DIM,
        bandwidth: float = MMD_BANDWIDTH,
    ) -> None:
        super().__init__()
        self.encoder = encoder
        self.embed_dim = embed_dim
        self.bandwidth = bandwidth

    def compute_mmd(
        self,
        source_features: torch.Tensor,
        target_features: torch.Tensor,
    ) -> torch.Tensor:
        """Maximum Mean Discrepancy with Gaussian RBF kernel.

        MMD² = E[k(xs, xs')] + E[k(xt, xt')] - 2E[k(xs, xt)]

        Args:
            source_features: (Ns, D)
            target_features: (Nt, D)
        Returns:
            scalar MMD² value
        """
        k_ss = self._rbf_kernel(source_features, source_features)
        k_tt = self._rbf_kernel(target_features, target_features)
        k_st = self._rbf_kernel(source_features, target_features)

        mmd = k_ss.mean() + k_tt.mean() - 2 * k_st.mean()
        return mmd

    def forward(
        self,
        source: torch.Tensor,
        target: torch.Tensor,
    ) -> tuple[torch.Tensor, torch.Tensor, torch.Tensor]:
        """Encode both domains and compute MMD loss.

        Args:
            source: (Bs, 2, W, S) — source station CSI
            target: (Bt, 2, W, S) — target station CSI
        Returns:
            (source_embed, target_embed, mmd_loss)
        """
        source_embed = self.encoder(source)  # (Bs, D)
        target_embed = self.encoder(target)  # (Bt, D)
        mmd_loss = self.compute_mmd(source_embed, target_embed)
        return source_embed, target_embed, mmd_loss

    def _rbf_kernel(self, x: torch.Tensor, y: torch.Tensor) -> torch.Tensor:
        """Gaussian RBF kernel: k(x,y) = exp(-||x-y||² / (2σ²))."""
        xx = (x * x).sum(dim=1, keepdim=True)  # (N, 1)
        yy = (y * y).sum(dim=1, keepdim=True)  # (M, 1)
        dist = xx + yy.t() - 2 * x @ y.t()     # (N, M)
        return torch.exp(-dist / (2 * self.bandwidth ** 2))


# ── D. Combined SSL Trainer ──────────────────────────────────────────

class AdvancedSSLTrainer:
    """Train all SSL objectives on unlabeled CSI data.

    Combined loss:
        L = α·L_contrastive + β·L_mae + γ·L_denoise + δ·L_mmd

    Default weights: α=1.0, β=0.5, γ=0.3, δ=0.2

    Args:
        input_dim: input feature dimension
        embed_dim: embedding dimensionality (default 128)
        device: compute device (default 'cpu')
        lr: learning rate (default 1e-4)
        alpha, beta, gamma, delta: loss weights
        num_subcarriers: CSI subcarrier count (default 64)
        window_size: time frames per window (default 64)
    """

    def __init__(
        self,
        input_dim: int,
        embed_dim: int = EMBEDDING_DIM,
        device: str = 'cpu',
        lr: float = DEFAULT_LR,
        alpha: float = 1.0,
        beta: float = 0.5,
        gamma: float = 0.3,
        delta: float = 0.2,
        num_subcarriers: int = 64,
        window_size: int = 64,
    ) -> None:
        self.device = torch.device(device)
        self.alpha = alpha
        self.beta = beta
        self.gamma = gamma
        self.delta = delta

        # Shared encoder (contrastive)
        self.contrastive_encoder = CsiContrastiveEncoder(
            num_subcarriers=num_subcarriers,
            window_size=window_size,
            embedding_dim=embed_dim,
        ).to(self.device)

        # MAE (has its own encoder copy — shares architecture, trains independently)
        self.mae = CsiMaskedAutoencoder(
            input_dim=input_dim,
            embed_dim=embed_dim,
            num_subcarriers=num_subcarriers,
            window_size=window_size,
        ).to(self.device)

        # Denoising autoencoder
        self.dae = CsiDenoisingAutoencoder(
            input_dim=input_dim,
            embed_dim=embed_dim,
            num_subcarriers=num_subcarriers,
            window_size=window_size,
        ).to(self.device)

        # Domain adapter wraps the contrastive encoder
        self.domain_adapter = StationDomainAdapter(
            encoder=self.contrastive_encoder,
            embed_dim=embed_dim,
        ).to(self.device)

        # Contrastive loss
        self.contrastive_loss_fn = NTXentLoss()

        # Optimizer over all parameters
        params = (
            list(self.contrastive_encoder.parameters())
            + list(self.mae.parameters())
            + list(self.dae.parameters())
        )
        self.optimizer = torch.optim.Adam(params, lr=lr)

    def train_step(
        self,
        batch: torch.Tensor,
        target_batch: Optional[torch.Tensor] = None,
    ) -> dict[str, float]:
        """Single training step over a batch.

        Args:
            batch: (B, 2, W, S) — source CSI batch
            target_batch: optional (B, 2, W, S) — target station batch for MMD

        Returns:
            dict of per-loss values: contrastive, mae, denoise, mmd, total
        """
        batch = batch.to(self.device)
        self.contrastive_encoder.train()
        self.mae.train()
        self.dae.train()

        self.optimizer.zero_grad()

        losses: dict[str, float] = {}

        # 1. Contrastive loss: use two halves of the batch as positive pairs
        # Simple approach: split batch in half
        half = batch.shape[0] // 2
        if half >= 2:
            z1 = self.contrastive_encoder(batch[:half])
            z2 = self.contrastive_encoder(batch[half : 2 * half])
            l_contrastive = self.contrastive_loss_fn(z1, z2)
        else:
            l_contrastive = torch.tensor(0.0, device=self.device)
        losses['contrastive'] = l_contrastive.item()

        # 2. MAE loss
        l_mae = self.mae.compute_loss(batch)
        losses['mae'] = l_mae.item()

        # 3. Denoising loss
        l_denoise = self.dae.compute_loss(batch)
        losses['denoise'] = l_denoise.item()

        # 4. MMD loss (only if target batch provided)
        if target_batch is not None:
            target_batch = target_batch.to(self.device)
            _, _, l_mmd = self.domain_adapter(batch, target_batch)
        else:
            l_mmd = torch.tensor(0.0, device=self.device)
        losses['mmd'] = l_mmd.item()

        # Combined loss
        total = (
            self.alpha * l_contrastive
            + self.beta * l_mae
            + self.gamma * l_denoise
            + self.delta * l_mmd
        )
        losses['total'] = total.item()

        total.backward()
        self.optimizer.step()

        return losses

    def get_encoder(self) -> nn.Module:
        """Get the shared contrastive encoder for downstream tasks."""
        return self.contrastive_encoder

    def save(self, path: str) -> None:
        """Save all model weights."""
        torch.save(
            {
                'contrastive_encoder': self.contrastive_encoder.state_dict(),
                'mae': self.mae.state_dict(),
                'dae': self.dae.state_dict(),
            },
            path,
        )
        logger.info("Saved AdvancedSSLTrainer to %s", path)

    def load(self, path: str) -> None:
        """Load all model weights."""
        checkpoint = torch.load(path, map_location=self.device, weights_only=True)
        self.contrastive_encoder.load_state_dict(checkpoint['contrastive_encoder'])
        self.mae.load_state_dict(checkpoint['mae'])
        self.dae.load_state_dict(checkpoint['dae'])
        logger.info("Loaded AdvancedSSLTrainer from %s", path)

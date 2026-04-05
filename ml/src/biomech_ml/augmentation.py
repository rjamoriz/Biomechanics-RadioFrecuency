"""
CSI-specific data augmentation for Wi-Fi sensing models.

Each augmentation is designed to simulate realistic signal variation while
preserving the underlying gait-related patterns. All functions operate on
batched PyTorch tensors.

Supported input shapes:
    - 3D: (batch, channels, subcarriers)
    - 4D: (batch, seq_len, channels, subcarriers)

These augmentations are SIGNAL-LEVEL transformations. They do not alter
the biomechanical content — they model hardware noise, environment drift,
and subcarrier-level variations observed in real Wi-Fi CSI deployments.
"""

from __future__ import annotations

from dataclasses import dataclass

import torch
from torch import Tensor


# ── Individual augmentations ────────────────────────────────────────── #

def time_warp(x: Tensor, sigma: float = 0.2) -> Tensor:
    """Random time stretching via cubic interpolation along the subcarrier axis.

    Generates a smooth random warp field and resamples the subcarrier dimension.
    Uses grid_sample for differentiable interpolation.

    Args:
        x: (B, C, S) or (B, T, C, S)
        sigma: standard deviation of the warp displacement (fraction of total length)

    Returns:
        Warped tensor with same shape as input.
    """
    is_4d = x.dim() == 4
    if is_4d:
        B, T, C, S = x.shape
        x = x.reshape(B * T, C, S)
    else:
        B_flat, C, S = x.shape

    # For grid_sample: input needs to be (N, C, H, W)
    # Treat subcarriers as W, add dummy H=1
    x_4d = x.unsqueeze(2)  # (N, C, 1, S)

    # Generate smooth warp field: random displacement per sample
    device = x.device
    N = x_4d.shape[0]

    # Base grid: linearly spaced [-1, 1]
    base = torch.linspace(-1, 1, S, device=device).unsqueeze(0).expand(N, -1)
    # Random warp displacement
    displacement = torch.randn(N, S, device=device) * sigma
    # Smooth the displacement with a running average
    kernel_size = max(3, S // 8)
    if kernel_size % 2 == 0:
        kernel_size += 1
    padding = kernel_size // 2
    displacement = displacement.unsqueeze(1)  # (N, 1, S)
    avg_kernel = torch.ones(1, 1, kernel_size, device=device) / kernel_size
    displacement = torch.nn.functional.conv1d(displacement, avg_kernel, padding=padding)
    displacement = displacement.squeeze(1)  # (N, S)

    warped_grid = base + displacement
    warped_grid = warped_grid.clamp(-1, 1)

    # Build grid for grid_sample: (N, 1, S, 2) — last dim is (x, y)
    grid_y = torch.zeros_like(warped_grid)
    grid = torch.stack([warped_grid, grid_y], dim=-1).unsqueeze(1)  # (N, 1, S, 2)

    result = torch.nn.functional.grid_sample(
        x_4d, grid, mode="bilinear", padding_mode="border", align_corners=True,
    )
    result = result.squeeze(2)  # (N, C, S)

    if is_4d:
        result = result.reshape(B, T, C, S)
    return result


def noise_injection(x: Tensor, scale: float = 0.05) -> Tensor:
    """Add Gaussian noise to simulate electronic/environmental noise.

    Args:
        x: (B, C, S) or (B, T, C, S)
        scale: standard deviation of added noise

    Returns:
        x + N(0, scale²)
    """
    return x + torch.randn_like(x) * scale


def amplitude_scaling(x: Tensor, range: tuple[float, float] = (0.8, 1.2)) -> Tensor:
    """Random per-subcarrier amplitude scaling.

    Simulates gain variations across subcarrier channels.

    Args:
        x: (B, C, S) or (B, T, C, S)
        range: (low, high) uniform range for scale factors

    Returns:
        Scaled tensor with same shape.
    """
    low, high = range
    S = x.shape[-1]

    if x.dim() == 4:
        scales = torch.empty(x.shape[0], 1, 1, S, device=x.device).uniform_(low, high)
    else:
        scales = torch.empty(x.shape[0], 1, S, device=x.device).uniform_(low, high)

    return x * scales


def subcarrier_dropout(x: Tensor, drop_rate: float = 0.1) -> Tensor:
    """Randomly zero out entire subcarrier channels.

    Simulates subcarrier-level signal loss common in real CSI deployments.

    Args:
        x: (B, C, S) or (B, T, C, S)
        drop_rate: probability of dropping each subcarrier

    Returns:
        Tensor with randomly zeroed subcarrier columns.
    """
    S = x.shape[-1]

    if x.dim() == 4:
        mask = torch.bernoulli(torch.full((x.shape[0], 1, 1, S), 1 - drop_rate, device=x.device))
    else:
        mask = torch.bernoulli(torch.full((x.shape[0], 1, S), 1 - drop_rate, device=x.device))

    return x * mask


def mixup(
    x1: Tensor, x2: Tensor, alpha: float = 0.2,
) -> tuple[Tensor, float]:
    """Linear interpolation between two samples (mixup regularization).

    Args:
        x1: first tensor
        x2: second tensor (same shape)
        alpha: Beta distribution parameter

    Returns:
        (mixed_tensor, lambda_value) — the interpolated tensor and the mixing coefficient.
    """
    lam = torch.distributions.Beta(alpha, alpha).sample().item() if alpha > 0 else 0.5
    mixed = lam * x1 + (1 - lam) * x2
    return mixed, lam


def phase_shift(x: Tensor, max_shift: float = 0.5) -> Tensor:
    """Random phase offset applied ONLY to the phase channel (index 1).

    Simulates clock drift and phase offset in CSI receivers. The amplitude
    channel (index 0) is left unchanged.

    Args:
        x: (B, C, S) or (B, T, C, S) where C >= 2 and channel 1 is phase
        max_shift: maximum phase shift in radians

    Returns:
        Tensor with phase channel shifted, amplitude unchanged.
    """
    out = x.clone()

    if x.dim() == 4:
        B = x.shape[0]
        shifts = torch.empty(B, 1, 1, 1, device=x.device).uniform_(-max_shift, max_shift)
        out[:, :, 1:2, :] = out[:, :, 1:2, :] + shifts
    else:
        B = x.shape[0]
        shifts = torch.empty(B, 1, 1, device=x.device).uniform_(-max_shift, max_shift)
        out[:, 1:2, :] = out[:, 1:2, :] + shifts

    return out


# ── Augmentor pipeline ──────────────────────────────────────────────── #

@dataclass
class AugmentorConfig:
    """Configuration for CsiAugmentor."""

    enable_time_warp: bool = True
    time_warp_sigma: float = 0.2
    enable_noise: bool = True
    noise_scale: float = 0.05
    enable_amplitude_scaling: bool = True
    amplitude_range: tuple[float, float] = (0.8, 1.2)
    enable_subcarrier_dropout: bool = True
    subcarrier_drop_rate: float = 0.1
    enable_phase_shift: bool = True
    phase_shift_max: float = 0.5


class CsiAugmentor:
    """Configurable augmentation pipeline for CSI tensors.

    Chains multiple signal-level augmentations in a deterministic order.
    Each augmentation can be individually enabled/disabled.

    Args:
        config: AugmentorConfig with per-augmentation settings.
    """

    def __init__(self, config: AugmentorConfig | None = None) -> None:
        self.config = config or AugmentorConfig()

    def __call__(self, x: Tensor) -> Tensor:
        """Apply the augmentation chain.

        Args:
            x: (B, C, S) or (B, T, C, S)
        Returns:
            Augmented tensor with same shape.
        """
        c = self.config

        if c.enable_time_warp:
            x = time_warp(x, sigma=c.time_warp_sigma)
        if c.enable_noise:
            x = noise_injection(x, scale=c.noise_scale)
        if c.enable_amplitude_scaling:
            x = amplitude_scaling(x, range=c.amplitude_range)
        if c.enable_subcarrier_dropout:
            x = subcarrier_dropout(x, drop_rate=c.subcarrier_drop_rate)
        if c.enable_phase_shift:
            x = phase_shift(x, max_shift=c.phase_shift_max)

        return x

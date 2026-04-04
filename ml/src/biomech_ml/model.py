"""
CsiPoseNet — lightweight CNN + attention model for CSI-to-pose and proxy metric estimation.

Architecture:
    Input: (batch, channels=2, window_frames, num_subcarriers)
      channels: amplitude + phase

    Temporal CNN backbone (3 Conv1D layers with residual connections)
      → extracts temporal patterns per subcarrier

    Multi-head self-attention over subcarrier dimension
      → captures inter-subcarrier spatial relationships

    Dual output heads:
      1. Keypoint head  → 17 COCO keypoints × 3 (x, y, confidence) = 51 values
      2. Proxy head     → 3 values (cadence, symmetry, contact_time)

    Total params: ~400-500K — suitable for edge inference.
"""

from __future__ import annotations

import logging
from pathlib import Path

import torch
import torch.nn as nn

logger = logging.getLogger(__name__)

NUM_KEYPOINTS = 17
KEYPOINT_DIM = 3  # x, y, confidence
NUM_PROXY_METRICS = 3  # cadence, symmetry, contact_time


class ResidualConv1dBlock(nn.Module):
    """Conv1D → BN → ReLU with residual skip connection."""

    def __init__(self, in_ch: int, out_ch: int, kernel_size: int = 5) -> None:
        super().__init__()
        padding = kernel_size // 2
        self.conv = nn.Sequential(
            nn.Conv1d(in_ch, out_ch, kernel_size, padding=padding),
            nn.BatchNorm1d(out_ch),
            nn.ReLU(inplace=True),
            nn.Conv1d(out_ch, out_ch, kernel_size, padding=padding),
            nn.BatchNorm1d(out_ch),
        )
        self.skip = nn.Conv1d(in_ch, out_ch, 1) if in_ch != out_ch else nn.Identity()
        self.relu = nn.ReLU(inplace=True)

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        return self.relu(self.conv(x) + self.skip(x))


class CsiPoseNet(nn.Module):
    """Lightweight CSI → keypoints + proxy metrics network.

    Args:
        num_subcarriers: number of CSI subcarriers (default 64)
        window_size: number of time frames per window (default 64)
        in_channels: 2 (amplitude + phase)
        d_model: hidden dimension after temporal CNN
        n_heads: attention heads
    """

    def __init__(
        self,
        num_subcarriers: int = 64,
        window_size: int = 64,
        in_channels: int = 2,
        d_model: int = 64,
        n_heads: int = 4,
    ) -> None:
        super().__init__()
        self.num_subcarriers = num_subcarriers
        self.window_size = window_size

        # ── Temporal CNN backbone ──
        # Input reshape: (B, C_in, W, S) → merge C_in*S → (B, C_in*S, W)
        # Then apply Conv1d along the temporal dimension.
        conv_in = in_channels * num_subcarriers
        self.temporal_cnn = nn.Sequential(
            ResidualConv1dBlock(conv_in, 128, kernel_size=7),
            nn.Dropout(0.1),
            ResidualConv1dBlock(128, d_model, kernel_size=5),
            nn.Dropout(0.1),
            ResidualConv1dBlock(d_model, d_model, kernel_size=3),
        )
        # Pool temporal dimension → (B, d_model)
        self.temporal_pool = nn.AdaptiveAvgPool1d(1)

        # ── Subcarrier attention ──
        # Operates on a per-subcarrier representation: (B, S, d_sub)
        d_sub = in_channels * window_size  # feature per subcarrier
        self.sub_proj = nn.Linear(d_sub, d_model)
        self.sub_attn = nn.MultiheadAttention(
            embed_dim=d_model, num_heads=n_heads, batch_first=True, dropout=0.1,
        )
        self.sub_norm = nn.LayerNorm(d_model)
        self.sub_pool = nn.AdaptiveAvgPool1d(1)

        # ── Fusion ──
        fused_dim = d_model * 2  # temporal + subcarrier branches
        self.fuse = nn.Sequential(
            nn.Linear(fused_dim, 128),
            nn.ReLU(inplace=True),
            nn.Dropout(0.15),
        )

        # ── Output heads ──
        self.keypoint_head = nn.Sequential(
            nn.Linear(128, 64),
            nn.ReLU(inplace=True),
            nn.Linear(64, NUM_KEYPOINTS * KEYPOINT_DIM),  # 51
        )
        self.proxy_head = nn.Sequential(
            nn.Linear(128, 32),
            nn.ReLU(inplace=True),
            nn.Linear(32, NUM_PROXY_METRICS),  # 3
        )

    def forward(
        self, x: torch.Tensor,
    ) -> tuple[torch.Tensor, torch.Tensor]:
        """
        Args:
            x: (B, C=2, W, S) — channels, window frames, subcarriers

        Returns:
            keypoints: (B, 51)
            proxy_metrics: (B, 3)
        """
        B, C, W, S = x.shape

        # ── Temporal branch ──
        # reshape to (B, C*S, W) for Conv1d
        t = x.permute(0, 1, 3, 2).reshape(B, C * S, W)
        t = self.temporal_cnn(t)  # (B, d_model, W')
        t = self.temporal_pool(t).squeeze(-1)  # (B, d_model)

        # ── Subcarrier attention branch ──
        # reshape to (B, S, C*W)
        s = x.permute(0, 3, 1, 2).reshape(B, S, C * W)
        s = self.sub_proj(s)  # (B, S, d_model)
        attn_out, _ = self.sub_attn(s, s, s)
        s = self.sub_norm(s + attn_out)  # residual
        s = s.permute(0, 2, 1)  # (B, d_model, S)
        s = self.sub_pool(s).squeeze(-1)  # (B, d_model)

        # ── Fuse & heads ──
        fused = self.fuse(torch.cat([t, s], dim=1))
        kp = self.keypoint_head(fused)  # (B, 51)
        pm = self.proxy_head(fused)  # (B, 3)

        return kp, pm


def count_parameters(model: nn.Module) -> int:
    """Total trainable parameter count."""
    return sum(p.numel() for p in model.parameters() if p.requires_grad)


def export_onnx(
    model: CsiPoseNet,
    sample_input: torch.Tensor,
    path: str | Path,
) -> Path:
    """Export CsiPoseNet to ONNX format.

    Args:
        model: trained model in eval mode
        sample_input: example tensor with correct shape (1, C, W, S)
        path: destination .onnx file

    Returns:
        Path to the written file.
    """
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)

    model.eval()
    torch.onnx.export(
        model,
        sample_input,
        str(path),
        input_names=["csi_input"],
        output_names=["keypoints", "proxy_metrics"],
        dynamic_axes={
            "csi_input": {0: "batch"},
            "keypoints": {0: "batch"},
            "proxy_metrics": {0: "batch"},
        },
        opset_version=17,
    )

    logger.info("ONNX model exported to %s (%.1f KB)", path, path.stat().st_size / 1024)
    return path

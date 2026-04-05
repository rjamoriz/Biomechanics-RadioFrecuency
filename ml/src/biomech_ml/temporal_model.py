"""
CsiTemporalModel — LSTM-based recurrent model for multi-frame gait sequence modeling.

Architecture:
    Input: (batch, seq_len, 2, num_subcarriers) — sequence of CSI windows (amplitude + phase)

    Per-window feature extraction: shared Conv1d layers that encode each time window
    independently into a feature vector.

    Temporal sequence modeling: 2-layer bidirectional LSTM over the per-window features.

    Three output heads:
      1. gait_phase    → (batch, seq_len, 4) — softmax probabilities for
         [initial_contact, loading, midstance, propulsion]
      2. stride_events → (batch, seq_len, 2) — foot_strike and toe_off sigmoid probability
      3. fatigue_trend → (batch, 1) — single fatigue drift score for the full sequence

    Total params: ~200-400K depending on configuration.

All outputs are EXPERIMENTAL proxy estimates derived from Wi-Fi CSI sensing.
Every prediction should be accompanied by confidence, signal quality context,
calibration status, and validation state (unvalidated / experimental /
station-validated / externally-validated) before being presented to end users.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass, field

import torch
import torch.nn as nn

logger = logging.getLogger(__name__)

GAIT_PHASES = ["initial_contact", "loading", "midstance", "propulsion"]
NUM_GAIT_PHASES = len(GAIT_PHASES)
NUM_STRIDE_EVENTS = 2  # foot_strike, toe_off


@dataclass
class TemporalConfig:
    """Hyperparameters for CsiTemporalModel."""

    num_subcarriers: int = 64
    in_channels: int = 2  # amplitude + phase
    conv_channels: list[int] = field(default_factory=lambda: [64, 128])
    conv_kernels: list[int] = field(default_factory=lambda: [7, 5])
    hidden_dim: int = 128
    num_layers: int = 2
    bidirectional: bool = True
    dropout: float = 0.3
    num_gait_phases: int = NUM_GAIT_PHASES
    num_stride_events: int = NUM_STRIDE_EVENTS


class WindowEncoder(nn.Module):
    """Shared Conv1d feature extractor applied independently to each CSI window.

    Input:  (batch * seq_len, in_channels, num_subcarriers)
    Output: (batch * seq_len, out_features)
    """

    def __init__(self, config: TemporalConfig) -> None:
        super().__init__()
        layers: list[nn.Module] = []
        in_ch = config.in_channels
        for out_ch, ks in zip(config.conv_channels, config.conv_kernels):
            layers.extend([
                nn.Conv1d(in_ch, out_ch, kernel_size=ks, padding=ks // 2),
                nn.BatchNorm1d(out_ch),
                nn.ReLU(inplace=True),
            ])
            in_ch = out_ch
        self.conv = nn.Sequential(*layers)
        self.pool = nn.AdaptiveAvgPool1d(1)

    @property
    def out_features(self) -> int:
        return self.conv[-2].num_features  # last BatchNorm1d

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        """x: (N, C, S) → (N, out_features)"""
        return self.pool(self.conv(x)).squeeze(-1)


class CsiTemporalModel(nn.Module):
    """LSTM-based temporal model for multi-frame gait sequence analysis.

    Processes a sequence of CSI windows through a shared CNN encoder,
    then feeds the per-window feature sequence into a bidirectional LSTM
    to capture temporal gait dynamics.

    All outputs are EXPERIMENTAL proxy estimates. Validation status must
    be tracked externally per session/station configuration.

    Args:
        config: TemporalConfig with all hyperparameters.
    """

    def __init__(self, config: TemporalConfig | None = None) -> None:
        super().__init__()
        self.config = config or TemporalConfig()
        c = self.config

        # ── Shared per-window CNN encoder ──
        self.window_encoder = WindowEncoder(c)
        encoder_dim = c.conv_channels[-1]  # feature dim per window

        # ── Temporal LSTM ──
        self.lstm = nn.LSTM(
            input_size=encoder_dim,
            hidden_size=c.hidden_dim,
            num_layers=c.num_layers,
            batch_first=True,
            bidirectional=c.bidirectional,
            dropout=c.dropout if c.num_layers > 1 else 0.0,
        )

        lstm_out_dim = c.hidden_dim * (2 if c.bidirectional else 1)
        self.dropout = nn.Dropout(c.dropout)

        # ── Output heads ──

        # Per-frame gait phase classification → softmax
        self.gait_phase_head = nn.Sequential(
            nn.Linear(lstm_out_dim, 64),
            nn.ReLU(inplace=True),
            nn.Linear(64, c.num_gait_phases),
        )

        # Per-frame stride event detection → sigmoid
        self.stride_event_head = nn.Sequential(
            nn.Linear(lstm_out_dim, 64),
            nn.ReLU(inplace=True),
            nn.Linear(64, c.num_stride_events),
        )

        # Sequence-level fatigue trend → single scalar
        self.fatigue_head = nn.Sequential(
            nn.Linear(lstm_out_dim, 64),
            nn.ReLU(inplace=True),
            nn.Linear(64, 1),
        )

    def forward(
        self, x: torch.Tensor,
    ) -> dict[str, torch.Tensor]:
        """
        Args:
            x: (B, T, C, S) where
               B = batch, T = seq_len, C = in_channels (2), S = num_subcarriers

        Returns:
            dict with keys:
                gait_phase:    (B, T, num_gait_phases) — softmax probabilities
                stride_events: (B, T, num_stride_events) — sigmoid probabilities
                fatigue_trend: (B, 1) — fatigue drift proxy score
        """
        B, T, C, S = x.shape

        # Encode each window independently (shared weights)
        x_flat = x.reshape(B * T, C, S)  # (B*T, C, S)
        window_features = self.window_encoder(x_flat)  # (B*T, encoder_dim)
        window_features = window_features.reshape(B, T, -1)  # (B, T, encoder_dim)

        # Temporal modelling
        lstm_out, _ = self.lstm(window_features)  # (B, T, lstm_out_dim)
        lstm_out = self.dropout(lstm_out)

        # Per-frame heads
        gait_phase = self.gait_phase_head(lstm_out)  # (B, T, num_gait_phases)
        gait_phase = torch.softmax(gait_phase, dim=-1)

        stride_events = self.stride_event_head(lstm_out)  # (B, T, num_stride_events)
        stride_events = torch.sigmoid(stride_events)

        # Sequence-level fatigue: pool LSTM outputs then predict
        lstm_pooled = lstm_out.mean(dim=1)  # (B, lstm_out_dim)
        fatigue_trend = self.fatigue_head(lstm_pooled)  # (B, 1)

        return {
            "gait_phase": gait_phase,
            "stride_events": stride_events,
            "fatigue_trend": fatigue_trend,
        }


def create_temporal_model(config: TemporalConfig | None = None) -> CsiTemporalModel:
    """Factory for CsiTemporalModel with optional custom config."""
    return CsiTemporalModel(config)


def count_temporal_parameters(model: CsiTemporalModel) -> int:
    """Total trainable parameter count."""
    return sum(p.numel() for p in model.parameters() if p.requires_grad)

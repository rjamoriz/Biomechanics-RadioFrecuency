"""
Temporal training pipeline — multi-task training for CsiTemporalModel.

Handles gait phase classification, stride event detection, and fatigue trend
regression in a single combined loss. Includes synthetic data generation for
development and integration testing.

All trained outputs are EXPERIMENTAL proxy estimates. The synthetic data generator
produces CSI-like sequences with embedded periodic patterns for development ONLY —
it does not represent real Wi-Fi CSI captures and must not be used for validation.
"""

from __future__ import annotations

import logging
import math
from dataclasses import dataclass
from pathlib import Path

import numpy as np
import torch
import torch.nn as nn
from torch.utils.data import Dataset, DataLoader

from biomech_ml.temporal_model import (
    CsiTemporalModel,
    TemporalConfig,
    NUM_GAIT_PHASES,
    NUM_STRIDE_EVENTS,
)

logger = logging.getLogger(__name__)


# ── Training config ─────────────────────────────────────────────────── #

@dataclass
class TrainConfig:
    """Training hyperparameters for the temporal model."""

    learning_rate: float = 1e-3
    weight_decay: float = 1e-4
    epochs: int = 50
    batch_size: int = 16
    gait_phase_weight: float = 1.0
    stride_event_weight: float = 1.0
    fatigue_weight: float = 0.5
    early_stop_patience: int = 7
    checkpoint_dir: str = "checkpoints"
    log_dir: str = "runs/temporal"


# ── Synthetic data for development ──────────────────────────────────── #

class SyntheticGaitDataset(Dataset):
    """Synthetic CSI gait sequences for development and testing.

    WARNING: This is NOT real Wi-Fi CSI data. Generated sequences use sinusoidal
    patterns to simulate periodic gait-like structure. Use only for development,
    integration testing, and pipeline validation.

    Each sample contains:
        - csi: (seq_len, 2, num_subcarriers) — synthetic amplitude + phase
        - gait_phase: (seq_len,) — integer labels in [0, 3]
        - stride_events: (seq_len, 2) — binary foot_strike and toe_off labels
        - fatigue: scalar fatigue drift value
    """

    def __init__(
        self,
        num_sequences: int,
        seq_len: int,
        num_subcarriers: int = 64,
        seed: int = 42,
    ) -> None:
        super().__init__()
        self.num_sequences = num_sequences
        self.seq_len = seq_len
        self.num_subcarriers = num_subcarriers

        rng = np.random.RandomState(seed)
        self.samples: list[dict[str, torch.Tensor]] = []

        for _ in range(num_sequences):
            sample = _generate_one_sequence(seq_len, num_subcarriers, rng)
            self.samples.append(sample)

    def __len__(self) -> int:
        return self.num_sequences

    def __getitem__(self, idx: int) -> dict[str, torch.Tensor]:
        return self.samples[idx]


def _generate_one_sequence(
    seq_len: int,
    num_subcarriers: int,
    rng: np.random.RandomState,
) -> dict[str, torch.Tensor]:
    """Generate a single synthetic gait CSI sequence with aligned labels."""
    # Gait cycle frequency — simulate ~160-190 SPM cadence
    cadence_spm = rng.uniform(160, 190)
    # Assume each time step ~ 20ms → steps_per_frame
    step_period_frames = max(2, int(60.0 / cadence_spm / 0.02))

    t = np.arange(seq_len, dtype=np.float32)
    phase = (t % step_period_frames) / step_period_frames  # 0→1 per gait cycle

    # ── Gait phase labels (4 phases, equally split across cycle) ──
    gait_phase = (phase * NUM_GAIT_PHASES).astype(np.int64)
    gait_phase = np.clip(gait_phase, 0, NUM_GAIT_PHASES - 1)

    # ── Stride events ──
    foot_strike = np.zeros(seq_len, dtype=np.float32)
    toe_off = np.zeros(seq_len, dtype=np.float32)
    for i in range(seq_len):
        if phase[i] < 0.1:  # initial contact region
            foot_strike[i] = 1.0
        if 0.55 < phase[i] < 0.65:  # toe-off region
            toe_off[i] = 1.0
    stride_events = np.stack([foot_strike, toe_off], axis=-1)

    # ── Fatigue (linear drift + noise) ──
    fatigue = np.float32(rng.uniform(0.0, 1.0))

    # ── Synthetic CSI amplitude + phase ──
    amplitude = np.zeros((seq_len, num_subcarriers), dtype=np.float32)
    phase_ch = np.zeros((seq_len, num_subcarriers), dtype=np.float32)

    freqs = rng.uniform(0.5, 3.0, size=num_subcarriers).astype(np.float32)
    base_amp = rng.uniform(0.3, 1.0, size=num_subcarriers).astype(np.float32)

    for s in range(num_subcarriers):
        # Gait-modulated sinusoid
        signal = base_amp[s] * np.sin(
            2 * math.pi * freqs[s] * t / step_period_frames
        )
        amplitude[:, s] = signal + rng.normal(0, 0.05, seq_len).astype(np.float32)
        phase_ch[:, s] = np.angle(
            np.exp(1j * (freqs[s] * t / step_period_frames + rng.uniform(0, 2 * math.pi)))
        ).astype(np.float32)

    # Fatigue modulation: amplitude decays over sequence
    decay = np.linspace(1.0, 1.0 - 0.3 * fatigue, seq_len, dtype=np.float32)
    amplitude *= decay[:, np.newaxis]

    # Stack to (seq_len, 2, num_subcarriers)
    csi = np.stack([amplitude, phase_ch], axis=1)

    return {
        "csi": torch.from_numpy(csi),
        "gait_phase": torch.from_numpy(gait_phase),
        "stride_events": torch.from_numpy(stride_events),
        "fatigue": torch.tensor(fatigue),
    }


def generate_synthetic_gait_data(
    num_sequences: int,
    seq_len: int,
    num_subcarriers: int = 64,
    seed: int = 42,
) -> SyntheticGaitDataset:
    """Create a synthetic gait dataset for development and testing.

    WARNING: Synthetic data only — not real Wi-Fi CSI. Do not use for validation.

    Returns:
        SyntheticGaitDataset with the requested number of sequences.
    """
    return SyntheticGaitDataset(num_sequences, seq_len, num_subcarriers, seed)


# ── Collate ─────────────────────────────────────────────────────────── #

def gait_collate_fn(
    batch: list[dict[str, torch.Tensor]],
) -> dict[str, torch.Tensor]:
    """Collate function that stacks variable fields into batched tensors."""
    return {
        "csi": torch.stack([s["csi"] for s in batch]),
        "gait_phase": torch.stack([s["gait_phase"] for s in batch]),
        "stride_events": torch.stack([s["stride_events"] for s in batch]),
        "fatigue": torch.stack([s["fatigue"] for s in batch]),
    }


# ── Trainer ─────────────────────────────────────────────────────────── #

class TemporalTrainer:
    """Multi-task trainer for CsiTemporalModel.

    Combines three losses:
      - gait_phase_loss: CrossEntropy on per-frame gait phase classification
      - stride_event_loss: BCE on per-frame stride event detection
      - fatigue_loss: MSE on sequence-level fatigue drift prediction

    Total loss = w1 * gait_phase_loss + w2 * stride_event_loss + w3 * fatigue_loss
    """

    def __init__(
        self,
        model: CsiTemporalModel,
        train_config: TrainConfig | None = None,
        device: torch.device | None = None,
    ) -> None:
        self.model = model
        self.config = train_config or TrainConfig()
        self.device = device or torch.device("cpu")
        self.model.to(self.device)

        self.optimizer = torch.optim.AdamW(
            model.parameters(),
            lr=self.config.learning_rate,
            weight_decay=self.config.weight_decay,
        )

        self.gait_phase_criterion = nn.CrossEntropyLoss()
        self.stride_event_criterion = nn.BCELoss()
        self.fatigue_criterion = nn.MSELoss()

        self.best_val_loss = float("inf")
        self.patience_counter = 0

    def train_epoch(self, dataloader: DataLoader) -> dict[str, float]:
        """Run one training epoch.

        Returns:
            Dict with loss components: total, gait_phase, stride_event, fatigue.
        """
        self.model.train()
        totals = {"total": 0.0, "gait_phase": 0.0, "stride_event": 0.0, "fatigue": 0.0}
        n_batches = 0

        for batch in dataloader:
            csi = batch["csi"].to(self.device)
            gait_labels = batch["gait_phase"].to(self.device)
            event_labels = batch["stride_events"].to(self.device)
            fatigue_labels = batch["fatigue"].to(self.device)

            outputs = self.model(csi)

            # Gait phase: CrossEntropy expects (N, C) and (N,) so flatten
            B, T, _ = outputs["gait_phase"].shape
            gp_pred = outputs["gait_phase"].reshape(B * T, -1)
            # CrossEntropy needs logits, but we have softmax output → use log + nll
            gp_loss = self.gait_phase_criterion(
                torch.log(gp_pred + 1e-8), gait_labels.reshape(B * T)
            )

            # Stride events: BCE on sigmoid output
            se_loss = self.stride_event_criterion(
                outputs["stride_events"], event_labels
            )

            # Fatigue: MSE
            f_loss = self.fatigue_criterion(
                outputs["fatigue_trend"].squeeze(-1), fatigue_labels
            )

            loss = (
                self.config.gait_phase_weight * gp_loss
                + self.config.stride_event_weight * se_loss
                + self.config.fatigue_weight * f_loss
            )

            self.optimizer.zero_grad()
            loss.backward()
            torch.nn.utils.clip_grad_norm_(self.model.parameters(), max_norm=1.0)
            self.optimizer.step()

            totals["total"] += loss.item()
            totals["gait_phase"] += gp_loss.item()
            totals["stride_event"] += se_loss.item()
            totals["fatigue"] += f_loss.item()
            n_batches += 1

        return {k: v / max(n_batches, 1) for k, v in totals.items()}

    @torch.no_grad()
    def evaluate(self, dataloader: DataLoader) -> dict[str, float]:
        """Evaluate model on a dataloader.

        Returns:
            Dict with: val_loss, gait_phase_accuracy, stride_event_f1.
        """
        self.model.eval()
        total_loss = 0.0
        correct_phases = 0
        total_frames = 0
        tp = torch.zeros(NUM_STRIDE_EVENTS)
        fp = torch.zeros(NUM_STRIDE_EVENTS)
        fn = torch.zeros(NUM_STRIDE_EVENTS)
        n_batches = 0

        for batch in dataloader:
            csi = batch["csi"].to(self.device)
            gait_labels = batch["gait_phase"].to(self.device)
            event_labels = batch["stride_events"].to(self.device)
            fatigue_labels = batch["fatigue"].to(self.device)

            outputs = self.model(csi)
            B, T, _ = outputs["gait_phase"].shape

            # Loss
            gp_pred = outputs["gait_phase"].reshape(B * T, -1)
            gp_loss = self.gait_phase_criterion(
                torch.log(gp_pred + 1e-8), gait_labels.reshape(B * T)
            )
            se_loss = self.stride_event_criterion(
                outputs["stride_events"], event_labels
            )
            f_loss = self.fatigue_criterion(
                outputs["fatigue_trend"].squeeze(-1), fatigue_labels
            )
            loss = (
                self.config.gait_phase_weight * gp_loss
                + self.config.stride_event_weight * se_loss
                + self.config.fatigue_weight * f_loss
            )
            total_loss += loss.item()

            # Gait phase accuracy
            pred_phases = outputs["gait_phase"].argmax(dim=-1)  # (B, T)
            correct_phases += (pred_phases == gait_labels).sum().item()
            total_frames += B * T

            # Stride event F1 (threshold 0.5)
            pred_events = (outputs["stride_events"] > 0.5).float().cpu()
            event_labels_cpu = event_labels.cpu()
            tp += (pred_events * event_labels_cpu).sum(dim=(0, 1))
            fp += (pred_events * (1 - event_labels_cpu)).sum(dim=(0, 1))
            fn += ((1 - pred_events) * event_labels_cpu).sum(dim=(0, 1))

            n_batches += 1

        precision = tp / (tp + fp + 1e-8)
        recall = tp / (tp + fn + 1e-8)
        f1 = 2 * precision * recall / (precision + recall + 1e-8)

        return {
            "val_loss": total_loss / max(n_batches, 1),
            "gait_phase_accuracy": correct_phases / max(total_frames, 1),
            "stride_event_f1": f1.mean().item(),
        }

    def check_early_stop(self, val_loss: float) -> bool:
        """Returns True if training should stop due to no improvement."""
        if val_loss < self.best_val_loss:
            self.best_val_loss = val_loss
            self.patience_counter = 0
            return False
        self.patience_counter += 1
        return self.patience_counter >= self.config.early_stop_patience

    def save_checkpoint(self, path: str | Path, epoch: int, val_loss: float) -> Path:
        """Save model checkpoint."""
        path = Path(path)
        path.parent.mkdir(parents=True, exist_ok=True)
        torch.save(
            {
                "epoch": epoch,
                "model_state_dict": self.model.state_dict(),
                "optimizer_state_dict": self.optimizer.state_dict(),
                "val_loss": val_loss,
                "config": self.config,
                "model_config": self.model.config,
            },
            path,
        )
        logger.info("Checkpoint saved to %s (epoch %d, val_loss=%.4f)", path, epoch, val_loss)
        return path

    def load_checkpoint(self, path: str | Path) -> dict:
        """Load model checkpoint."""
        checkpoint = torch.load(path, map_location=self.device, weights_only=False)
        self.model.load_state_dict(checkpoint["model_state_dict"])
        self.optimizer.load_state_dict(checkpoint["optimizer_state_dict"])
        logger.info("Checkpoint loaded from %s (epoch %d)", path, checkpoint["epoch"])
        return checkpoint

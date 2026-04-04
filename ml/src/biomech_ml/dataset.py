"""
CsiDataset — PyTorch Dataset for loading CSI capture windows with labels.

Directory structure:
    data/{session_id}/csi_frames.npz    — amplitudes, phases, timestamps
    data/{session_id}/labels.npz        — keypoints (N, 51), proxy_metrics (N, 3)
    data/{session_id}/metadata.yaml     — session info, station, protocol
"""

from __future__ import annotations

import logging
from pathlib import Path
from typing import Any

import numpy as np
import torch
from torch.utils.data import Dataset

logger = logging.getLogger(__name__)


class CsiDataset(Dataset):
    """Sliding-window dataset over CSI amplitude+phase frames with keypoint and proxy labels.

    Each sample yields:
        x   — (channels=2, window_size, num_subcarriers)  amplitude + phase
        kp  — (51,) flattened COCO 17-keypoint (x, y, conf)
        pm  — (3,)  proxy metrics (cadence, symmetry, contact_time)
    """

    def __init__(
        self,
        data_dir: str | Path,
        window_size: int = 64,
        stride: int = 16,
        split: str = "train",
        val_ratio: float = 0.15,
        seed: int = 42,
    ) -> None:
        self.data_dir = Path(data_dir)
        self.window_size = window_size
        self.stride = stride
        self.split = split

        self._windows: list[tuple[np.ndarray, np.ndarray, np.ndarray]] = []

        session_dirs = sorted(
            [d for d in self.data_dir.iterdir() if d.is_dir()],
            key=lambda d: d.name,
        )
        if not session_dirs:
            logger.warning("No session directories found in %s", self.data_dir)
            return

        # Deterministic train/val split at session level (no leakage)
        rng = np.random.default_rng(seed)
        indices = rng.permutation(len(session_dirs))
        n_val = max(1, int(len(session_dirs) * val_ratio))
        val_indices = set(indices[:n_val].tolist())

        for idx, session_dir in enumerate(session_dirs):
            is_val = idx in val_indices
            if (split == "train" and is_val) or (split == "val" and not is_val):
                continue
            self._load_session(session_dir)

        logger.info(
            "CsiDataset[%s]: %d windows from %d sessions (window=%d, stride=%d)",
            split,
            len(self._windows),
            len(session_dirs) - (n_val if split == "train" else len(session_dirs) - n_val),
            window_size,
            stride,
        )

    # ------------------------------------------------------------------ #
    # Loading
    # ------------------------------------------------------------------ #

    def _load_session(self, session_dir: Path) -> None:
        frames_path = session_dir / "csi_frames.npz"
        labels_path = session_dir / "labels.npz"

        if not frames_path.exists() or not labels_path.exists():
            logger.debug("Skipping %s — missing frames or labels", session_dir.name)
            return

        frames = np.load(frames_path)
        labels = np.load(labels_path)

        amplitudes: np.ndarray = frames["amplitudes"]  # (N, subcarriers)
        phases: np.ndarray = frames["phases"]  # (N, subcarriers)
        keypoints: np.ndarray = labels["keypoints"]  # (N, 51)
        proxy_metrics: np.ndarray = labels["proxy_metrics"]  # (N, 3)

        n_frames = amplitudes.shape[0]
        if n_frames < self.window_size:
            logger.debug(
                "Session %s has only %d frames (< window %d) — skipped",
                session_dir.name,
                n_frames,
                self.window_size,
            )
            return

        # Normalize amplitude (z-score per subcarrier) and unwrap phase
        amplitudes = self._normalize_amplitude(amplitudes)
        phases = self._unwrap_phase(phases)

        for start in range(0, n_frames - self.window_size + 1, self.stride):
            end = start + self.window_size
            amp_win = amplitudes[start:end]  # (W, S)
            pha_win = phases[start:end]  # (W, S)
            # Label = values at the CENTER of the window
            center = start + self.window_size // 2
            kp = keypoints[center]
            pm = proxy_metrics[center]
            self._windows.append((
                np.stack([amp_win, pha_win], axis=0).astype(np.float32),  # (2, W, S)
                kp.astype(np.float32),
                pm.astype(np.float32),
            ))

    @staticmethod
    def _normalize_amplitude(amp: np.ndarray, eps: float = 1e-8) -> np.ndarray:
        mean = amp.mean(axis=0, keepdims=True)
        std = amp.std(axis=0, keepdims=True)
        return (amp - mean) / (std + eps)

    @staticmethod
    def _unwrap_phase(phase: np.ndarray) -> np.ndarray:
        return np.unwrap(phase, axis=0)

    # ------------------------------------------------------------------ #
    # Dataset interface
    # ------------------------------------------------------------------ #

    def __len__(self) -> int:
        return len(self._windows)

    def __getitem__(self, idx: int) -> tuple[torch.Tensor, torch.Tensor, torch.Tensor]:
        x, kp, pm = self._windows[idx]
        return torch.from_numpy(x), torch.from_numpy(kp), torch.from_numpy(pm)

    # ------------------------------------------------------------------ #
    # Metadata helper
    # ------------------------------------------------------------------ #

    @staticmethod
    def load_session_metadata(session_dir: str | Path) -> dict[str, Any]:
        """Load optional metadata.yaml from a session directory."""
        meta_path = Path(session_dir) / "metadata.yaml"
        if not meta_path.exists():
            return {}
        try:
            import yaml

            with open(meta_path) as f:
                return yaml.safe_load(f) or {}
        except Exception:
            return {}

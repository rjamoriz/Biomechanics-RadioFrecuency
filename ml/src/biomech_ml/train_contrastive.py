"""
Train the contrastive encoder on CSI data (self-supervised).

Usage:
    python -m biomech_ml.train_contrastive \
        --data-dir data/ \
        --epochs 200 \
        --batch-size 128 \
        --temperature 0.07 \
        --output-dir storage/models

Self-supervised — no labels required. Just CSI windows.
Positive pairs are generated via augmentation (same window, different augmentations).

The trained encoder produces 128-dim embeddings that serve as input for
downstream task heads (cadence, symmetry, contact_time, activity, etc.).

All outputs are EXPERIMENTAL.
"""

from __future__ import annotations

import argparse
import json
import logging
import time
from pathlib import Path

import numpy as np
import torch
from torch.utils.data import DataLoader, Dataset

from biomech_ml.contrastive import (
    CsiAugmentation,
    CsiContrastiveEncoder,
    NTXentLoss,
    count_encoder_parameters,
    export_encoder_onnx,
    save_encoder_safetensors,
)
from biomech_ml.dataset import CsiDataset

logger = logging.getLogger(__name__)


# ── Contrastive Dataset Wrapper ─────────────────────────────────────── #

class ContrastiveDatasetWrapper(Dataset):
    """Wraps CsiDataset to produce augmented positive pairs for contrastive learning.

    Returns two augmented views of each CSI window (no labels needed).
    """

    def __init__(self, base_dataset: CsiDataset, augmentation: CsiAugmentation) -> None:
        self.base = base_dataset
        self.augment = augmentation

    def __len__(self) -> int:
        return len(self.base)

    def __getitem__(self, idx: int) -> tuple[torch.Tensor, torch.Tensor]:
        x, _, _ = self.base[idx]  # (C, W, S) — ignore labels
        view_i, view_j = self.augment(x)
        return view_i, view_j


# ── Training ────────────────────────────────────────────────────────── #

def set_seed(seed: int) -> None:
    torch.manual_seed(seed)
    np.random.seed(seed)
    if torch.cuda.is_available():
        torch.cuda.manual_seed_all(seed)
    torch.backends.cudnn.deterministic = True
    torch.backends.cudnn.benchmark = False


def train_contrastive(args: argparse.Namespace) -> Path:
    set_seed(args.seed)

    output_dir = Path(args.output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)

    # ── TensorBoard ──
    writer = None
    try:
        from torch.utils.tensorboard import SummaryWriter
        writer = SummaryWriter(log_dir=str(output_dir / "contrastive_tb_logs"))
    except ImportError:
        logger.warning("tensorboard not installed — skipping TB logging")

    # ── Data ──
    augmentation = CsiAugmentation(
        time_shift_max=args.time_shift_max,
        subcarrier_drop_prob=args.subcarrier_drop_prob,
        noise_std=args.noise_std,
    )

    base_train = CsiDataset(
        args.data_dir,
        window_size=args.window_size,
        split="train",
        seed=args.seed,
    )
    base_val = CsiDataset(
        args.data_dir,
        window_size=args.window_size,
        split="val",
        seed=args.seed,
    )

    if len(base_train) == 0:
        logger.error("Training dataset is empty — check --data-dir path and contents")
        raise SystemExit(1)

    train_ds = ContrastiveDatasetWrapper(base_train, augmentation)
    val_ds = ContrastiveDatasetWrapper(base_val, augmentation)

    train_loader = DataLoader(
        train_ds,
        batch_size=args.batch_size,
        shuffle=True,
        num_workers=0,
        pin_memory=torch.cuda.is_available(),
        drop_last=True,  # NT-Xent needs consistent batch size
    )
    val_loader = DataLoader(
        val_ds,
        batch_size=args.batch_size,
        shuffle=False,
        num_workers=0,
        drop_last=True,
    )

    # Infer subcarrier count
    sample_x, _ = train_ds[0]
    _, _, num_subcarriers = sample_x.shape

    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    encoder = CsiContrastiveEncoder(
        num_subcarriers=num_subcarriers,
        window_size=args.window_size,
    ).to(device)

    logger.info(
        "CsiContrastiveEncoder — %s params, device=%s, subcarriers=%d, window=%d",
        f"{count_encoder_parameters(encoder):,}",
        device,
        num_subcarriers,
        args.window_size,
    )

    criterion = NTXentLoss(temperature=args.temperature)
    optimizer = torch.optim.AdamW(encoder.parameters(), lr=args.lr, weight_decay=1e-4)
    scheduler = torch.optim.lr_scheduler.CosineAnnealingLR(
        optimizer, T_max=args.epochs, eta_min=1e-6,
    )

    best_val_loss = float("inf")
    patience_counter = 0
    patience = 20

    for epoch in range(1, args.epochs + 1):
        t0 = time.monotonic()

        # ── Train ──
        encoder.train()
        train_loss = 0.0
        n_batches = 0

        for view_i, view_j in train_loader:
            view_i, view_j = view_i.to(device), view_j.to(device)

            optimizer.zero_grad()
            z_i = encoder(view_i)
            z_j = encoder(view_j)
            loss = criterion(z_i, z_j)
            loss.backward()
            torch.nn.utils.clip_grad_norm_(encoder.parameters(), max_norm=1.0)
            optimizer.step()

            train_loss += loss.item()
            n_batches += 1

        train_loss /= max(n_batches, 1)
        scheduler.step()

        # ── Validate ──
        encoder.eval()
        val_loss = 0.0
        val_batches = 0

        with torch.no_grad():
            for view_i, view_j in val_loader:
                view_i, view_j = view_i.to(device), view_j.to(device)
                z_i = encoder(view_i)
                z_j = encoder(view_j)
                loss = criterion(z_i, z_j)
                val_loss += loss.item()
                val_batches += 1

        val_loss /= max(val_batches, 1)
        elapsed = time.monotonic() - t0

        if writer:
            writer.add_scalar("contrastive/train_loss", train_loss, epoch)
            writer.add_scalar("contrastive/val_loss", val_loss, epoch)
            writer.add_scalar("contrastive/lr", scheduler.get_last_lr()[0], epoch)

        if epoch % 10 == 0 or epoch == 1:
            logger.info(
                "Epoch %3d/%d — train=%.4f  val=%.4f  lr=%.2e  (%.1fs)",
                epoch,
                args.epochs,
                train_loss,
                val_loss,
                scheduler.get_last_lr()[0],
                elapsed,
            )

        # ── Checkpointing ──
        torch.save(encoder.state_dict(), output_dir / "contrastive-latest.pt")

        if val_loss < best_val_loss:
            best_val_loss = val_loss
            patience_counter = 0
            torch.save(encoder.state_dict(), output_dir / "biomech-encoder.pt")
            logger.info("  ✓ new best val_loss=%.4f — saved biomech-encoder.pt", val_loss)
        else:
            patience_counter += 1

        if patience_counter >= patience:
            logger.info("Early stopping at epoch %d (patience=%d)", epoch, patience)
            break

    if writer:
        writer.close()

    # ── Export ──
    encoder.load_state_dict(
        torch.load(output_dir / "biomech-encoder.pt", weights_only=True)
    )
    encoder.to("cpu").eval()

    # Safetensors
    save_encoder_safetensors(encoder, str(output_dir / "biomech-encoder.safetensors"))

    # ONNX
    export_encoder_onnx(
        encoder,
        str(output_dir / "biomech-encoder.onnx"),
        num_subcarriers=num_subcarriers,
        window_size=args.window_size,
    )

    # Training config
    config = {
        "model": "CsiContrastiveEncoder",
        "embedding_dim": 128,
        "window_size": args.window_size,
        "num_subcarriers": num_subcarriers,
        "epochs_trained": epoch,
        "best_val_loss": round(best_val_loss, 6),
        "params": count_encoder_parameters(encoder),
        "temperature": args.temperature,
        "lr": args.lr,
        "batch_size": args.batch_size,
        "seed": args.seed,
        "experimental": True,
        "validation_status": "unvalidated",
    }
    with open(output_dir / "contrastive_config.json", "w") as f:
        json.dump(config, f, indent=2)

    logger.info("Contrastive training complete — encoder exported to %s", output_dir)
    return output_dir / "biomech-encoder.safetensors"


# ── CLI ─────────────────────────────────────────────────────────────── #

def main() -> None:
    logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")

    parser = argparse.ArgumentParser(description="Train contrastive CSI encoder")
    parser.add_argument("--data-dir", type=str, required=True, help="Root data directory")
    parser.add_argument("--epochs", type=int, default=200)
    parser.add_argument("--batch-size", type=int, default=128)
    parser.add_argument("--lr", type=float, default=3e-4)
    parser.add_argument("--temperature", type=float, default=0.07)
    parser.add_argument("--window-size", type=int, default=64)
    parser.add_argument("--seed", type=int, default=42)
    parser.add_argument("--output-dir", type=str, default="storage/models")
    parser.add_argument("--time-shift-max", type=int, default=4)
    parser.add_argument("--subcarrier-drop-prob", type=float, default=0.1)
    parser.add_argument("--noise-std", type=float, default=0.05)

    args = parser.parse_args()
    train_contrastive(args)


if __name__ == "__main__":
    main()

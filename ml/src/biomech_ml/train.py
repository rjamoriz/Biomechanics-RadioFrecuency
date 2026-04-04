"""
Training script for CsiPoseNet — CSI-to-pose + proxy metric estimation.

Usage:
    python -m biomech_ml.train \
        --data-dir data/ \
        --epochs 100 \
        --batch-size 32 \
        --lr 1e-3 \
        --window-size 64 \
        --seed 42 \
        --output-dir storage/models
"""

from __future__ import annotations

import argparse
import json
import logging
import time
from pathlib import Path

import numpy as np
import torch
import torch.nn as nn
from torch.utils.data import DataLoader

from biomech_ml.dataset import CsiDataset
from biomech_ml.model import CsiPoseNet, count_parameters, export_onnx

logger = logging.getLogger(__name__)


# ── Loss ────────────────────────────────────────────────────────────── #

class CompositeLoss(nn.Module):
    """Weighted combination of keypoint MSE, proxy Huber, and confidence weighting."""

    def __init__(self, kp_weight: float = 1.0, proxy_weight: float = 0.5) -> None:
        super().__init__()
        self.kp_weight = kp_weight
        self.proxy_weight = proxy_weight
        self.kp_loss = nn.MSELoss()
        self.proxy_loss = nn.HuberLoss(delta=1.0)

    def forward(
        self,
        kp_pred: torch.Tensor,
        kp_target: torch.Tensor,
        pm_pred: torch.Tensor,
        pm_target: torch.Tensor,
    ) -> torch.Tensor:
        # Confidence-weighted keypoint loss:
        # every 3rd value in the 51-dim vector is confidence — weight xy errors by it
        B = kp_target.shape[0]
        kp_t = kp_target.view(B, 17, 3)
        kp_p = kp_pred.view(B, 17, 3)
        conf = kp_t[:, :, 2:3].clamp(min=0.1)  # (B, 17, 1) — target confidence as weight

        xy_loss = ((kp_p[:, :, :2] - kp_t[:, :, :2]) ** 2 * conf).mean()
        conf_loss = nn.functional.mse_loss(kp_p[:, :, 2:3], kp_t[:, :, 2:3])
        kp_total = xy_loss + conf_loss

        proxy_total = self.proxy_loss(pm_pred, pm_target)

        return self.kp_weight * kp_total + self.proxy_weight * proxy_total


# ── Training loop ───────────────────────────────────────────────────── #

def set_seed(seed: int) -> None:
    """Deterministic seeding for reproducibility."""
    torch.manual_seed(seed)
    np.random.seed(seed)
    if torch.cuda.is_available():
        torch.cuda.manual_seed_all(seed)
    torch.backends.cudnn.deterministic = True
    torch.backends.cudnn.benchmark = False


def train(args: argparse.Namespace) -> Path:
    set_seed(args.seed)

    output_dir = Path(args.output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)

    # ── TensorBoard ──
    writer = None
    try:
        from torch.utils.tensorboard import SummaryWriter
        writer = SummaryWriter(log_dir=str(output_dir / "tb_logs"))
    except ImportError:
        logger.warning("tensorboard not installed — skipping TB logging")

    # ── Data ──
    train_ds = CsiDataset(args.data_dir, window_size=args.window_size, split="train", seed=args.seed)
    val_ds = CsiDataset(args.data_dir, window_size=args.window_size, split="val", seed=args.seed)

    if len(train_ds) == 0:
        logger.error("Training dataset is empty — check --data-dir path and contents")
        raise SystemExit(1)

    train_loader = DataLoader(
        train_ds,
        batch_size=args.batch_size,
        shuffle=True,
        num_workers=0,
        pin_memory=torch.cuda.is_available(),
    )
    val_loader = DataLoader(
        val_ds,
        batch_size=args.batch_size,
        shuffle=False,
        num_workers=0,
    )

    # Infer subcarrier count from first sample
    sample_x, _, _ = train_ds[0]
    _, _, num_subcarriers = sample_x.shape  # (C, W, S)

    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    model = CsiPoseNet(
        num_subcarriers=num_subcarriers,
        window_size=args.window_size,
    ).to(device)

    logger.info(
        "CsiPoseNet — %s params, device=%s, subcarriers=%d, window=%d",
        f"{count_parameters(model):,}",
        device,
        num_subcarriers,
        args.window_size,
    )

    criterion = CompositeLoss()
    optimizer = torch.optim.AdamW(model.parameters(), lr=args.lr, weight_decay=1e-4)
    scheduler = torch.optim.lr_scheduler.CosineAnnealingLR(optimizer, T_max=args.epochs, eta_min=1e-6)

    best_val_loss = float("inf")
    patience_counter = 0
    patience = 15

    for epoch in range(1, args.epochs + 1):
        t0 = time.monotonic()

        # ── Train ──
        model.train()
        train_loss = 0.0
        for x, kp, pm in train_loader:
            x, kp, pm = x.to(device), kp.to(device), pm.to(device)
            optimizer.zero_grad()
            kp_pred, pm_pred = model(x)
            loss = criterion(kp_pred, kp, pm_pred, pm)
            loss.backward()
            nn.utils.clip_grad_norm_(model.parameters(), max_norm=1.0)
            optimizer.step()
            train_loss += loss.item() * x.size(0)

        train_loss /= len(train_ds)
        scheduler.step()

        # ── Validate ──
        model.eval()
        val_loss = 0.0
        with torch.no_grad():
            for x, kp, pm in val_loader:
                x, kp, pm = x.to(device), kp.to(device), pm.to(device)
                kp_pred, pm_pred = model(x)
                loss = criterion(kp_pred, kp, pm_pred, pm)
                val_loss += loss.item() * x.size(0)

        val_loss /= max(len(val_ds), 1)

        elapsed = time.monotonic() - t0

        if writer:
            writer.add_scalar("loss/train", train_loss, epoch)
            writer.add_scalar("loss/val", val_loss, epoch)
            writer.add_scalar("lr", scheduler.get_last_lr()[0], epoch)

        if epoch % 5 == 0 or epoch == 1:
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
        torch.save(model.state_dict(), output_dir / "latest.pt")

        if val_loss < best_val_loss:
            best_val_loss = val_loss
            patience_counter = 0
            torch.save(model.state_dict(), output_dir / "best.pt")
            logger.info("  ✓ new best val_loss=%.4f — saved best.pt", val_loss)
        else:
            patience_counter += 1

        if patience_counter >= patience:
            logger.info("Early stopping at epoch %d (patience=%d)", epoch, patience)
            break

    if writer:
        writer.close()

    # ── Export to ONNX ──
    model.load_state_dict(torch.load(output_dir / "best.pt", weights_only=True))
    model.to("cpu").eval()

    sample = torch.randn(1, 2, args.window_size, num_subcarriers)
    onnx_path = export_onnx(model, sample, output_dir / "csi_pose_net.onnx")

    logger.info("Training complete — ONNX exported to %s", onnx_path)

    # Save training config
    config = {
        "window_size": args.window_size,
        "num_subcarriers": num_subcarriers,
        "epochs_trained": epoch,
        "best_val_loss": round(best_val_loss, 6),
        "params": count_parameters(model),
        "seed": args.seed,
        "lr": args.lr,
        "batch_size": args.batch_size,
    }
    with open(output_dir / "train_config.json", "w") as f:
        json.dump(config, f, indent=2)

    return onnx_path


# ── CLI ─────────────────────────────────────────────────────────────── #

def main() -> None:
    logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")

    parser = argparse.ArgumentParser(description="Train CsiPoseNet")
    parser.add_argument("--data-dir", type=str, required=True, help="Root data directory")
    parser.add_argument("--epochs", type=int, default=100)
    parser.add_argument("--batch-size", type=int, default=32)
    parser.add_argument("--lr", type=float, default=1e-3)
    parser.add_argument("--window-size", type=int, default=64)
    parser.add_argument("--seed", type=int, default=42)
    parser.add_argument("--output-dir", type=str, default="storage/models")

    args = parser.parse_args()
    train(args)


if __name__ == "__main__":
    main()

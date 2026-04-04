"""
Evaluation script for CsiPoseNet — per-keypoint error and proxy metric MAE.

Usage:
    python -m biomech_ml.evaluate \
        --checkpoint storage/models/best.pt \
        --data-dir data/ \
        --window-size 64 \
        --output evaluation_report.json
"""

from __future__ import annotations

import argparse
import json
import logging
from pathlib import Path

import numpy as np
import torch
from torch.utils.data import DataLoader

from biomech_ml.dataset import CsiDataset
from biomech_ml.model import CsiPoseNet, NUM_KEYPOINTS, KEYPOINT_DIM

logger = logging.getLogger(__name__)

COCO_KEYPOINT_NAMES = [
    "nose", "left_eye", "right_eye", "left_ear", "right_ear",
    "left_shoulder", "right_shoulder", "left_elbow", "right_elbow",
    "left_wrist", "right_wrist", "left_hip", "right_hip",
    "left_knee", "right_knee", "left_ankle", "right_ankle",
]

PROXY_METRIC_NAMES = ["estimatedCadence", "symmetryProxy", "contactTimeProxy"]


def evaluate(args: argparse.Namespace) -> dict:
    """Run evaluation and return a results dict."""

    dataset = CsiDataset(
        args.data_dir,
        window_size=args.window_size,
        split="val",
        seed=42,
    )

    if len(dataset) == 0:
        logger.error("Validation dataset is empty — nothing to evaluate")
        return {"error": "empty_dataset"}

    loader = DataLoader(dataset, batch_size=64, shuffle=False)

    sample_x, _, _ = dataset[0]
    _, _, num_subcarriers = sample_x.shape

    model = CsiPoseNet(num_subcarriers=num_subcarriers, window_size=args.window_size)
    model.load_state_dict(torch.load(args.checkpoint, weights_only=True, map_location="cpu"))
    model.eval()

    all_kp_pred: list[np.ndarray] = []
    all_kp_true: list[np.ndarray] = []
    all_pm_pred: list[np.ndarray] = []
    all_pm_true: list[np.ndarray] = []

    with torch.no_grad():
        for x, kp, pm in loader:
            kp_pred, pm_pred = model(x)
            all_kp_pred.append(kp_pred.numpy())
            all_kp_true.append(kp.numpy())
            all_pm_pred.append(pm_pred.numpy())
            all_pm_true.append(pm.numpy())

    kp_pred = np.concatenate(all_kp_pred)  # (N, 51)
    kp_true = np.concatenate(all_kp_true)
    pm_pred = np.concatenate(all_pm_pred)  # (N, 3)
    pm_true = np.concatenate(all_pm_true)

    # ── Per-keypoint error ──
    kp_pred_r = kp_pred.reshape(-1, NUM_KEYPOINTS, KEYPOINT_DIM)
    kp_true_r = kp_true.reshape(-1, NUM_KEYPOINTS, KEYPOINT_DIM)

    # Euclidean distance on (x, y) per keypoint
    xy_error = np.sqrt(((kp_pred_r[:, :, :2] - kp_true_r[:, :, :2]) ** 2).sum(axis=2))  # (N, 17)
    per_kp_mae = xy_error.mean(axis=0)  # (17,)

    keypoint_results = {}
    for i, name in enumerate(COCO_KEYPOINT_NAMES):
        keypoint_results[name] = {
            "mae": round(float(per_kp_mae[i]), 6),
            "std": round(float(xy_error[:, i].std()), 6),
        }

    overall_kp_mae = float(per_kp_mae.mean())

    # ── Proxy metric MAE ──
    proxy_errors = np.abs(pm_pred - pm_true)  # (N, 3)
    proxy_results = {}
    for i, name in enumerate(PROXY_METRIC_NAMES):
        proxy_results[name] = {
            "mae": round(float(proxy_errors[:, i].mean()), 6),
            "std": round(float(proxy_errors[:, i].std()), 6),
        }

    overall_pm_mae = float(proxy_errors.mean())

    # ── Confidence error ──
    conf_pred = kp_pred_r[:, :, 2]
    conf_true = kp_true_r[:, :, 2]
    conf_mae = float(np.abs(conf_pred - conf_true).mean())

    report = {
        "num_samples": len(kp_pred),
        "keypoints": {
            "overall_mae": round(overall_kp_mae, 6),
            "per_keypoint": keypoint_results,
        },
        "proxy_metrics": {
            "overall_mae": round(overall_pm_mae, 6),
            "per_metric": proxy_results,
        },
        "confidence_mae": round(conf_mae, 6),
        "model_params": {
            "num_subcarriers": num_subcarriers,
            "window_size": args.window_size,
            "checkpoint": str(args.checkpoint),
        },
    }

    # ── Print table ──
    print(f"\n{'=' * 60}")
    print(f"  CsiPoseNet Evaluation — {len(kp_pred)} samples")
    print(f"{'=' * 60}")
    print(f"\n  Keypoint position MAE (normalized coords):")
    print(f"  {'Keypoint':<20} {'MAE':>10} {'Std':>10}")
    print(f"  {'-' * 40}")
    for name in COCO_KEYPOINT_NAMES:
        r = keypoint_results[name]
        print(f"  {name:<20} {r['mae']:>10.4f} {r['std']:>10.4f}")
    print(f"  {'-' * 40}")
    print(f"  {'OVERALL':<20} {overall_kp_mae:>10.4f}")

    print(f"\n  Proxy metric MAE:")
    print(f"  {'Metric':<25} {'MAE':>10} {'Std':>10}")
    print(f"  {'-' * 45}")
    for name in PROXY_METRIC_NAMES:
        r = proxy_results[name]
        print(f"  {name:<25} {r['mae']:>10.4f} {r['std']:>10.4f}")
    print(f"  {'-' * 45}")
    print(f"  {'OVERALL':<25} {overall_pm_mae:>10.4f}")

    print(f"\n  Confidence MAE: {conf_mae:.4f}")
    print(f"{'=' * 60}\n")

    # ── Save ──
    if args.output:
        out_path = Path(args.output)
        out_path.parent.mkdir(parents=True, exist_ok=True)
        with open(out_path, "w") as f:
            json.dump(report, f, indent=2)
        logger.info("Evaluation report saved to %s", out_path)

    return report


# ── CLI ─────────────────────────────────────────────────────────────── #

def main() -> None:
    logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")

    parser = argparse.ArgumentParser(description="Evaluate CsiPoseNet")
    parser.add_argument("--checkpoint", type=str, required=True, help="Path to model .pt checkpoint")
    parser.add_argument("--data-dir", type=str, required=True, help="Root data directory")
    parser.add_argument("--window-size", type=int, default=64)
    parser.add_argument("--output", type=str, default="evaluation_report.json", help="Output JSON path")

    args = parser.parse_args()
    evaluate(args)


if __name__ == "__main__":
    main()

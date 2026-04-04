"""
Model quantization for ESP32 edge inference.

Provides post-training quantization at 8-bit, 4-bit, and 2-bit precision
for the contrastive encoder, targeting ESP32-S3 SRAM constraints.

All quantized models are EXPERIMENTAL. The quantization process is lossy —
validate downstream task accuracy after quantization.

Target sizes:
    - Full encoder safetensors: ~48 KB
    - INT8 quantized: ~12 KB
    - INT4 quantized: ~8 KB (target for ESP32-S3 SRAM)
    - INT2 quantized: ~4 KB (ultra-compact, significant accuracy loss expected)
"""

from __future__ import annotations

import hashlib
import json
import logging
import struct
from pathlib import Path

import numpy as np
import torch
import torch.nn as nn

logger = logging.getLogger(__name__)

QUANTIZE_VERSION = "0.1.0"


# ── INT8 quantization ──────────────────────────────────────────────── #

def quantize_to_int8(
    model: nn.Module,
    calibration_data: torch.Tensor | None = None,
) -> bytes:
    """Post-training static quantization → 8-bit weights.

    Uses per-tensor symmetric quantization:
        q = round(w / scale)  where scale = max(|w|) / 127

    Args:
        model: the encoder to quantize
        calibration_data: optional calibration input (used for activation range estimation)

    Returns:
        Raw bytes of quantized weights with scales.
    """
    model.eval()
    output = bytearray()

    for name, param in model.named_parameters():
        w = param.data.cpu().float().numpy()
        scale = np.abs(w).max() / 127.0
        if scale < 1e-10:
            scale = 1e-10

        q = np.clip(np.round(w / scale), -128, 127).astype(np.int8)

        # Pack: name_len (u16) | name (utf8) | scale (f32) | numel (u32) | quantized weights
        name_bytes = name.encode("utf-8")
        output.extend(struct.pack("<H", len(name_bytes)))
        output.extend(name_bytes)
        output.extend(struct.pack("<f", scale))
        output.extend(struct.pack("<I", q.size))
        output.extend(q.tobytes())

    logger.info("INT8 quantization: %d bytes (%.1f KB)", len(output), len(output) / 1024)
    return bytes(output)


# ── INT4 quantization ──────────────────────────────────────────────── #

def quantize_to_int4(
    model: nn.Module,
    calibration_data: torch.Tensor | None = None,
    group_size: int = 32,
) -> bytes:
    """4-bit quantization using round-to-nearest with grouping.

    Groups weights into blocks of `group_size` and quantizes each block
    independently for better accuracy. Packs two 4-bit values per byte.

    Target: ~8 KB for ESP32-S3 SRAM.

    Args:
        model: the encoder to quantize
        calibration_data: optional (unused for weight-only quantization)
        group_size: number of weights per quantization group

    Returns:
        Raw bytes of quantized weights with per-group scales.
    """
    model.eval()
    output = bytearray()

    for name, param in model.named_parameters():
        w = param.data.cpu().float().numpy().flatten()
        n = len(w)

        # Pad to group_size multiple
        padded_n = ((n + group_size - 1) // group_size) * group_size
        w_padded = np.zeros(padded_n, dtype=np.float32)
        w_padded[:n] = w

        name_bytes = name.encode("utf-8")
        output.extend(struct.pack("<H", len(name_bytes)))
        output.extend(name_bytes)
        output.extend(struct.pack("<I", n))  # original numel
        output.extend(struct.pack("<I", group_size))

        num_groups = padded_n // group_size
        output.extend(struct.pack("<I", num_groups))

        for g in range(num_groups):
            group = w_padded[g * group_size : (g + 1) * group_size]
            scale = np.abs(group).max() / 7.0
            if scale < 1e-10:
                scale = 1e-10

            # Quantize to [-8, 7] range (4-bit signed)
            q = np.clip(np.round(group / scale), -8, 7).astype(np.int8)

            output.extend(struct.pack("<f", scale))

            # Pack two 4-bit values per byte
            packed = bytearray()
            for i in range(0, len(q), 2):
                lo = q[i] & 0x0F
                hi = (q[i + 1] & 0x0F) << 4 if i + 1 < len(q) else 0
                packed.append(lo | hi)
            output.extend(packed)

    logger.info("INT4 quantization: %d bytes (%.1f KB)", len(output), len(output) / 1024)
    return bytes(output)


# ── INT2 quantization ──────────────────────────────────────────────── #

def quantize_to_int2(model: nn.Module) -> bytes:
    """2-bit ultra-compact quantization for memory-constrained devices.

    Maps weights to {-1, 0, 0, 1} (ternary-like with 2-bit encoding).
    Significant accuracy loss expected — use only when memory is extremely limited.

    Target: ~4 KB.

    Args:
        model: the encoder to quantize

    Returns:
        Raw bytes of quantized weights with scales.
    """
    model.eval()
    output = bytearray()

    for name, param in model.named_parameters():
        w = param.data.cpu().float().numpy().flatten()
        n = len(w)
        scale = np.abs(w).max()
        if scale < 1e-10:
            scale = 1e-10

        # Normalize to [-1, 1] and map to 2-bit: 0b00=-1, 0b01=0, 0b10=0, 0b11=1
        w_norm = w / scale
        q = np.zeros(n, dtype=np.uint8)
        q[w_norm > 0.33] = 3   # +1
        q[w_norm < -0.33] = 0  # -1
        q[(w_norm >= -0.33) & (w_norm <= 0.33)] = 1  # 0

        name_bytes = name.encode("utf-8")
        output.extend(struct.pack("<H", len(name_bytes)))
        output.extend(name_bytes)
        output.extend(struct.pack("<f", scale))
        output.extend(struct.pack("<I", n))

        # Pack four 2-bit values per byte
        packed = bytearray()
        for i in range(0, n, 4):
            byte_val = 0
            for j in range(4):
                if i + j < n:
                    byte_val |= (q[i + j] & 0x03) << (j * 2)
            packed.append(byte_val)
        output.extend(packed)

    logger.info("INT2 quantization: %d bytes (%.1f KB)", len(output), len(output) / 1024)
    return bytes(output)


# ── Export ──────────────────────────────────────────────────────────── #

def export_quantized_binary(
    quantized_weights: bytes,
    path: str | Path,
    format: str = "bin",
    model_hash: str | None = None,
    bits: int = 8,
) -> Path:
    """Export quantized weights as raw binary for C firmware loading.

    Also writes a companion .json metadata file.

    Args:
        quantized_weights: raw bytes from quantize_to_int*
        path: destination file (without extension forced)
        format: output format ('bin' only currently)
        model_hash: hash of the original model for provenance tracking
        bits: quantization bit width (8, 4, or 2)

    Returns:
        Path to written binary file.
    """
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)

    bin_path = path.with_suffix(".bin")
    with open(bin_path, "wb") as f:
        f.write(quantized_weights)

    # Write metadata
    meta = {
        "version": QUANTIZE_VERSION,
        "bits": bits,
        "size_bytes": len(quantized_weights),
        "size_kb": round(len(quantized_weights) / 1024, 2),
        "format": format,
        "original_model_hash": model_hash or "unknown",
        "experimental": True,
        "validation_status": "unvalidated",
    }
    meta_path = path.with_suffix(".meta.json")
    with open(meta_path, "w") as f:
        json.dump(meta, f, indent=2)

    logger.info(
        "Quantized binary exported: %s (%.1f KB, %d-bit)",
        bin_path,
        len(quantized_weights) / 1024,
        bits,
    )
    return bin_path


def compute_model_hash(model: nn.Module) -> str:
    """Compute SHA-256 hash of model weights for provenance tracking."""
    hasher = hashlib.sha256()
    for param in model.parameters():
        hasher.update(param.data.cpu().numpy().tobytes())
    return hasher.hexdigest()[:16]


# ── CLI ─────────────────────────────────────────────────────────────── #

def main() -> None:
    """CLI for quantizing a trained encoder."""
    import argparse

    logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")

    parser = argparse.ArgumentParser(description="Quantize contrastive encoder for ESP32")
    parser.add_argument("--model", type=str, required=True, help="Path to encoder .pt file")
    parser.add_argument(
        "--output", type=str, default="storage/models/", help="Output directory"
    )
    parser.add_argument(
        "--bits", type=int, nargs="+", default=[8, 4, 2], help="Bit widths to export"
    )
    args = parser.parse_args()

    from biomech_ml.contrastive import CsiContrastiveEncoder

    encoder = CsiContrastiveEncoder()
    encoder.load_state_dict(torch.load(args.model, weights_only=True))
    encoder.eval()

    model_hash = compute_model_hash(encoder)
    output_dir = Path(args.output)

    for bits in args.bits:
        if bits == 8:
            q = quantize_to_int8(encoder)
        elif bits == 4:
            q = quantize_to_int4(encoder)
        elif bits == 2:
            q = quantize_to_int2(encoder)
        else:
            logger.warning("Unsupported bit width: %d — skipping", bits)
            continue

        export_quantized_binary(
            q,
            output_dir / f"biomech-encoder-int{bits}",
            model_hash=model_hash,
            bits=bits,
        )


if __name__ == "__main__":
    main()

"""
Benchmark inference speed for contrastive encoder + task heads.

Usage:
    python -m biomech_ml.benchmark \
        --model storage/models/biomech-encoder.pt \
        --iterations 10000

    python -m biomech_ml.benchmark \
        --model storage/models/biomech-encoder.safetensors \
        --format safetensors \
        --iterations 10000

Output:
    Inference speed: X.XXX ms per embedding
    Throughput: XXX,XXX embeddings/sec
    Model size: XX KB
    Encoder params: XXX,XXX
"""

from __future__ import annotations

import argparse
import logging
import time
from pathlib import Path

import torch

logger = logging.getLogger(__name__)


def benchmark_encoder(
    encoder: torch.nn.Module,
    num_subcarriers: int = 64,
    window_size: int = 64,
    iterations: int = 10_000,
    batch_size: int = 1,
    device: str = "cpu",
) -> dict:
    """Benchmark encoder forward pass speed.

    Args:
        encoder: the encoder model
        num_subcarriers: subcarrier count for dummy input
        window_size: window size for dummy input
        iterations: number of forward passes
        batch_size: batch size per iteration
        device: 'cpu' or 'cuda'

    Returns:
        Dict with timing and throughput stats.
    """
    encoder = encoder.to(device).eval()
    dummy = torch.randn(batch_size, 2, window_size, num_subcarriers, device=device)

    # Warmup
    with torch.no_grad():
        for _ in range(min(100, iterations)):
            encoder(dummy)

    # Benchmark
    if device == "cuda":
        torch.cuda.synchronize()

    start = time.perf_counter()
    with torch.no_grad():
        for _ in range(iterations):
            encoder(dummy)

    if device == "cuda":
        torch.cuda.synchronize()

    elapsed = time.perf_counter() - start
    total_samples = iterations * batch_size

    return {
        "iterations": iterations,
        "batch_size": batch_size,
        "total_samples": total_samples,
        "total_time_s": round(elapsed, 3),
        "ms_per_embedding": round((elapsed / total_samples) * 1000, 4),
        "throughput_per_sec": round(total_samples / elapsed, 1),
        "device": device,
    }


def benchmark_heads(
    heads: dict[str, torch.nn.Module],
    embedding_dim: int = 128,
    iterations: int = 10_000,
    device: str = "cpu",
) -> dict[str, dict]:
    """Benchmark each head's forward pass speed.

    Args:
        heads: dict of {name: head_module}
        embedding_dim: input embedding dimension
        iterations: number of forward passes per head
        device: 'cpu' or 'cuda'

    Returns:
        Dict of {name: timing_stats}.
    """
    dummy = torch.randn(1, embedding_dim, device=device)
    results = {}

    for name, head in heads.items():
        head = head.to(device).eval()

        # Warmup
        with torch.no_grad():
            for _ in range(min(50, iterations)):
                head(dummy)

        start = time.perf_counter()
        with torch.no_grad():
            for _ in range(iterations):
                head(dummy)
        elapsed = time.perf_counter() - start

        results[name] = {
            "iterations": iterations,
            "total_time_s": round(elapsed, 3),
            "ms_per_inference": round((elapsed / iterations) * 1000, 4),
            "throughput_per_sec": round(iterations / elapsed, 1),
        }

    return results


def main() -> None:
    logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")

    parser = argparse.ArgumentParser(description="Benchmark biomechanics inference speed")
    parser.add_argument("--model", type=str, required=True, help="Path to encoder (.pt or .safetensors)")
    parser.add_argument("--format", type=str, default="pt", choices=["pt", "safetensors"])
    parser.add_argument("--iterations", type=int, default=10_000)
    parser.add_argument("--batch-size", type=int, default=1)
    parser.add_argument("--window-size", type=int, default=64)
    parser.add_argument("--num-subcarriers", type=int, default=64)
    parser.add_argument("--device", type=str, default="cpu")
    parser.add_argument("--benchmark-heads", action="store_true", help="Also benchmark task heads")
    args = parser.parse_args()

    from biomech_ml.contrastive import CsiContrastiveEncoder, count_encoder_parameters

    encoder = CsiContrastiveEncoder(
        num_subcarriers=args.num_subcarriers,
        window_size=args.window_size,
    )

    model_path = Path(args.model)
    if args.format == "safetensors":
        from safetensors.torch import load_file
        state_dict = load_file(str(model_path))
    else:
        state_dict = torch.load(str(model_path), weights_only=True)

    encoder.load_state_dict(state_dict)
    encoder.eval()

    param_count = count_encoder_parameters(encoder)
    model_size_kb = model_path.stat().st_size / 1024

    print(f"\n{'=' * 60}")
    print(f"Biomechanics Encoder Benchmark")
    print(f"{'=' * 60}")
    print(f"Model: {model_path.name}")
    print(f"Model size: {model_size_kb:.1f} KB")
    print(f"Encoder params: {param_count:,}")
    print(f"Device: {args.device}")
    print(f"Window: {args.window_size} × {args.num_subcarriers}")
    print(f"Batch size: {args.batch_size}")
    print(f"Iterations: {args.iterations:,}")
    print()

    results = benchmark_encoder(
        encoder,
        num_subcarriers=args.num_subcarriers,
        window_size=args.window_size,
        iterations=args.iterations,
        batch_size=args.batch_size,
        device=args.device,
    )

    print(f"Encoder Inference:")
    print(f"  Speed: {results['ms_per_embedding']:.4f} ms per embedding")
    print(f"  Throughput: {results['throughput_per_sec']:,.0f} embeddings/sec")
    print(f"  Total time: {results['total_time_s']:.3f}s for {results['total_samples']:,} samples")

    if args.benchmark_heads:
        from biomech_ml.heads import (
            CadenceHead,
            SymmetryHead,
            ContactTimeHead,
            PresenceHead,
            ActivityHead,
        )

        heads = {
            "cadence": CadenceHead(),
            "symmetry": SymmetryHead(),
            "contact_time": ContactTimeHead(),
            "presence": PresenceHead(),
            "activity": ActivityHead(),
        }

        print(f"\nTask Heads:")
        head_results = benchmark_heads(heads, iterations=args.iterations, device=args.device)
        for name, stats in head_results.items():
            print(f"  {name}: {stats['ms_per_inference']:.4f} ms ({stats['throughput_per_sec']:,.0f}/sec)")

    print(f"\n{'=' * 60}")
    print("NOTE: All models are EXPERIMENTAL. Validate before production use.")
    print(f"{'=' * 60}\n")


if __name__ == "__main__":
    main()

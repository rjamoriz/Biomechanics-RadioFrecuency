"""
HuggingFace Hub integration — download and manage pre-trained biomechanics CSI models.

Provides a local model registry that:
    - Downloads encoder + heads from HuggingFace Hub (with caching)
    - Falls back to local cache when offline
    - Manages model versioning and metadata
    - Loads encoder, heads, and station adapters

All downloaded models are EXPERIMENTAL unless explicitly marked otherwise.
"""

from __future__ import annotations

import json
import logging
from pathlib import Path

import torch

logger = logging.getLogger(__name__)

MODEL_REPO = "rjamoriz/biomech-csi"
DEFAULT_CACHE_DIR = "storage/models"

# Expected files in the HuggingFace repo
REPO_FILES = {
    "encoder": "biomech-encoder.safetensors",
    "encoder_config": "encoder-config.json",
    "cadence_head": "cadence-head.json",
    "symmetry_head": "symmetry-head.json",
    "contact_time_head": "contact-time-head.json",
    "presence_head": "presence-head.json",
    "activity_head": "activity-head.json",
}


class ModelRegistry:
    """Manages local model cache and HuggingFace sync.

    The registry scans a local directory for model files and provides
    convenience methods to load encoders, heads, and station adapters.

    Args:
        cache_dir: local directory for storing/caching models (default: storage/models)
    """

    def __init__(self, cache_dir: str = DEFAULT_CACHE_DIR) -> None:
        self.cache_dir = Path(cache_dir)
        self.cache_dir.mkdir(parents=True, exist_ok=True)

    def download_pretrained(
        self,
        repo_id: str = MODEL_REPO,
        revision: str = "main",
    ) -> Path:
        """Download encoder + heads from HuggingFace Hub.

        Uses huggingface_hub library. Falls back to local cache if offline.

        Args:
            repo_id: HuggingFace repository ID
            revision: git revision (branch, tag, or commit)

        Returns:
            Path to the local cache directory containing downloaded files.
        """
        try:
            from huggingface_hub import snapshot_download

            local_dir = snapshot_download(
                repo_id=repo_id,
                revision=revision,
                local_dir=str(self.cache_dir / repo_id.replace("/", "_")),
                local_dir_use_symlinks=False,
            )

            logger.info("Models downloaded from %s to %s", repo_id, local_dir)
            return Path(local_dir)

        except ImportError:
            logger.error(
                "huggingface_hub not installed — run: pip install huggingface_hub"
            )
            raise

        except Exception as e:
            # Offline fallback: check local cache
            cached = self.cache_dir / repo_id.replace("/", "_")
            if cached.exists():
                logger.warning(
                    "Failed to download from %s (%s) — using local cache at %s",
                    repo_id,
                    e,
                    cached,
                )
                return cached
            raise RuntimeError(
                f"Cannot download models from {repo_id} and no local cache found: {e}"
            ) from e

    def list_local_models(self) -> list[dict]:
        """List models in local cache with metadata.

        Scans cache_dir for known model files and returns a summary.

        Returns:
            List of dicts with keys: name, path, type, size_kb, experimental.
        """
        models = []

        for path in sorted(self.cache_dir.rglob("*")):
            if path.is_dir():
                continue

            entry = {
                "name": path.name,
                "path": str(path),
                "size_kb": round(path.stat().st_size / 1024, 2),
                "experimental": True,
            }

            if path.suffix == ".safetensors":
                entry["type"] = "encoder"
            elif path.suffix == ".onnx":
                entry["type"] = "onnx_model"
            elif path.suffix == ".json" and "head" in path.name:
                entry["type"] = "head"
            elif path.suffix == ".json" and "adapter" in path.name:
                entry["type"] = "station_adapter"
            elif path.suffix == ".bin":
                entry["type"] = "quantized"
            elif path.suffix == ".pt":
                entry["type"] = "pytorch_checkpoint"
            else:
                continue  # skip unknown files

            # Try to read metadata
            meta_path = path.with_suffix(".meta.json")
            if meta_path.exists():
                try:
                    with open(meta_path) as f:
                        entry["metadata"] = json.load(f)
                except json.JSONDecodeError:
                    pass

            models.append(entry)

        return models

    def load_encoder(
        self,
        path: Path | None = None,
        *,
        num_subcarriers: int = 64,
        window_size: int = 64,
        d_model: int = 64,
    ) -> "CsiContrastiveEncoder":
        """Load encoder from safetensors file.

        Args:
            path: explicit path to .safetensors file.
                  If None, searches cache_dir for biomech-encoder.safetensors.
            num_subcarriers: architecture param for reconstruction
            window_size: architecture param for reconstruction
            d_model: architecture param for reconstruction

        Returns:
            CsiContrastiveEncoder in eval mode.
        """
        from biomech_ml.contrastive import load_encoder_safetensors

        if path is None:
            path = self._find_file("biomech-encoder.safetensors")
            if path is None:
                raise FileNotFoundError(
                    "No encoder found in cache. Run download_pretrained() first."
                )

        return load_encoder_safetensors(
            str(path),
            num_subcarriers=num_subcarriers,
            window_size=window_size,
            d_model=d_model,
        )

    def load_head(self, head_type: str, path: Path | None = None) -> "GaitHead":
        """Load a task head from JSON file.

        Args:
            head_type: one of cadence, symmetry, contact_time, presence, activity
            path: explicit path. If None, searches cache for {head_type}-head.json.

        Returns:
            GaitHead subclass in eval mode.
        """
        from biomech_ml.heads import load_head_json

        if path is None:
            filename = f"{head_type.replace('_', '-')}-head.json"
            path = self._find_file(filename)
            if path is None:
                raise FileNotFoundError(
                    f"No '{head_type}' head found in cache. "
                    "Run download_pretrained() first."
                )

        return load_head_json(path)

    def load_station_adapter(
        self,
        station_id: str,
        encoder: "nn.Module | None" = None,
    ) -> "StationAdapter":
        """Load station-specific LoRA adapter.

        Args:
            station_id: station identifier (used to find {station_id}-adapter.json)
            encoder: optional encoder to wrap with LoRA. If None, loads default.

        Returns:
            StationAdapter with loaded weights.
        """
        from biomech_ml.lora import LoRAAdapter, StationAdapter

        adapter_file = self._find_file(f"{station_id}-adapter.json")
        if adapter_file is None:
            raise FileNotFoundError(
                f"No adapter found for station '{station_id}' in {self.cache_dir}"
            )

        if encoder is None:
            encoder = self.load_encoder()

        lora = LoRAAdapter(encoder)
        return StationAdapter.load_json(adapter_file, lora)

    def _find_file(self, filename: str) -> Path | None:
        """Recursively search cache_dir for a file by name."""
        for path in self.cache_dir.rglob(filename):
            return path
        return None


# ── CLI ─────────────────────────────────────────────────────────────── #

def main() -> None:
    """CLI for model hub operations."""
    import argparse

    logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")

    parser = argparse.ArgumentParser(description="Biomechanics model hub")
    sub = parser.add_subparsers(dest="command")

    # download
    dl = sub.add_parser("download", help="Download pre-trained models from HuggingFace")
    dl.add_argument("--repo", type=str, default=MODEL_REPO, help="HuggingFace repo ID")
    dl.add_argument("--local-dir", type=str, default=DEFAULT_CACHE_DIR, help="Local cache dir")
    dl.add_argument("--revision", type=str, default="main")

    # list
    sub.add_parser("list", help="List local models")

    args = parser.parse_args()
    registry = ModelRegistry(
        cache_dir=getattr(args, "local_dir", DEFAULT_CACHE_DIR),
    )

    if args.command == "download":
        registry.download_pretrained(repo_id=args.repo, revision=args.revision)
    elif args.command == "list":
        models = registry.list_local_models()
        if not models:
            print("No models found in cache.")
        for m in models:
            print(f"  [{m['type']}] {m['name']} — {m['size_kb']} KB")
    else:
        parser.print_help()


if __name__ == "__main__":
    main()

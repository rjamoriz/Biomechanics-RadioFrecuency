"""
LoRA (Low-Rank Adaptation) for station-specific fine-tuning.

Allows per-station calibration of the contrastive encoder without full retraining.
Each station gets a small adapter (~1-5 KB) that adjusts the frozen encoder's behavior
for its specific placement, environment, and treadmill characteristics.

All adapter outputs are EXPERIMENTAL and must carry station_id + calibration metadata.
"""

from __future__ import annotations

import base64
import io
import json
import logging
import math
from datetime import datetime, timezone
from pathlib import Path

import torch
import torch.nn as nn

logger = logging.getLogger(__name__)

LORA_VERSION = "0.1.0"


class LoRALinear(nn.Module):
    """Low-Rank Adaptation wrapper for a frozen Linear layer.

    Adds trainable low-rank matrices A and B such that:
        h = W_frozen · x + α · (B · A · x)

    where:
        A: (rank, in_features) — down-projection
        B: (out_features, rank) — up-projection
        α: scaling factor = alpha / rank

    Only A and B are trainable. The original weight W remains frozen.

    Args:
        original: the frozen nn.Linear layer to adapt
        rank: rank of the low-rank decomposition (default 4)
        alpha: scaling factor (default 1.0)
    """

    def __init__(self, original: nn.Linear, rank: int = 4, alpha: float = 1.0) -> None:
        super().__init__()
        self.original = original
        self.rank = rank
        self.alpha = alpha
        self.scaling = alpha / rank

        in_features = original.in_features
        out_features = original.out_features

        # Freeze original weights
        self.original.weight.requires_grad_(False)
        if self.original.bias is not None:
            self.original.bias.requires_grad_(False)

        # Low-rank trainable matrices
        self.lora_A = nn.Parameter(torch.empty(rank, in_features))
        self.lora_B = nn.Parameter(torch.zeros(out_features, rank))

        # Kaiming init for A, zero init for B (so adapter starts as identity)
        nn.init.kaiming_uniform_(self.lora_A, a=math.sqrt(5))

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        # Original frozen forward
        h = self.original(x)
        # LoRA delta: B @ A @ x, scaled
        delta = (x @ self.lora_A.t()) @ self.lora_B.t()
        return h + self.scaling * delta

    def trainable_parameters(self) -> int:
        """Count of trainable params (A + B only)."""
        return self.lora_A.numel() + self.lora_B.numel()


class LoRAAdapter(nn.Module):
    """Applies LoRA adapters to selected layers of a contrastive encoder.

    Wraps specified Linear layers with LoRALinear, freezing all original parameters
    and only training the low-rank A/B matrices.

    Args:
        encoder: the CsiContrastiveEncoder to adapt
        rank: LoRA rank (default 4)
        alpha: LoRA scaling (default 1.0)
        target_layers: list of layer name patterns to adapt (default: projection layers)
    """

    def __init__(
        self,
        encoder: nn.Module,
        rank: int = 4,
        alpha: float = 1.0,
        target_layers: list[str] | None = None,
    ) -> None:
        super().__init__()
        self.encoder = encoder
        self.rank = rank
        self.alpha = alpha
        self.lora_layers: dict[str, LoRALinear] = {}

        if target_layers is None:
            target_layers = ["projection"]

        # Freeze all encoder parameters
        for param in self.encoder.parameters():
            param.requires_grad_(False)

        # Replace matching Linear layers with LoRA wrappers
        self._apply_lora(target_layers)

    def _apply_lora(self, target_patterns: list[str]) -> None:
        """Find and wrap Linear layers matching target patterns."""
        for name, module in self.encoder.named_modules():
            if not any(pat in name for pat in target_patterns):
                continue
            if isinstance(module, nn.Linear):
                lora_layer = LoRALinear(module, rank=self.rank, alpha=self.alpha)
                self.lora_layers[name] = lora_layer
                # Replace in parent module
                self._replace_module(name, lora_layer)
                logger.info(
                    "LoRA applied to %s (%d trainable params)",
                    name,
                    lora_layer.trainable_parameters(),
                )

    def _replace_module(self, full_name: str, new_module: nn.Module) -> None:
        """Replace a named module in the encoder."""
        parts = full_name.split(".")
        parent = self.encoder
        for part in parts[:-1]:
            if part.isdigit():
                parent = parent[int(part)]
            else:
                parent = getattr(parent, part)
        last = parts[-1]
        if last.isdigit():
            parent[int(last)] = new_module
        else:
            setattr(parent, last, new_module)

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        """Forward through the adapted encoder."""
        return self.encoder(x)

    def trainable_parameters(self) -> int:
        """Total trainable parameter count across all LoRA layers."""
        return sum(lora.trainable_parameters() for lora in self.lora_layers.values())

    def get_lora_state_dict(self) -> dict[str, torch.Tensor]:
        """Extract only the LoRA adapter weights (not the frozen encoder)."""
        state = {}
        for name, lora in self.lora_layers.items():
            state[f"{name}.lora_A"] = lora.lora_A.data.clone()
            state[f"{name}.lora_B"] = lora.lora_B.data.clone()
        return state

    def load_lora_state_dict(self, state: dict[str, torch.Tensor]) -> None:
        """Load LoRA adapter weights."""
        for name, lora in self.lora_layers.items():
            a_key = f"{name}.lora_A"
            b_key = f"{name}.lora_B"
            if a_key in state:
                lora.lora_A.data.copy_(state[a_key])
            if b_key in state:
                lora.lora_B.data.copy_(state[b_key])


class StationAdapter:
    """Manages a LoRA adapter for a specific treadmill station.

    Includes station metadata: station_id, calibration date, environment info.
    Serializable to JSON for portability.

    Args:
        station_id: unique identifier for the station
        adapter: the LoRA adapter wrapping the encoder
        calibration_date: when the adapter was calibrated
        notes: optional calibration notes
    """

    def __init__(
        self,
        station_id: str,
        adapter: LoRAAdapter,
        calibration_date: str | None = None,
        notes: str = "",
    ) -> None:
        self.station_id = station_id
        self.adapter = adapter
        self.calibration_date = calibration_date or datetime.now(timezone.utc).isoformat()
        self.notes = notes

    def save_json(self, path: str | Path) -> None:
        """Save station adapter to JSON.

        Format:
        {
            "station_id": "station-001",
            "version": "0.1.0",
            "rank": 4,
            "alpha": 1.0,
            "calibration_date": "2026-04-05T...",
            "notes": "...",
            "adapter_weights": "base64-encoded",
            "experimental": true,
            "validation_status": "station_validated"
        }
        """
        path = Path(path)
        path.parent.mkdir(parents=True, exist_ok=True)

        # Serialize LoRA weights to base64
        state = self.adapter.get_lora_state_dict()
        buffer = io.BytesIO()
        torch.save(state, buffer)
        weights_b64 = base64.b64encode(buffer.getvalue()).decode("ascii")

        payload = {
            "station_id": self.station_id,
            "version": LORA_VERSION,
            "rank": self.adapter.rank,
            "alpha": self.adapter.alpha,
            "calibration_date": self.calibration_date,
            "notes": self.notes,
            "adapter_weights": weights_b64,
            "experimental": True,
            "validation_status": "station_validated",
        }

        with open(path, "w") as f:
            json.dump(payload, f, indent=2)

        logger.info("Station adapter '%s' saved to %s", self.station_id, path)

    @classmethod
    def load_json(cls, path: str | Path, adapter: LoRAAdapter) -> "StationAdapter":
        """Load station adapter from JSON.

        Args:
            path: source JSON file
            adapter: a LoRAAdapter with matching architecture to load weights into

        Returns:
            StationAdapter with loaded weights.
        """
        path = Path(path)
        with open(path) as f:
            payload = json.load(f)

        # Decode and load weights
        weights_bytes = base64.b64decode(payload["adapter_weights"])
        buffer = io.BytesIO(weights_bytes)
        state = torch.load(buffer, weights_only=True)
        adapter.load_lora_state_dict(state)

        instance = cls(
            station_id=payload["station_id"],
            adapter=adapter,
            calibration_date=payload.get("calibration_date"),
            notes=payload.get("notes", ""),
        )

        logger.info(
            "Station adapter '%s' loaded from %s (calibrated %s)",
            instance.station_id,
            path,
            instance.calibration_date,
        )
        return instance

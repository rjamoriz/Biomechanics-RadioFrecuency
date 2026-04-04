"""
Task-specific heads for gait biomechanics — lightweight classifiers/regressors
that operate on frozen contrastive encoder embeddings (128-dim).

Each head is a small MLP (typically < 10K params) that can be serialized to
a compact JSON format for portability and edge deployment.

All outputs are EXPERIMENTAL proxy estimates. Every head includes confidence in its output.
"""

from __future__ import annotations

import base64
import io
import json
import logging
from abc import ABC, abstractmethod
from pathlib import Path

import torch
import torch.nn as nn

from biomech_ml.contrastive import EMBEDDING_DIM

logger = logging.getLogger(__name__)

HEAD_VERSION = "0.1.0"


# ── Base class ──────────────────────────────────────────────────────── #

class GaitHead(nn.Module, ABC):
    """Base class for task heads on top of contrastive embeddings.

    All heads operate on 128-dim input and produce a predictive output plus
    an estimated confidence value (0–1) derived from output magnitude/variance.
    """

    head_type: str = "base"

    def __init__(self, input_dim: int = EMBEDDING_DIM) -> None:
        super().__init__()
        self.input_dim = input_dim

    @abstractmethod
    def forward(self, embedding: torch.Tensor) -> torch.Tensor:
        """
        Args:
            embedding: (B, 128) — L2-normalized embeddings from contrastive encoder.
        Returns:
            (B, output_dim) — task-specific predictions.
        """

    def predict_with_confidence(
        self, embedding: torch.Tensor,
    ) -> dict[str, torch.Tensor]:
        """Run inference and return prediction + confidence estimate.

        Confidence is derived from the magnitude of the pre-activation logits
        (higher magnitude → higher confidence). This is an approximation.

        Returns:
            {"prediction": (B, out), "confidence": (B, 1)}
        """
        self.eval()
        with torch.no_grad():
            pred = self.forward(embedding)
            # Simple confidence heuristic: normalized magnitude
            conf = torch.sigmoid(pred.abs().mean(dim=-1, keepdim=True))
        return {"prediction": pred, "confidence": conf}


# ── Concrete heads ──────────────────────────────────────────────────── #

class CadenceHead(GaitHead):
    """128-dim → 1 (estimated steps per minute).

    Output range: unbounded float (expected ~120-220 SPM for running).
    This is an EXPERIMENTAL proxy estimate.
    """

    head_type = "cadence"

    def __init__(self, input_dim: int = EMBEDDING_DIM) -> None:
        super().__init__(input_dim)
        self.net = nn.Sequential(
            nn.Linear(input_dim, 64),
            nn.ReLU(inplace=True),
            nn.Linear(64, 1),
        )

    def forward(self, embedding: torch.Tensor) -> torch.Tensor:
        return self.net(embedding)


class SymmetryHead(GaitHead):
    """128-dim → 1 (symmetry proxy, 0-1 ratio).

    Output: sigmoid-bounded (0, 1). 1 = perfectly symmetric stride.
    This is an EXPERIMENTAL proxy estimate.
    """

    head_type = "symmetry"

    def __init__(self, input_dim: int = EMBEDDING_DIM) -> None:
        super().__init__(input_dim)
        self.net = nn.Sequential(
            nn.Linear(input_dim, 64),
            nn.ReLU(inplace=True),
            nn.Linear(64, 1),
            nn.Sigmoid(),
        )

    def forward(self, embedding: torch.Tensor) -> torch.Tensor:
        return self.net(embedding)


class ContactTimeHead(GaitHead):
    """128-dim → 1 (ground contact-time proxy, 0-1 ratio).

    Output: sigmoid-bounded (0, 1).
    This is an EXPERIMENTAL proxy estimate.
    """

    head_type = "contact_time"

    def __init__(self, input_dim: int = EMBEDDING_DIM) -> None:
        super().__init__(input_dim)
        self.net = nn.Sequential(
            nn.Linear(input_dim, 64),
            nn.ReLU(inplace=True),
            nn.Linear(64, 1),
            nn.Sigmoid(),
        )

    def forward(self, embedding: torch.Tensor) -> torch.Tensor:
        return self.net(embedding)


class PresenceHead(GaitHead):
    """128-dim → 1 (treadmill-presence probability).

    Output: sigmoid-bounded (0, 1). > 0.5 = person detected on treadmill.
    This is an EXPERIMENTAL estimate.
    """

    head_type = "presence"

    def __init__(self, input_dim: int = EMBEDDING_DIM) -> None:
        super().__init__(input_dim)
        self.net = nn.Sequential(
            nn.Linear(input_dim, 32),
            nn.ReLU(inplace=True),
            nn.Linear(32, 1),
            nn.Sigmoid(),
        )

    def forward(self, embedding: torch.Tensor) -> torch.Tensor:
        return self.net(embedding)


class ActivityHead(GaitHead):
    """128-dim → N classes (activity classification).

    Classes: stationary, walking, running, sprinting.
    Output: (B, 4) raw logits — use softmax for probabilities.
    This is an EXPERIMENTAL estimate.
    """

    head_type = "activity"
    ACTIVITIES = ["stationary", "walking", "running", "sprinting"]

    def __init__(self, input_dim: int = EMBEDDING_DIM, num_classes: int = 4) -> None:
        super().__init__(input_dim)
        self.num_classes = num_classes
        self.net = nn.Sequential(
            nn.Linear(input_dim, 64),
            nn.ReLU(inplace=True),
            nn.Dropout(0.1),
            nn.Linear(64, num_classes),
        )

    def forward(self, embedding: torch.Tensor) -> torch.Tensor:
        return self.net(embedding)


# ── Head registry ───────────────────────────────────────────────────── #

HEAD_REGISTRY: dict[str, type[GaitHead]] = {
    "cadence": CadenceHead,
    "symmetry": SymmetryHead,
    "contact_time": ContactTimeHead,
    "presence": PresenceHead,
    "activity": ActivityHead,
}


def create_head(head_type: str, **kwargs) -> GaitHead:
    """Instantiate a head by type name."""
    if head_type not in HEAD_REGISTRY:
        raise ValueError(f"Unknown head type '{head_type}'. Available: {list(HEAD_REGISTRY)}")
    return HEAD_REGISTRY[head_type](**kwargs)


# ── JSON serialization ──────────────────────────────────────────────── #

def save_head_json(head: GaitHead, path: str | Path) -> None:
    """Serialize a task head to compact JSON format.

    Format:
    {
        "head_type": "cadence",
        "version": "0.1.0",
        "input_dim": 128,
        "layers": [{"type": "Linear", "in": 128, "out": 64}, ...],
        "weights": "base64-encoded safetensors bytes",
        "experimental": true,
        "validation_status": "unvalidated"
    }
    """
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)

    # Serialize weights to base64
    buffer = io.BytesIO()
    torch.save(head.state_dict(), buffer)
    weights_b64 = base64.b64encode(buffer.getvalue()).decode("ascii")

    # Extract layer info
    layers = []
    for name, module in head.named_modules():
        if isinstance(module, nn.Linear):
            layers.append({
                "type": "Linear",
                "in_features": module.in_features,
                "out_features": module.out_features,
            })
        elif isinstance(module, nn.Sigmoid):
            layers.append({"type": "Sigmoid"})
        elif isinstance(module, nn.ReLU):
            layers.append({"type": "ReLU"})
        elif isinstance(module, nn.Dropout):
            layers.append({"type": "Dropout", "p": module.p})

    payload = {
        "head_type": head.head_type,
        "version": HEAD_VERSION,
        "input_dim": head.input_dim,
        "layers": layers,
        "weights": weights_b64,
        "experimental": True,
        "validation_status": "unvalidated",
    }

    with open(path, "w") as f:
        json.dump(payload, f, indent=2)

    size_kb = path.stat().st_size / 1024
    logger.info("Head '%s' saved to %s (%.1f KB)", head.head_type, path, size_kb)


def load_head_json(path: str | Path) -> GaitHead:
    """Deserialize a task head from JSON format.

    Args:
        path: source .json file

    Returns:
        Loaded GaitHead in eval mode.
    """
    path = Path(path)
    with open(path) as f:
        payload = json.load(f)

    head_type = payload["head_type"]
    head = create_head(head_type, input_dim=payload.get("input_dim", EMBEDDING_DIM))

    # Decode weights
    weights_bytes = base64.b64decode(payload["weights"])
    buffer = io.BytesIO(weights_bytes)
    state_dict = torch.load(buffer, weights_only=True)
    head.load_state_dict(state_dict)
    head.eval()

    logger.info(
        "Head '%s' loaded from %s (version=%s, experimental=%s)",
        head_type,
        path,
        payload.get("version", "unknown"),
        payload.get("experimental", True),
    )
    return head

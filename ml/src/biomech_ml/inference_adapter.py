"""
Inference adapter — loads trained models and provides a unified inference interface
for the gateway to call (either via HTTP API or direct import).
"""

import torch
import numpy as np
from pathlib import Path
from dataclasses import dataclass

from biomech_ml.proxy_models import CadenceProxyModel, SymmetryProxyModel, ContactTimeProxyModel


@dataclass
class ProxyMetricResult:
    """Result of proxy metric inference on a single window."""

    estimated_cadence_spm: float
    symmetry_proxy: float
    contact_time_proxy: float
    model_versions: dict[str, str]
    confidence: float


class ProxyInferenceAdapter:
    """Loads proxy models and runs inference on CSI amplitude windows."""

    def __init__(self, model_dir: str = "storage/models"):
        self.model_dir = Path(model_dir)
        self.cadence_model: CadenceProxyModel | None = None
        self.symmetry_model: SymmetryProxyModel | None = None
        self.contact_model: ContactTimeProxyModel | None = None
        self._versions: dict[str, str] = {}

    def load(self):
        """Load all available proxy models from disk."""
        cadence_path = self.model_dir / "cadence_proxy.pt"
        if cadence_path.exists():
            self.cadence_model = CadenceProxyModel()
            self.cadence_model.load_state_dict(torch.load(cadence_path, weights_only=True))
            self.cadence_model.eval()
            self._versions["cadence"] = "proxy-v0.1"

        symmetry_path = self.model_dir / "symmetry_proxy.pt"
        if symmetry_path.exists():
            self.symmetry_model = SymmetryProxyModel(window_size=50)
            self.symmetry_model.load_state_dict(torch.load(symmetry_path, weights_only=True))
            self.symmetry_model.eval()
            self._versions["symmetry"] = "proxy-v0.1"

        contact_path = self.model_dir / "contact_time_proxy.pt"
        if contact_path.exists():
            self.contact_model = ContactTimeProxyModel()
            self.contact_model.load_state_dict(torch.load(contact_path, weights_only=True))
            self.contact_model.eval()
            self._versions["contact_time"] = "proxy-v0.1"

    @torch.no_grad()
    def infer(self, amplitude_window: np.ndarray) -> ProxyMetricResult:
        """Run inference on a single amplitude window.

        Args:
            amplitude_window: shape (window_size, num_subcarriers)

        Returns:
            ProxyMetricResult with estimated metrics.
        """
        tensor = torch.tensor(amplitude_window, dtype=torch.float32).unsqueeze(0)

        cadence = 0.0
        symmetry = 0.5
        contact = 0.3

        if self.cadence_model is not None:
            cadence = float(self.cadence_model(tensor).item())

        if self.symmetry_model is not None:
            symmetry = float(self.symmetry_model(tensor).item())

        if self.contact_model is not None:
            contact = float(self.contact_model(tensor).item())

        # Simple confidence based on how many models are loaded
        loaded = sum(1 for m in [self.cadence_model, self.symmetry_model, self.contact_model] if m)
        confidence = loaded / 3.0

        return ProxyMetricResult(
            estimated_cadence_spm=cadence,
            symmetry_proxy=symmetry,
            contact_time_proxy=contact,
            model_versions=dict(self._versions),
            confidence=confidence,
        )

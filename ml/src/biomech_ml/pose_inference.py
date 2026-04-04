"""
Pose inference scaffold — placeholder for future CSI-to-pose models.

This module defines the interface and a mock implementation for
inferring 2D keypoint positions from CSI amplitude features.

All outputs are explicitly marked as inferred and experimental.
"""

import numpy as np
from dataclasses import dataclass, field


KEYPOINT_NAMES = [
    "head",
    "neck",
    "left_shoulder",
    "right_shoulder",
    "left_hip",
    "right_hip",
    "left_knee",
    "right_knee",
    "left_ankle",
    "right_ankle",
]


@dataclass
class Keypoint2D:
    name: str
    x: float
    y: float
    confidence: float


@dataclass
class InferredPoseFrame:
    """A single inferred pose frame — always marked experimental."""

    timestamp: int
    keypoints: list[Keypoint2D]
    model_version: str
    confidence: float
    signal_quality: float
    experimental: bool = True


class MockPoseModel:
    """Mock pose inference for development and demo mode.

    Generates plausible-looking keypoint positions with noise.
    NOT a real model — outputs are synthetic and for UI development only.
    """

    model_version = "mock-v0.0.1"

    def infer(self, amplitude_window: np.ndarray, timestamp: int) -> InferredPoseFrame:
        """Generate a mock inferred pose frame."""
        rng = np.random.default_rng(seed=timestamp % 10000)

        # Base standing/running pose template (normalized 0-1 coordinates)
        base_positions = {
            "head": (0.5, 0.1),
            "neck": (0.5, 0.18),
            "left_shoulder": (0.38, 0.22),
            "right_shoulder": (0.62, 0.22),
            "left_hip": (0.42, 0.5),
            "right_hip": (0.58, 0.5),
            "left_knee": (0.40, 0.7),
            "right_knee": (0.60, 0.7),
            "left_ankle": (0.38, 0.9),
            "right_ankle": (0.62, 0.9),
        }

        # Add running motion simulation
        phase = (timestamp % 1000) / 1000.0 * 2 * np.pi
        keypoints = []
        for name in KEYPOINT_NAMES:
            bx, by = base_positions[name]
            noise_x = float(rng.normal(0, 0.01))
            noise_y = float(rng.normal(0, 0.01))

            # Add cyclic motion to legs
            motion = 0.0
            if "knee" in name or "ankle" in name:
                sign = 1.0 if "left" in name else -1.0
                motion = sign * 0.03 * np.sin(phase)

            keypoints.append(
                Keypoint2D(
                    name=name,
                    x=bx + noise_x + motion,
                    y=by + noise_y,
                    confidence=float(rng.uniform(0.4, 0.8)),
                )
            )

        signal_proxy = float(np.mean(np.var(amplitude_window, axis=0))) if amplitude_window.size > 0 else 0.3

        return InferredPoseFrame(
            timestamp=timestamp,
            keypoints=keypoints,
            model_version=self.model_version,
            confidence=float(rng.uniform(0.3, 0.6)),
            signal_quality=min(1.0, signal_proxy),
            experimental=True,
        )

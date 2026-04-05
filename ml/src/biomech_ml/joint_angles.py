"""
Joint angle extraction from inferred COCO keypoints.

Computes biomechanically relevant joint angles via forward kinematics
applied to 17 COCO keypoints estimated from Wi-Fi CSI sensing.

All outputs are INFERRED and EXPERIMENTAL — they are derived from
Wi-Fi-based pose estimation, not optical motion capture.
"""

from __future__ import annotations

import math
from dataclasses import dataclass, field
from typing import Dict, List

import numpy as np

# ---------------------------------------------------------------------------
# COCO keypoint index map
# ---------------------------------------------------------------------------
NOSE = 0
LEFT_EYE = 1
RIGHT_EYE = 2
LEFT_EAR = 3
RIGHT_EAR = 4
LEFT_SHOULDER = 5
RIGHT_SHOULDER = 6
LEFT_ELBOW = 7
RIGHT_ELBOW = 8
LEFT_WRIST = 9
RIGHT_WRIST = 10
LEFT_HIP = 11
RIGHT_HIP = 12
LEFT_KNEE = 13
RIGHT_KNEE = 14
LEFT_ANKLE = 15
RIGHT_ANKLE = 16

# ---------------------------------------------------------------------------
# Reference ranges for running gait (degrees)
# ---------------------------------------------------------------------------
RUNNING_ANGLE_RANGES: Dict[str, tuple[float, float]] = {
    "inferred_left_knee_angle": (10.0, 170.0),
    "inferred_right_knee_angle": (10.0, 170.0),
    "inferred_left_hip_angle": (140.0, 200.0),
    "inferred_right_hip_angle": (140.0, 200.0),
    "inferred_left_elbow_angle": (10.0, 180.0),
    "inferred_right_elbow_angle": (10.0, 180.0),
    "inferred_trunk_lean_angle": (-10.0, 20.0),
    "inferred_pelvic_tilt_angle": (-15.0, 15.0),
}

CONFIDENCE_THRESHOLD = 0.3


# ---------------------------------------------------------------------------
# Dataclass
# ---------------------------------------------------------------------------
@dataclass
class JointAngles:
    """Inferred joint angles from Wi-Fi CSI pose estimation.

    All angles are in degrees.  Every angle carries its own confidence
    score (0.0–1.0) derived from the keypoints that form it.

    validation_status is always 'experimental' — these angles are NOT
    measured by optical motion capture.
    """

    inferred_left_knee_angle: float = float("nan")
    inferred_right_knee_angle: float = float("nan")
    inferred_left_hip_angle: float = float("nan")
    inferred_right_hip_angle: float = float("nan")
    inferred_left_elbow_angle: float = float("nan")
    inferred_right_elbow_angle: float = float("nan")
    inferred_trunk_lean_angle: float = float("nan")
    inferred_pelvic_tilt_angle: float = float("nan")

    # Per-angle confidence (0.0–1.0)
    confidence_left_knee: float = 0.0
    confidence_right_knee: float = 0.0
    confidence_left_hip: float = 0.0
    confidence_right_hip: float = 0.0
    confidence_left_elbow: float = 0.0
    confidence_right_elbow: float = 0.0
    confidence_trunk_lean: float = 0.0
    confidence_pelvic_tilt: float = 0.0

    overall_confidence: float = 0.0
    validation_status: str = "experimental"


# ---------------------------------------------------------------------------
# Core geometry
# ---------------------------------------------------------------------------

def compute_angle(p1: np.ndarray, p2: np.ndarray, p3: np.ndarray) -> float:
    """Angle at *p2* formed by vectors p2→p1 and p2→p3, in degrees.

    Uses the dot-product formula:  cos(θ) = (v1 · v2) / (|v1| |v2|)

    Returns NaN if either vector has zero length.
    """
    v1 = p1 - p2
    v2 = p3 - p2
    norm1 = np.linalg.norm(v1)
    norm2 = np.linalg.norm(v2)
    if norm1 < 1e-9 or norm2 < 1e-9:
        return float("nan")
    cos_angle = np.dot(v1, v2) / (norm1 * norm2)
    cos_angle = float(np.clip(cos_angle, -1.0, 1.0))
    return math.degrees(math.acos(cos_angle))


def _trunk_lean(keypoints: np.ndarray) -> float:
    """Trunk lean angle: midpoint(hips) → midpoint(shoulders) vs vertical.

    Positive = forward lean.  Uses only x,y (first 2 coords).
    """
    mid_hip = (keypoints[LEFT_HIP, :2] + keypoints[RIGHT_HIP, :2]) / 2.0
    mid_shoulder = (keypoints[LEFT_SHOULDER, :2] + keypoints[RIGHT_SHOULDER, :2]) / 2.0
    trunk_vec = mid_shoulder - mid_hip
    # Vertical is "up" — negative y in image coords
    vertical = np.array([0.0, -1.0])
    norm_t = np.linalg.norm(trunk_vec)
    if norm_t < 1e-9:
        return float("nan")
    cos_a = np.dot(trunk_vec, vertical) / norm_t
    cos_a = float(np.clip(cos_a, -1.0, 1.0))
    angle = math.degrees(math.acos(cos_a))
    # Sign: positive when shoulders are forward (positive x displacement)
    sign = 1.0 if (mid_shoulder[0] - mid_hip[0]) >= 0 else -1.0
    return sign * angle


def _pelvic_tilt(keypoints: np.ndarray) -> float:
    """Pelvic tilt: angle of left_hip→right_hip vs horizontal.

    Positive = right hip higher than left.  Uses x,y.
    """
    hip_vec = keypoints[RIGHT_HIP, :2] - keypoints[LEFT_HIP, :2]
    horizontal = np.array([1.0, 0.0])
    norm_h = np.linalg.norm(hip_vec)
    if norm_h < 1e-9:
        return float("nan")
    cos_a = np.dot(hip_vec, horizontal) / norm_h
    cos_a = float(np.clip(cos_a, -1.0, 1.0))
    angle = math.degrees(math.acos(cos_a))
    # Return signed: positive if right hip is higher (lower y in image)
    sign = -1.0 if hip_vec[1] < 0 else 1.0
    return sign * angle


def _keypoint_confidence(keypoints: np.ndarray, idx: int) -> float:
    """Return confidence for a keypoint.  If array is (17,2) assume 1.0."""
    if keypoints.shape[1] >= 3:
        return float(keypoints[idx, 2])
    return 1.0


def _angle_confidence(keypoints: np.ndarray, *indices: int) -> float:
    """Mean confidence of the keypoints forming an angle.

    If any keypoint confidence < CONFIDENCE_THRESHOLD → 0.0.
    """
    confs = [_keypoint_confidence(keypoints, i) for i in indices]
    if any(c < CONFIDENCE_THRESHOLD for c in confs):
        return 0.0
    return float(np.mean(confs))


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def compute_joint_angles(keypoints: np.ndarray) -> JointAngles:
    """Compute inferred joint angles from a single frame of 17 COCO keypoints.

    Args:
        keypoints: shape (17, 2) or (17, 3) where last dim may be confidence.

    Returns:
        JointAngles dataclass with all angles in degrees.
    """
    if keypoints.shape[0] != 17 or keypoints.shape[1] < 2:
        raise ValueError(f"Expected (17, 2+) keypoints, got {keypoints.shape}")

    coords = keypoints[:, :2].astype(np.float64)
    result = JointAngles()

    # --- Limb angles (vertex angle from three points) ---
    angle_defs: list[tuple[str, str, int, int, int]] = [
        ("inferred_left_knee_angle", "confidence_left_knee", LEFT_ANKLE, LEFT_KNEE, LEFT_HIP),
        ("inferred_right_knee_angle", "confidence_right_knee", RIGHT_ANKLE, RIGHT_KNEE, RIGHT_HIP),
        ("inferred_left_hip_angle", "confidence_left_hip", LEFT_KNEE, LEFT_HIP, LEFT_SHOULDER),
        ("inferred_right_hip_angle", "confidence_right_hip", RIGHT_KNEE, RIGHT_HIP, RIGHT_SHOULDER),
        ("inferred_left_elbow_angle", "confidence_left_elbow", LEFT_WRIST, LEFT_ELBOW, LEFT_SHOULDER),
        ("inferred_right_elbow_angle", "confidence_right_elbow", RIGHT_WRIST, RIGHT_ELBOW, RIGHT_SHOULDER),
    ]

    conf_values: list[float] = []

    for angle_attr, conf_attr, p1_idx, p2_idx, p3_idx in angle_defs:
        conf = _angle_confidence(keypoints, p1_idx, p2_idx, p3_idx)
        setattr(result, conf_attr, conf)
        if conf > 0.0:
            angle_val = compute_angle(coords[p1_idx], coords[p2_idx], coords[p3_idx])
            setattr(result, angle_attr, angle_val)
        conf_values.append(conf)

    # --- Trunk lean ---
    trunk_conf = _angle_confidence(keypoints, LEFT_HIP, RIGHT_HIP, LEFT_SHOULDER, RIGHT_SHOULDER)
    result.confidence_trunk_lean = trunk_conf
    if trunk_conf > 0.0:
        result.inferred_trunk_lean_angle = _trunk_lean(keypoints)
    conf_values.append(trunk_conf)

    # --- Pelvic tilt ---
    pelvic_conf = _angle_confidence(keypoints, LEFT_HIP, RIGHT_HIP)
    result.confidence_pelvic_tilt = pelvic_conf
    if pelvic_conf > 0.0:
        result.inferred_pelvic_tilt_angle = _pelvic_tilt(keypoints)
    conf_values.append(pelvic_conf)

    # Overall confidence = mean of all per-angle confidences
    result.overall_confidence = float(np.mean(conf_values)) if conf_values else 0.0

    return result


def compute_joint_angles_batch(keypoints_batch: np.ndarray) -> List[JointAngles]:
    """Compute inferred joint angles for a batch of frames.

    Args:
        keypoints_batch: shape (N, 17, 2) or (N, 17, 3).

    Returns:
        List of N JointAngles.
    """
    if keypoints_batch.ndim != 3:
        raise ValueError(f"Expected 3D array (N, 17, 2+), got shape {keypoints_batch.shape}")
    return [compute_joint_angles(keypoints_batch[i]) for i in range(keypoints_batch.shape[0])]


def validate_angles(angles: JointAngles) -> Dict[str, bool]:
    """Check each angle against biomechanics reference ranges for running.

    Returns:
        Dict mapping angle name → True if within range, False if out-of-range.
        NaN angles are always flagged as False.
    """
    results: Dict[str, bool] = {}
    for name, (lo, hi) in RUNNING_ANGLE_RANGES.items():
        val = getattr(angles, name)
        if math.isnan(val):
            results[name] = False
        else:
            results[name] = lo <= val <= hi
    return results

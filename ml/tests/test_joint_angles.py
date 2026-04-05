"""Tests for joint angle extraction from inferred COCO keypoints."""

import math

import numpy as np
import pytest

from biomech_ml.joint_angles import (
    CONFIDENCE_THRESHOLD,
    JointAngles,
    RUNNING_ANGLE_RANGES,
    compute_angle,
    compute_joint_angles,
    compute_joint_angles_batch,
    validate_angles,
)


# ---------------------------------------------------------------------------
# Helpers — build keypoints with known geometry
# ---------------------------------------------------------------------------

def _make_keypoints_17x2() -> np.ndarray:
    """Straight standing pose — knee ~180°, hip ~180°."""
    kp = np.zeros((17, 2), dtype=np.float64)
    #  vertical spine: shoulder(0,20) - hip(0,50) - knee(0,70) - ankle(0,90)
    kp[5] = [0, 20]   # left_shoulder
    kp[6] = [0, 20]   # right_shoulder
    kp[11] = [0, 50]  # left_hip
    kp[12] = [0, 50]  # right_hip
    kp[13] = [0, 70]  # left_knee
    kp[14] = [0, 70]  # right_knee
    kp[15] = [0, 90]  # left_ankle
    kp[16] = [0, 90]  # right_ankle
    kp[7] = [-10, 35]  # left_elbow
    kp[8] = [10, 35]   # right_elbow
    kp[9] = [-10, 50]  # left_wrist
    kp[10] = [10, 50]  # right_wrist
    return kp


def _make_keypoints_17x3(confidence: float = 0.9) -> np.ndarray:
    """Same as 17x2 but with a confidence column."""
    kp2 = _make_keypoints_17x2()
    conf_col = np.full((17, 1), confidence)
    return np.hstack([kp2, conf_col])


def _right_angle_keypoints() -> np.ndarray:
    """Left knee at exactly 90°: ankle straight right, hip straight up."""
    kp = np.zeros((17, 2), dtype=np.float64)
    kp[15] = [10, 50]  # left_ankle  (right of knee)
    kp[13] = [0, 50]   # left_knee   (vertex)
    kp[11] = [0, 40]   # left_hip    (above knee)
    # Fill minimal other points so (17,2) shape is correct
    kp[5] = [0, 20]
    kp[6] = [0, 20]
    kp[12] = [0, 50]
    kp[14] = [0, 70]
    kp[16] = [0, 90]
    return kp


# ---------------------------------------------------------------------------
# compute_angle
# ---------------------------------------------------------------------------

class TestComputeAngle:
    def test_right_angle(self):
        p1 = np.array([1.0, 0.0])
        p2 = np.array([0.0, 0.0])
        p3 = np.array([0.0, 1.0])
        assert abs(compute_angle(p1, p2, p3) - 90.0) < 0.01

    def test_straight_line(self):
        p1 = np.array([0.0, 0.0])
        p2 = np.array([1.0, 0.0])
        p3 = np.array([2.0, 0.0])
        assert abs(compute_angle(p1, p2, p3) - 180.0) < 0.01

    def test_acute_angle(self):
        p1 = np.array([1.0, 0.0])
        p2 = np.array([0.0, 0.0])
        p3 = np.array([1.0, 1.0])
        assert abs(compute_angle(p1, p2, p3) - 45.0) < 0.01

    def test_zero_length_vector_returns_nan(self):
        p1 = np.array([0.0, 0.0])
        p2 = np.array([0.0, 0.0])
        p3 = np.array([1.0, 0.0])
        assert math.isnan(compute_angle(p1, p2, p3))

    def test_3d_points(self):
        p1 = np.array([1.0, 0.0, 0.0])
        p2 = np.array([0.0, 0.0, 0.0])
        p3 = np.array([0.0, 1.0, 0.0])
        assert abs(compute_angle(p1, p2, p3) - 90.0) < 0.01


# ---------------------------------------------------------------------------
# compute_joint_angles
# ---------------------------------------------------------------------------

class TestComputeJointAngles:
    def test_straight_pose_knee_near_180(self):
        kp = _make_keypoints_17x2()
        angles = compute_joint_angles(kp)
        assert abs(angles.inferred_left_knee_angle - 180.0) < 0.1
        assert abs(angles.inferred_right_knee_angle - 180.0) < 0.1

    def test_right_angle_knee(self):
        kp = _right_angle_keypoints()
        angles = compute_joint_angles(kp)
        assert abs(angles.inferred_left_knee_angle - 90.0) < 0.1

    def test_validation_status_always_experimental(self):
        kp = _make_keypoints_17x2()
        angles = compute_joint_angles(kp)
        assert angles.validation_status == "experimental"

    def test_low_confidence_produces_nan(self):
        kp = _make_keypoints_17x3(confidence=0.1)  # below threshold
        angles = compute_joint_angles(kp)
        assert math.isnan(angles.inferred_left_knee_angle)
        assert angles.confidence_left_knee == 0.0

    def test_mixed_confidence(self):
        kp = _make_keypoints_17x3(confidence=0.9)
        kp[15, 2] = 0.1  # left_ankle low confidence
        angles = compute_joint_angles(kp)
        # Left knee uses ankle(15), knee(13), hip(11) — ankle is low → NaN
        assert math.isnan(angles.inferred_left_knee_angle)
        assert angles.confidence_left_knee == 0.0
        # Right knee should be fine
        assert not math.isnan(angles.inferred_right_knee_angle)
        assert angles.confidence_right_knee > 0

    def test_overall_confidence(self):
        kp = _make_keypoints_17x3(confidence=0.8)
        angles = compute_joint_angles(kp)
        assert 0.0 < angles.overall_confidence <= 1.0

    def test_bad_shape_raises(self):
        with pytest.raises(ValueError):
            compute_joint_angles(np.zeros((10, 2)))


# ---------------------------------------------------------------------------
# compute_joint_angles_batch
# ---------------------------------------------------------------------------

class TestComputeJointAnglesBatch:
    def test_batch_length(self):
        kp = _make_keypoints_17x2()
        batch = np.stack([kp, kp, kp])  # (3, 17, 2)
        result = compute_joint_angles_batch(batch)
        assert len(result) == 3

    def test_batch_values_match_single(self):
        kp = _make_keypoints_17x2()
        single = compute_joint_angles(kp)
        batch = compute_joint_angles_batch(kp[np.newaxis, ...])
        assert abs(batch[0].inferred_left_knee_angle - single.inferred_left_knee_angle) < 0.01

    def test_batch_bad_ndim_raises(self):
        with pytest.raises(ValueError):
            compute_joint_angles_batch(np.zeros((17, 2)))


# ---------------------------------------------------------------------------
# validate_angles
# ---------------------------------------------------------------------------

class TestValidateAngles:
    def test_in_range_returns_true(self):
        kp = _make_keypoints_17x2()
        angles = compute_joint_angles(kp)
        # Straight knee = 180° → knee range [10, 170] → should be False
        v = validate_angles(angles)
        assert v["inferred_left_knee_angle"] is False  # 180 > 170

    def test_nan_angle_returns_false(self):
        angles = JointAngles()  # all NaN by default
        v = validate_angles(angles)
        assert all(val is False for val in v.values())

    def test_custom_angles_in_range(self):
        angles = JointAngles(
            inferred_left_knee_angle=150.0,
            inferred_right_knee_angle=160.0,
            inferred_left_hip_angle=170.0,
            inferred_right_hip_angle=175.0,
            inferred_left_elbow_angle=90.0,
            inferred_right_elbow_angle=100.0,
            inferred_trunk_lean_angle=5.0,
            inferred_pelvic_tilt_angle=2.0,
        )
        v = validate_angles(angles)
        assert v["inferred_left_knee_angle"] is True
        assert v["inferred_trunk_lean_angle"] is True

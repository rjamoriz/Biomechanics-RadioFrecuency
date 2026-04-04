"""Tests for pose inference scaffold."""

import numpy as np
from biomech_ml.pose_inference import MockPoseModel, KEYPOINT_NAMES


def test_mock_pose_model_output():
    model = MockPoseModel()
    window = np.random.randn(50, 64).astype(np.float32)
    frame = model.infer(window, timestamp=12345)

    assert frame.experimental is True
    assert frame.model_version == "mock-v0.0.1"
    assert len(frame.keypoints) == len(KEYPOINT_NAMES)
    assert frame.timestamp == 12345
    assert 0.0 <= frame.confidence <= 1.0
    assert 0.0 <= frame.signal_quality <= 1.0


def test_mock_pose_keypoint_names():
    model = MockPoseModel()
    window = np.random.randn(50, 64).astype(np.float32)
    frame = model.infer(window, timestamp=1000)
    names = [kp.name for kp in frame.keypoints]
    assert names == KEYPOINT_NAMES


def test_mock_pose_keypoint_ranges():
    model = MockPoseModel()
    window = np.random.randn(50, 64).astype(np.float32)
    frame = model.infer(window, timestamp=5000)
    for kp in frame.keypoints:
        assert 0.0 <= kp.x <= 1.0 or abs(kp.x) < 0.1  # Allow small noise overflow
        assert 0.0 <= kp.y <= 1.0 or abs(kp.y) < 0.1
        assert 0.0 <= kp.confidence <= 1.0

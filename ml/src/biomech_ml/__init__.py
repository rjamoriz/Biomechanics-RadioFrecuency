"""Biomech ML — proxy metric and pose inference models for Wi-Fi CSI sensing."""

__version__ = "0.1.0"

from biomech_ml.joint_angles import (
    JointAngles,
    compute_angle,
    compute_joint_angles,
    compute_joint_angles_batch,
    validate_angles,
    RUNNING_ANGLE_RANGES,
)
from biomech_ml.stride_kinematics import (
    GaitEvent,
    StrideMetrics,
    detect_gait_events,
    compute_stride_metrics,
)
from biomech_ml.biomechanics_report import (
    BiomechanicsReportGenerator,
    SessionBiomechanicsReport,
    AngleSummary,
    SymmetrySummary,
    FatigueIndicators,
)

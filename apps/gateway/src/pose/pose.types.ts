export interface Keypoint2D {
  name: string;
  x: number;
  y: number;
  z?: number;
  confidence: number;
}

export interface Joint3D {
  name: string;
  x: number;
  y: number;
  z: number;
  confidence: number;
}

export interface InferredMotionFrame {
  timestamp: number;
  frameIndex: number;
  keypoints2D: Keypoint2D[] | null;
  joints3D: Joint3D[] | null;
  confidence: number;
  confidenceLevel: 'high' | 'medium' | 'low';
  modelVersion: string;
  experimental: boolean;
  signalQualityScore: number;
  validationStatus: 'unvalidated' | 'experimental' | 'station-validated' | 'externally-validated';
  estimatedForces?: EstimatedRunningForces;
}

/** Estimated running forces — synthetic proxy values, NOT clinical-grade. */
export interface EstimatedRunningForces {
  groundReactionForceN: number;
  brakingForceN: number;
  propulsiveForceN: number;
  impactLoadingRateNPerS: number;
  muscleForcesN: {
    quadricepsPeak: number;
    hamstringsPeak: number;
    gastrocnemiusPeak: number;
    gluteMaxPeak: number;
    tibialisAnteriorPeak: number;
  };
  runnerWeightN: number;
  speedKmh: number;
  disclaimer: string;
}

export type SyntheticViewType =
  | 'front'
  | 'rear'
  | 'left_lateral'
  | 'right_lateral'
  | 'orbit';

export interface SyntheticViewMetadata {
  viewType: SyntheticViewType;
  isInferred: true;
  isSynthetic: true;
  disclaimer: string;
}

export const SYNTHETIC_VIEW_DISCLAIMER =
  'This is a synthetic model-based rendering inferred from Wi-Fi sensing. ' +
  'It is not a true camera or optical motion capture view.';

// ─────────────────────────────────────────────────────────────────────────────
// Joint Kinematics — per-joint proxy estimates during running
// ─────────────────────────────────────────────────────────────────────────────

/** Running gait cycle phases based on Whittle 2007 / Perry & Burnfield */
export type RunningGaitPhase =
  | 'loading_response'   // 0–12 % — heel contact, highest impact rate
  | 'mid_stance'         // 12–30 % — single-leg support, vGRF peak
  | 'terminal_stance'    // 30–50 % — push-off preparation
  | 'toe_off'            // 50–62 % — propulsive impulse, gastrocnemius peak
  | 'initial_swing'      // 62–75 % — thigh accelerates forward
  | 'mid_swing'          // 75–87 % — max knee flexion
  | 'terminal_swing';    // 87–100 % — pre-contact deceleration

/** Proxy data for a single joint at one instant */
export interface JointProxyData {
  /** Inferred joint angle in degrees (flexion positive) */
  angleProxyDeg: number;
  /** Estimated joint force proxy in Newtons — NOT a direct measurement */
  forceProxyN: number;
  /** Angular displacement from personal/session baseline in degrees */
  displacementFromBaselineDeg: number;
  /** Risk level based on force + angle deviations */
  riskLevel: 'normal' | 'elevated' | 'high';
  /** 0.0–1.0 confidence for this joint estimate */
  confidence: number;
}

/** One frame of joint kinematics for the runner (bilateral) */
export interface JointKinematicsFrame {
  timestamp: number;
  /** Gait cycle phase for the LEFT leg */
  leftLegPhase: RunningGaitPhase;
  /** Gait cycle phase for the RIGHT leg */
  rightLegPhase: RunningGaitPhase;
  /** Fractional gait cycle position 0.0–1.0 (left leg) */
  gaitCyclePositionLeft: number;
  /** Fractional gait cycle position 0.0–1.0 (right leg) */
  gaitCyclePositionRight: number;
  joints: {
    leftKnee: JointProxyData;
    rightKnee: JointProxyData;
    leftHip: JointProxyData;
    rightHip: JointProxyData;
    leftAnkle: JointProxyData;
    rightAnkle: JointProxyData;
    lowerBack: JointProxyData;
  };
  /** Overall symmetry score 0.0–1.0 (1 = perfectly bilateral) */
  bilateralSymmetryScore: number;
  /** Highest risk joint name */
  highestRiskJoint: string;
  speedKmh: number;
  inclinePercent: number;
  experimental: true;
  validationStatus: 'experimental';
  disclaimer: string;
}

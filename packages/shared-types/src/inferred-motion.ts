import { ValidationStatus, ConfidenceLevel } from './common';

/* ──────────────────────────────────────────────
 * Inferred motion types — Wi-Fi CSI → pose.
 *
 * These are NOT camera captures. They are
 * model-based inferences from radio signals.
 * ────────────────────────────────────────────── */

export type SyntheticViewType = 'front' | 'rear' | 'lateral';

export interface Keypoint2D {
  name: string;
  x: number;
  y: number;
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
  modelVersion: string;
  /** Overall frame confidence (0–1). */
  confidence: number;
  confidenceLevel: ConfidenceLevel;
  signalQualityScore: number;
  validationStatus: ValidationStatus;
  /** True if this output has not yet been validated against external references. */
  experimental: boolean;

  keypoints2D?: Keypoint2D[];
  joints3D?: Joint3D[];
  syntheticViewType?: SyntheticViewType;
}

export interface InferredMotionSeries {
  id: string;
  sessionId: string;
  modelVersion: string;
  frames: InferredMotionFrame[];
  confidence: number;
  validationStatus: ValidationStatus;
  experimental: boolean;
  createdAt: string;
}

/**
 * Mandatory disclaimer for any UI rendering synthetic motion.
 * Must be displayed alongside any inferred motion visualization.
 */
export const SYNTHETIC_MOTION_DISCLAIMER =
  'This is a synthetic model-based rendering inferred from Wi-Fi sensing. ' +
  'It is not a true camera or optical motion capture view.';

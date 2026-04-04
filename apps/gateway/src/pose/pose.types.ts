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
  frameIndex: number;
  keypoints2D: Keypoint2D[] | null;
  joints3D: Joint3D[] | null;
  confidence: number;
  confidenceLevel: 'high' | 'medium' | 'low';
  modelVersion: string;
  experimental: boolean;
  signalQualityScore: number;
  validationStatus: 'unvalidated' | 'experimental' | 'station-validated' | 'externally-validated';
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

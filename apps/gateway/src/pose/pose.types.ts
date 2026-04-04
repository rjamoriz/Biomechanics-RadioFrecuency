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
  keypoints2d: Keypoint2D[] | null;
  joints3d: Joint3D[] | null;
  overallConfidence: number;
  modelVersion: string;
  experimental: boolean;
  signalQualityAtCapture: number;
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

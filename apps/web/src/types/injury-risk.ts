/**
 * Frontend-local injury risk types.
 * Extended from shared-types; keeps UI concerns local.
 */

export type InjuryRiskLevel = 'low' | 'moderate' | 'elevated' | 'high' | 'critical';

export type ArticulationJoint =
  | 'knee_left'
  | 'knee_right'
  | 'hip_left'
  | 'hip_right'
  | 'ankle_left'
  | 'ankle_right'
  | 'lumbar';

export interface ArticulationRisk {
  joint: ArticulationJoint;
  riskScore: number;
  riskLevel: InjuryRiskLevel;
  confidence: number;
  primaryDriver: string;
}

export interface InjuryRiskFactor {
  id: string;
  label: string;
  value: number;
  weight: number;
  elevated: boolean;
  description: string;
}

export interface LiveInjuryRiskSnapshot {
  timestamp: number;
  overallRiskScore: number;
  overallRiskLevel: InjuryRiskLevel;
  articulationRisks: ArticulationRisk[];
  riskFactors: InjuryRiskFactor[];
  modelConfidence: number;
  confidenceLevel: 'high' | 'medium' | 'low';
  signalQualityScore: number;
  validationStatus: string;
  usedInferredJointAngles: boolean;
  experimental: true;
  disclaimer: string;
}

export interface InjuryRiskSummary {
  id: string;
  sessionId: string;
  peakRiskScore: number;
  peakRiskLevel: InjuryRiskLevel;
  meanRiskScore: number;
  peakRiskTimestamp: number | null;
  articulationPeaksJson: string | null;
  dominantRiskFactors: string | null;
  snapshotCount: number;
  modelConfidence: number;
  validationStatus: string;
  experimental: boolean;
  createdAt: string;
}

// ─── Display helpers ─────────────────────────────────────────────────

export const RISK_LEVEL_COLORS: Record<InjuryRiskLevel, string> = {
  low:      'text-emerald-600',
  moderate: 'text-yellow-500',
  elevated: 'text-orange-500',
  high:     'text-red-500',
  critical: 'text-red-700',
};

export const RISK_LEVEL_BG: Record<InjuryRiskLevel, string> = {
  low:      'bg-emerald-50 border-emerald-200',
  moderate: 'bg-yellow-50 border-yellow-200',
  elevated: 'bg-orange-50 border-orange-200',
  high:     'bg-red-50 border-red-200',
  critical: 'bg-red-100 border-red-400',
};

export const RISK_LEVEL_FILL: Record<InjuryRiskLevel, string> = {
  low:      '#10b981',
  moderate: '#eab308',
  elevated: '#f97316',
  high:     '#ef4444',
  critical: '#b91c1c',
};

export const JOINT_LABELS: Record<ArticulationJoint, string> = {
  knee_left:  'Left Knee',
  knee_right: 'Right Knee',
  hip_left:   'Left Hip',
  hip_right:  'Right Hip',
  ankle_left: 'Left Ankle',
  ankle_right: 'Right Ankle',
  lumbar:     'Lumbar',
};

export const INJURY_RISK_DISCLAIMER =
  'This injury risk score is a proxy estimate inferred from Wi-Fi CSI biomechanics data. ' +
  'It is experimental, unvalidated, and must not be used for clinical, medical, or rehabilitation decisions. ' +
  'Consult a qualified sports-medicine professional for injury assessment.';

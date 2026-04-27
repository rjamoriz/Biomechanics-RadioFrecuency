/** Gateway-internal injury risk types (mirrors shared-types without package dependency). */

export type InjuryRiskLevel = 'low' | 'moderate' | 'elevated' | 'high' | 'critical';

export function classifyRiskLevel(score: number): InjuryRiskLevel {
  if (score < 0.2) return 'low';
  if (score < 0.4) return 'moderate';
  if (score < 0.6) return 'elevated';
  if (score < 0.8) return 'high';
  return 'critical';
}

export interface ArticulationRisk {
  joint: 'knee_left' | 'knee_right' | 'hip_left' | 'hip_right' | 'ankle_left' | 'ankle_right' | 'lumbar';
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

export interface InjuryRiskSnapshot {
  timestamp: number;
  overallRiskScore: number;
  overallRiskLevel: InjuryRiskLevel;
  articulationRisks: ArticulationRisk[];
  riskFactors: InjuryRiskFactor[];
  modelConfidence: number;
  confidenceLevel: 'high' | 'medium' | 'low';
  signalQualityScore: number;
  validationStatus: 'unvalidated' | 'experimental' | 'station_validated' | 'externally_validated';
  usedInferredJointAngles: boolean;
  experimental: true;
}

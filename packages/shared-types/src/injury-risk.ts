import { ValidationStatus, ConfidenceLevel } from './common';

/* ──────────────────────────────────────────────
 * Injury Risk Prediction Types
 *
 * These are PROXY ESTIMATES derived from Wi-Fi CSI
 * biomechanics signals. They are NOT clinical
 * assessments, diagnoses, or medical recommendations.
 *
 * All outputs are experimental unless explicitly
 * validated against external references.
 * ────────────────────────────────────────────── */

/**
 * Injury risk levels in ascending order of concern.
 * Scores are continuous [0–1]; levels are discretized thresholds.
 */
export type InjuryRiskLevel = 'low' | 'moderate' | 'elevated' | 'high' | 'critical';

/** Maps a continuous risk score [0–1] to a discrete level. */
export function classifyRiskLevel(score: number): InjuryRiskLevel {
  if (score < 0.2) return 'low';
  if (score < 0.4) return 'moderate';
  if (score < 0.6) return 'elevated';
  if (score < 0.8) return 'high';
  return 'critical';
}

/**
 * Per-articulation risk estimate.
 * Each joint region receives its own score and contributing signals.
 */
export interface ArticulationRisk {
  /** Joint region identifier. */
  joint: 'knee_left' | 'knee_right' | 'hip_left' | 'hip_right' | 'ankle_left' | 'ankle_right' | 'lumbar';
  /** Risk score [0–1]. */
  riskScore: number;
  /** Discretized risk level. */
  riskLevel: InjuryRiskLevel;
  /** Model confidence in this articulation estimate [0–1]. */
  confidence: number;
  /** Primary biomechanical signal driving this articulation risk. */
  primaryDriver: string;
}

/**
 * A single contributing factor to the overall injury risk score.
 * Enables explainability — coaches see WHY risk is elevated.
 */
export interface InjuryRiskFactor {
  /** Machine-readable factor identifier. */
  id: string;
  /** Human-readable display name. */
  label: string;
  /** Normalized factor contribution [0–1]. */
  value: number;
  /** Weight of this factor in the composite score [0–1]. */
  weight: number;
  /** Whether this factor is currently elevated above safe threshold. */
  elevated: boolean;
  /** Brief explanation for UI display. */
  description: string;
}

/**
 * Full injury risk assessment for a single evaluation snapshot.
 * Attached to a session or streamed in realtime.
 *
 * IMPORTANT: This is a proxy-based experimental estimate.
 * Not for clinical or medical use without independent validation.
 */
export interface InjuryRiskAssessment {
  sessionId: string;
  timestamp: number;

  /** Overall composite risk score [0–1]. */
  overallRiskScore: number;
  /** Discretized overall risk level. */
  overallRiskLevel: InjuryRiskLevel;

  /** Per-articulation breakdown. */
  articulationRisks: ArticulationRisk[];

  /** Contributing factors — drives explainability UI. */
  riskFactors: InjuryRiskFactor[];

  /** Model confidence in the overall estimate [0–1]. */
  modelConfidence: number;
  confidenceLevel: ConfidenceLevel;
  signalQualityScore: number;
  validationStatus: ValidationStatus;

  /**
   * True if inferred joint-angle data was available
   * and used to compute this assessment.
   */
  usedInferredJointAngles: boolean;

  /** Always experimental until externally validated. */
  experimental: true;
}

/**
 * Session-level aggregated injury risk summary.
 * Returned by the backend for post-session analysis and comparisons.
 */
export interface InjuryRiskSummary {
  id: string;
  sessionId: string;

  /** Peak overall risk score observed during the session. */
  peakRiskScore: number;
  peakRiskLevel: InjuryRiskLevel;

  /** Mean overall risk score across the session. */
  meanRiskScore: number;

  /** Timestamp at which peak risk occurred. */
  peakRiskTimestamp: number | null;

  /** Per-articulation peak scores for the session. */
  articulationPeaks: Partial<Record<ArticulationRisk['joint'], number>>;

  /** Most frequently elevated factors during the session. */
  dominantRiskFactors: string[];

  /** How many snapshots were assessed in this session. */
  snapshotCount: number;

  modelConfidence: number;
  validationStatus: ValidationStatus;
  experimental: true;
  createdAt: string;
}

/* ──────────────────────────────────────────────
 * WebSocket Event
 * ────────────────────────────────────────────── */

/** Server → Client: realtime injury risk update. */
export interface WsInjuryRiskUpdate extends InjuryRiskAssessment {
  event: 'injury-risk';
}

/* ──────────────────────────────────────────────
 * Disclaimer — mandatory on any injury-risk UI
 * ────────────────────────────────────────────── */

export const INJURY_RISK_DISCLAIMER =
  'Injury risk estimates are proxy-based experimental outputs derived from ' +
  'Wi-Fi CSI biomechanics signals. They are not clinical assessments, ' +
  'medical diagnoses, or recommendations for treatment. ' +
  'Always consult a qualified sports-medicine professional.';

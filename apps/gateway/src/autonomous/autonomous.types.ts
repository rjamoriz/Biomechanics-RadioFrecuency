/**
 * Autonomous Edge Intelligence — Shared Types
 *
 * All outputs from this module are estimated proxy metrics inferred from
 * Wi-Fi CSI signals. They are NOT clinical-grade measurements.
 */

// ─── Gait State Hypothesis ─────────────────────────────────────────

export enum GaitState {
  IDLE = 0,
  WARMING_UP = 1,
  STEADY_RUNNING = 2,
  HIGH_INTENSITY = 3,
  FATIGUING = 4,
  FORM_DEGRADING = 5,
  COOLING_DOWN = 6,
  RESTING = 7,
}

// ─── Coherence Monitor ─────────────────────────────────────────────

export interface CoherenceState {
  /** Environment coherence [0, 1]; 1 = stable */
  coherence: number;
  /** Von Neumann entropy [0, ln(2)] */
  entropy: number;
  /** Normalized entropy [0, 1] */
  normalizedEntropy: number;
  /** Mean Bloch vector [x, y, z] */
  blochVector: [number, number, number];
  /** Total frames processed */
  frameCount: number;
  /** True if entropy jumped above decoherence threshold */
  isDecoherenceEvent: boolean;
  /** Euclidean drift between consecutive Bloch vectors */
  blochDrift: number;
}

// ─── Gait State Classifier ─────────────────────────────────────────

export interface GaitClassification {
  /** Most probable gait state */
  winner: GaitState;
  /** Winner probability [0, 1] */
  winnerProbability: number;
  /** True when winner probability exceeds convergence threshold */
  isConverged: boolean;
  /** Probability per state */
  probabilities: Record<GaitState, number>;
  /** Grover iterations performed */
  iterations: number;
}

export interface GaitFeatures {
  estimatedCadence: number;
  symmetryProxy: number;
  contactTimeProxy: number;
  fatigueDriftScore: number;
  motionEnergy: number;
  signalQuality: number;
}

// ─── Session Rule Engine ────────────────────────────────────────────

export type Severity = 'info' | 'warning' | 'alert';

export interface SessionConclusion {
  ruleId: number;
  name: string;
  confidence: number;
  severity: Severity;
}

export interface SessionRuleResult {
  firedRules: number[];
  conclusions: SessionConclusion[];
  contradictionCount: number;
  topConclusion: SessionConclusion | null;
}

export interface SessionFeatures {
  motionEnergy: number;
  signalQuality: number;
  estimatedCadence: number;
  symmetryProxy: number;
  contactTimeProxy: number;
  fatigueDriftScore: number;
  coherence: number;
  /** Previous motionEnergy for stumble detection */
  prevMotionEnergy: number;
  /** Whether cadence is stable within ±5% over recent window */
  cadenceStable: boolean;
  /** Cadence change percentage over last 10 s */
  cadenceChangePct: number;
  /** Is cadence in a decreasing trend? */
  cadenceDecreasing: boolean;
  /** Is motion energy in a decreasing trend? */
  motionDecreasing: boolean;
  /** Seconds since last detected presence */
  secondsSincePresence: number;
  /** Seconds signal quality has been below threshold */
  secondsLowSignal: number;
}

// ─── Station Health Monitor ─────────────────────────────────────────

export interface StationHealthState {
  activeStations: number;
  stationQualities: Map<string, number>;
  minCut: number;
  isHealing: boolean;
  weakestStation: string | null;
  coverageScore: number;
}

// ─── Autonomous Composite Event ─────────────────────────────────────

export interface AutonomousStateEvent {
  timestamp: number;
  coherence: CoherenceState;
  gaitClassification: GaitClassification;
  ruleResult: SessionRuleResult;
  disclaimer: string;
}

export interface StationHealthEvent {
  timestamp: number;
  health: StationHealthState;
}

export interface RecordingStatusEvent {
  timestamp: number;
  isRecording: boolean;
  sessionId: string | null;
  framesRecorded: number;
  filesWritten: number;
}

export const AUTONOMOUS_DISCLAIMER =
  'Autonomous edge intelligence outputs are estimated proxy metrics inferred from Wi-Fi CSI. Not clinical-grade.';

// ─── Re-exports for shared access ───────────────────────────────────

export type { GateDecision } from '../signal/coherence-gate';
export type { FresnelAnalysis, StationGeometry, FresnelZoneInfo } from '../signal/fresnel-zone';
export type { FieldModelSnapshot, BaselineExport } from '../signal/field-model';
export { FieldModelState } from '../signal/field-model';
export type { PipelineReport, StageResult, PipelineStage } from '../signal/signal-line-protocol';

// ─── Signal Line Event ──────────────────────────────────────────────

export interface SignalLineEvent {
  timestamp: number;
  gateAcceptanceRate: number;
  fieldModelState: string;
  fieldModelDriftScore: number;
  fieldModelMotionEnergy: number;
  fieldModelCalibrationAge: number;
  pipelinePassRates: Record<string, number>;
  throughputHz: number;
  disclaimer: string;
}

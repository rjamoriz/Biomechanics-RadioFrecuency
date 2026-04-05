/**
 * Coherence Gate — CSI Frame Quality Filter
 *
 * Evaluates each CSI frame's environmental quality BEFORE it enters
 * the metrics pipeline. Prevents spurious cadence estimates, false
 * vital signs readings, and unreliable proxy metrics from corrupted frames.
 *
 * Gate score = 0.6 * coherence + 0.25 * (1 - normalizedEntropy) + 0.15 * signalQuality
 *
 * All thresholds are estimated heuristics — not clinical-grade criteria.
 */

import { CoherenceState } from '../autonomous/autonomous.types';

// ─── Constants ──────────────────────────────────────────────────────

/** Minimum gate score to accept a frame */
export const GATE_THRESHOLD = 0.35;

/** EMA smoothing factor for acceptance rate tracking */
export const ACCEPTANCE_ALPHA = 0.05;

/** After this many consecutive rejections, force-accept to prevent pipeline deadlock */
export const MAX_CONSECUTIVE_REJECTIONS = 20;

// ─── Gate weights ───────────────────────────────────────────────────

const W_COHERENCE = 0.6;
const W_ENTROPY = 0.25;
const W_SIGNAL_QUALITY = 0.15;

// ─── Types ──────────────────────────────────────────────────────────

export type GateReason =
  | 'accepted'
  | 'low_coherence'
  | 'high_entropy'
  | 'low_quality'
  | 'force_accepted';

export interface GateDecision {
  /** Whether the frame passed the coherence gate */
  accepted: boolean;
  /** Composite gate score [0, 1] */
  gateScore: number;
  /** Reason for the accept/reject decision */
  reason: GateReason;
  /** Running EMA acceptance rate [0, 1] */
  acceptanceRate: number;
  /** How many frames in a row were rejected */
  consecutiveRejections: number;
}

// ─── Implementation ─────────────────────────────────────────────────

export class CoherenceGate {
  private readonly threshold: number;
  private acceptanceRate = 1;
  private consecutiveRejections = 0;
  private initialized = false;

  constructor(threshold: number = GATE_THRESHOLD) {
    this.threshold = threshold;
  }

  /**
   * Evaluate a CSI frame for quality gating.
   *
   * @param coherence     Current CoherenceState from CoherenceMonitor
   * @param signalQuality Signal quality score [0, 1] from SignalQualityService
   */
  evaluate(coherence: CoherenceState, signalQuality: number): GateDecision {
    const clampedQuality = clamp(signalQuality, 0, 1);

    // Composite gate score
    const gateScore =
      W_COHERENCE * coherence.coherence +
      W_ENTROPY * (1 - clamp(coherence.normalizedEntropy, 0, 1)) +
      W_SIGNAL_QUALITY * clampedQuality;

    const roundedScore = round4(gateScore);

    // Force-accept after too many consecutive rejections (deadlock prevention)
    if (this.consecutiveRejections >= MAX_CONSECUTIVE_REJECTIONS) {
      this.consecutiveRejections = 0;
      this.updateAcceptanceRate(true);
      return {
        accepted: true,
        gateScore: roundedScore,
        reason: 'force_accepted',
        acceptanceRate: round4(this.acceptanceRate),
        consecutiveRejections: 0,
      };
    }

    const accepted = roundedScore >= this.threshold;

    if (accepted) {
      this.consecutiveRejections = 0;
    } else {
      this.consecutiveRejections++;
    }

    this.updateAcceptanceRate(accepted);

    return {
      accepted,
      gateScore: roundedScore,
      reason: accepted ? 'accepted' : this.classifyRejection(coherence, clampedQuality),
      acceptanceRate: round4(this.acceptanceRate),
      consecutiveRejections: this.consecutiveRejections,
    };
  }

  /** Running EMA acceptance rate [0, 1] */
  getAcceptanceRate(): number {
    return round4(this.acceptanceRate);
  }

  /** Reset gate state (e.g. on session start) */
  reset(): void {
    this.acceptanceRate = 1;
    this.consecutiveRejections = 0;
    this.initialized = false;
  }

  // ─── Private ────────────────────────────────────────────────────

  private updateAcceptanceRate(accepted: boolean): void {
    const value = accepted ? 1 : 0;
    if (!this.initialized) {
      this.acceptanceRate = value;
      this.initialized = true;
    } else {
      this.acceptanceRate =
        this.acceptanceRate * (1 - ACCEPTANCE_ALPHA) + value * ACCEPTANCE_ALPHA;
    }
  }

  private classifyRejection(
    coherence: CoherenceState,
    signalQuality: number,
  ): GateReason {
    // Identify the dominant cause of rejection
    const coherenceContrib = W_COHERENCE * coherence.coherence;
    const entropyContrib = W_ENTROPY * (1 - clamp(coherence.normalizedEntropy, 0, 1));
    const qualityContrib = W_SIGNAL_QUALITY * signalQuality;

    const min = Math.min(coherenceContrib, entropyContrib, qualityContrib);

    if (min === coherenceContrib) return 'low_coherence';
    if (min === entropyContrib) return 'high_entropy';
    return 'low_quality';
  }
}

// ─── Helpers ────────────────────────────────────────────────────────

function clamp(v: number, min: number, max: number): number {
  return v < min ? min : v > max ? max : v;
}

function round4(v: number): number {
  return Math.round(v * 10000) / 10000;
}

/**
 * Gait State Classifier (Grover-inspired)
 *
 * Maintains weighted hypotheses for current gait/running state. Uses an
 * oracle + diffusion (Grover-inspired) approach to converge on the most
 * likely state from noisy CSI-derived evidence.
 *
 * All outputs are estimated proxy states — not clinical-grade.
 */

import { GaitState, GaitClassification, GaitFeatures } from './autonomous.types';

// ─── Constants ──────────────────────────────────────────────────────

const N_STATES = 8;
const CONVERGENCE_PROB = 0.5;
const ORACLE_BOOST = 1.3;
const ORACLE_DAMPEN = 0.7;

// ─── Implementation ─────────────────────────────────────────────────

export class GaitStateClassifier {
  private amplitudes: Float64Array;
  private iterations = 0;

  constructor() {
    // Uniform superposition
    this.amplitudes = new Float64Array(N_STATES);
    this.initUniform();
  }

  /**
   * Process CSI-derived features and return gait classification.
   */
  processFrame(features: GaitFeatures): GaitClassification {
    // Step 1: Oracle — boost/dampen based on evidence
    this.applyOracle(features);

    // Step 2: Grover diffusion — reflect about mean
    this.applyDiffusion();

    // Step 3: Normalize to probabilities (sum of squares = 1)
    this.normalize();

    this.iterations++;

    return this.toClassification();
  }

  getClassification(): GaitClassification {
    return this.toClassification();
  }

  reset(): void {
    this.initUniform();
    this.iterations = 0;
  }

  // ─── Oracle ─────────────────────────────────────────────────────

  private applyOracle(f: GaitFeatures): void {
    const a = this.amplitudes;

    // IDLE: low motion energy, any signal
    applyEvidence(a, GaitState.IDLE, f.motionEnergy < 10 && f.estimatedCadence < 30);

    // WARMING_UP: low-moderate cadence, motion present
    applyEvidence(a, GaitState.WARMING_UP,
      f.estimatedCadence >= 30 && f.estimatedCadence < 140 && f.motionEnergy > 20);

    // STEADY_RUNNING: cadence 140-180, good symmetry
    applyEvidence(a, GaitState.STEADY_RUNNING,
      f.estimatedCadence >= 140 && f.estimatedCadence <= 180 && f.symmetryProxy > 0.85);

    // HIGH_INTENSITY: cadence > 170, high motion energy
    applyEvidence(a, GaitState.HIGH_INTENSITY,
      f.estimatedCadence > 170 && f.motionEnergy > 150);

    // FATIGUING: fatigue drift rising, symmetry dropping
    applyEvidence(a, GaitState.FATIGUING,
      f.fatigueDriftScore > 0.3 && f.symmetryProxy < 0.85);

    // FORM_DEGRADING: symmetry poor, contact time elevated
    applyEvidence(a, GaitState.FORM_DEGRADING,
      f.symmetryProxy < 0.75 && f.contactTimeProxy > 0.6);

    // COOLING_DOWN: moderate cadence < 140, some motion
    applyEvidence(a, GaitState.COOLING_DOWN,
      f.estimatedCadence > 60 && f.estimatedCadence < 140 && f.motionEnergy < 80);

    // RESTING: on treadmill (some motion) but minimal cadence
    applyEvidence(a, GaitState.RESTING,
      f.motionEnergy > 5 && f.motionEnergy < 30 && f.estimatedCadence < 60);
  }

  // ─── Diffusion ──────────────────────────────────────────────────

  private applyDiffusion(): void {
    const a = this.amplitudes;
    let sum = 0;
    for (let i = 0; i < N_STATES; i++) sum += a[i];
    const mean = sum / N_STATES;

    for (let i = 0; i < N_STATES; i++) {
      a[i] = 2 * mean - a[i];
      if (a[i] < 0) a[i] = 0;
    }
  }

  // ─── Normalization ──────────────────────────────────────────────

  private normalize(): void {
    const a = this.amplitudes;
    let sumSq = 0;
    for (let i = 0; i < N_STATES; i++) sumSq += a[i] * a[i];
    if (sumSq === 0) {
      this.initUniform();
      return;
    }
    const norm = Math.sqrt(sumSq);
    for (let i = 0; i < N_STATES; i++) a[i] /= norm;
  }

  // ─── Helpers ────────────────────────────────────────────────────

  private initUniform(): void {
    const val = 1 / Math.sqrt(N_STATES);
    for (let i = 0; i < N_STATES; i++) this.amplitudes[i] = val;
  }

  private toClassification(): GaitClassification {
    const probabilities = {} as Record<GaitState, number>;
    let maxProb = 0;
    let winner = GaitState.IDLE;

    for (let i = 0; i < N_STATES; i++) {
      const p = round4(this.amplitudes[i] * this.amplitudes[i]);
      probabilities[i as GaitState] = p;
      if (p > maxProb) {
        maxProb = p;
        winner = i as GaitState;
      }
    }

    return {
      winner,
      winnerProbability: maxProb,
      isConverged: maxProb > CONVERGENCE_PROB,
      probabilities,
      iterations: this.iterations,
    };
  }
}

// ─── Helpers ────────────────────────────────────────────────────────

function applyEvidence(a: Float64Array, state: GaitState, matches: boolean): void {
  a[state] *= matches ? ORACLE_BOOST : ORACLE_DAMPEN;
}

function round4(v: number): number {
  return Math.round(v * 10000) / 10000;
}

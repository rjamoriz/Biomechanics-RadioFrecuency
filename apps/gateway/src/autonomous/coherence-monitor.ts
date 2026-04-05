/**
 * CSI Coherence Monitor
 *
 * Maps CSI subcarrier phases onto a Bloch-sphere representation to compute
 * an aggregate coherence metric. Detects sudden environmental disturbances
 * (person walking near station, door opening, equipment interference) via
 * entropy spikes.
 *
 * All outputs are estimated proxy metrics — not clinical-grade measurements.
 */

import { CoherenceState } from './autonomous.types';

// ─── Constants ──────────────────────────────────────────────────────

const MAX_SUBCARRIERS = 64;
const ALPHA = 0.15;
const DECOHERENCE_THRESHOLD = 0.3;
const LN2 = 0.6931471805599453;

// ─── Implementation ─────────────────────────────────────────────────

export class CoherenceMonitor {
  private smoothedEntropy = 0;
  private prevBloch: [number, number, number] = [0, 0, 0];
  private frameCount = 0;
  private lastState: CoherenceState = defaultState();

  /**
   * Process a CSI frame's phase array and return the updated coherence state.
   */
  processFrame(phases: number[]): CoherenceState {
    if (phases.length === 0) {
      return this.lastState;
    }

    // Limit to MAX_SUBCARRIERS
    const n = Math.min(phases.length, MAX_SUBCARRIERS);

    // Map each subcarrier phase to a Bloch vector and accumulate.
    // theta = |phase|, phi = sign(phase) * PI/2
    // cos(phi) = cos(±PI/2) = 0  → x-component is always 0 (skip)
    // sin(phi) = sign(phase) * 1  → y = sin(theta) * sign(phase)
    // z = cos(theta)
    let sumY = 0;
    let sumZ = 0;

    for (let i = 0; i < n; i++) {
      const theta = Math.abs(phases[i]);
      const signPhi = phases[i] >= 0 ? 1 : -1;
      sumY += Math.sin(theta) * signPhi;
      sumZ += Math.cos(theta);
    }

    const meanX = 0;
    const meanY = sumY / n;
    const meanZ = sumZ / n;

    // Coherence = magnitude of mean Bloch vector [0, 1]
    const coherence = Math.sqrt(meanY * meanY + meanZ * meanZ);

    // Von Neumann entropy: S = -p*log(p) - (1-p)*log(1-p), p=(1+|bloch|)/2
    const p = clamp((1 + coherence) / 2, 1e-10, 1 - 1e-10);
    const entropy = -(p * Math.log(p) + (1 - p) * Math.log(1 - p));
    const normalizedEntropy = entropy / LN2;

    // EMA smoothing
    this.smoothedEntropy =
      this.frameCount === 0
        ? normalizedEntropy
        : this.smoothedEntropy * (1 - ALPHA) + normalizedEntropy * ALPHA;

    // Decoherence event: jump in smoothed entropy
    const prevSmoothed =
      this.frameCount === 0 ? this.smoothedEntropy : this.lastState.normalizedEntropy;
    const entropyJump = this.smoothedEntropy - prevSmoothed;
    const isDecoherenceEvent = entropyJump > DECOHERENCE_THRESHOLD;

    // Bloch drift: Euclidean distance from previous mean Bloch vector
    const blochVector: [number, number, number] = [meanX, meanY, meanZ];
    const blochDrift =
      this.frameCount === 0
        ? 0
        : euclidean(blochVector, this.prevBloch);

    this.prevBloch = blochVector;
    this.frameCount++;

    this.lastState = {
      coherence: round4(coherence),
      entropy: round4(entropy),
      normalizedEntropy: round4(this.smoothedEntropy),
      blochVector: [round4(meanX), round4(meanY), round4(meanZ)],
      frameCount: this.frameCount,
      isDecoherenceEvent,
      blochDrift: round4(blochDrift),
    };

    return this.lastState;
  }

  getState(): CoherenceState {
    return this.lastState;
  }

  reset(): void {
    this.smoothedEntropy = 0;
    this.prevBloch = [0, 0, 0];
    this.frameCount = 0;
    this.lastState = defaultState();
  }
}

// ─── Helpers ────────────────────────────────────────────────────────

function defaultState(): CoherenceState {
  return {
    coherence: 0,
    entropy: 0,
    normalizedEntropy: 0,
    blochVector: [0, 0, 0],
    frameCount: 0,
    isDecoherenceEvent: false,
    blochDrift: 0,
  };
}

function clamp(v: number, min: number, max: number): number {
  return v < min ? min : v > max ? max : v;
}

function euclidean(a: [number, number, number], b: [number, number, number]): number {
  const dx = a[0] - b[0];
  const dy = a[1] - b[1];
  const dz = a[2] - b[2];
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

function round4(v: number): number {
  return Math.round(v * 10000) / 10000;
}

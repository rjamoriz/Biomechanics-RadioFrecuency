import { Injectable } from '@nestjs/common';

/** Validation status for biomechanics proxy metrics. */
export type ValidationStatus =
  | 'unvalidated'
  | 'experimental'
  | 'station_validated'
  | 'externally_validated';

/** Result of a single detected ground-contact phase. */
export interface GroundContactPhase {
  stanceStartMs: number;
  toeOffMs: number;
  stanceDurationMs: number;
  swingDurationMs: number;
  contactTimeMs: number;
  flightTimeMs: number;
  confidence: number;
  validationStatus: ValidationStatus;
}

interface TimestampedAmplitude {
  amplitude: number;
  timestampMs: number;
}

/**
 * Detects stance vs swing phase from CSI amplitude envelope.
 *
 * Uses absolute amplitude + low-pass smoothing as a Hilbert-like envelope,
 * then adaptive percentile thresholding to identify foot-strike (stance start)
 * and toe-off (swing start) events.
 *
 * All outputs are proxy metrics — not direct measurements.
 */
@Injectable()
export class GroundContactDetector {
  private readonly buffer: TimestampedAmplitude[] = [];
  private readonly maxBufferSize: number;
  private readonly smoothingWindowSize: number;
  private readonly minSnr: number;

  constructor(opts?: {
    maxBufferSize?: number;
    smoothingWindowSize?: number;
    minSnr?: number;
  }) {
    this.maxBufferSize = opts?.maxBufferSize ?? 600;
    this.smoothingWindowSize = opts?.smoothingWindowSize ?? 7;
    this.minSnr = opts?.minSnr ?? 3.0;
  }

  /** Push a new CSI amplitude sample with its timestamp. */
  addSample(amplitude: number, timestampMs: number): void {
    this.buffer.push({ amplitude: Math.abs(amplitude), timestampMs });
    if (this.buffer.length > this.maxBufferSize) {
      this.buffer.shift();
    }
  }

  /**
   * Detect ground-contact phases from the current amplitude buffer.
   * Returns an array of detected phases (may be empty if insufficient data or low SNR).
   */
  detect(): GroundContactPhase[] {
    if (this.buffer.length < 50) return [];

    const envelope = this.computeEnvelope();
    const snr = this.estimateSnr(envelope);
    if (snr < this.minSnr) return [];

    const threshold = this.adaptiveThreshold(envelope);
    const transitions = this.findTransitions(envelope, threshold);

    return this.buildPhases(transitions, snr);
  }

  /** Reset internal state. */
  reset(): void {
    this.buffer.length = 0;
  }

  // --- private helpers ---

  private computeEnvelope(): number[] {
    const raw = this.buffer.map((s) => s.amplitude);
    const halfWin = Math.floor(this.smoothingWindowSize / 2);
    const smoothed: number[] = [];

    for (let i = 0; i < raw.length; i++) {
      const lo = Math.max(0, i - halfWin);
      const hi = Math.min(raw.length - 1, i + halfWin);
      let sum = 0;
      for (let j = lo; j <= hi; j++) sum += raw[j];
      smoothed.push(sum / (hi - lo + 1));
    }

    return smoothed;
  }

  private estimateSnr(envelope: number[]): number {
    const mean = envelope.reduce((a, b) => a + b, 0) / envelope.length;
    const variance =
      envelope.reduce((s, v) => s + (v - mean) ** 2, 0) / envelope.length;
    const std = Math.sqrt(variance);
    if (std === 0) return 0;
    return mean / std;
  }

  private adaptiveThreshold(envelope: number[]): number {
    const sorted = [...envelope].sort((a, b) => a - b);
    const p25 = sorted[Math.floor(sorted.length * 0.25)];
    const p75 = sorted[Math.floor(sorted.length * 0.75)];
    return (p25 + p75) / 2;
  }

  private findTransitions(
    envelope: number[],
    threshold: number,
  ): { index: number; type: 'strike' | 'toeoff' }[] {
    const transitions: { index: number; type: 'strike' | 'toeoff' }[] = [];
    let aboveThreshold = envelope[0] >= threshold;

    for (let i = 1; i < envelope.length; i++) {
      const nowAbove = envelope[i] >= threshold;
      if (nowAbove && !aboveThreshold) {
        transitions.push({ index: i, type: 'strike' });
      } else if (!nowAbove && aboveThreshold) {
        transitions.push({ index: i, type: 'toeoff' });
      }
      aboveThreshold = nowAbove;
    }

    return transitions;
  }

  private buildPhases(
    transitions: { index: number; type: 'strike' | 'toeoff' }[],
    snr: number,
  ): GroundContactPhase[] {
    const phases: GroundContactPhase[] = [];

    for (let i = 0; i < transitions.length - 1; i++) {
      const curr = transitions[i];
      const next = transitions[i + 1];

      if (curr.type === 'strike' && next.type === 'toeoff') {
        const stanceStartMs = this.buffer[curr.index].timestampMs;
        const toeOffMs = this.buffer[next.index].timestampMs;
        const stanceDurationMs = toeOffMs - stanceStartMs;

        if (stanceDurationMs <= 0 || stanceDurationMs > 600) continue;

        // Look for the next strike to compute swing duration
        const nextStrike = transitions[i + 2];
        let swingDurationMs = 0;
        if (nextStrike?.type === 'strike') {
          swingDurationMs =
            this.buffer[nextStrike.index].timestampMs - toeOffMs;
          if (swingDurationMs <= 0 || swingDurationMs > 600) swingDurationMs = 0;
        }

        const contactTimeMs = stanceDurationMs;
        const flightTimeMs = swingDurationMs;

        // Confidence based on SNR and phase duration plausibility
        const durationPlausibility =
          stanceDurationMs >= 100 && stanceDurationMs <= 400 ? 1.0 : 0.5;
        const snrFactor = Math.min(1, snr / 10);
        const confidence =
          Math.round(snrFactor * 0.6 * durationPlausibility * 0.4 * 100) / 100 ||
          Math.round(Math.min(1, snrFactor * 0.6 + durationPlausibility * 0.4) * 100) / 100;

        phases.push({
          stanceStartMs,
          toeOffMs,
          stanceDurationMs,
          swingDurationMs,
          contactTimeMs,
          flightTimeMs,
          confidence: Math.round(Math.min(1, snrFactor * 0.6 + durationPlausibility * 0.4) * 100) / 100,
          validationStatus: 'unvalidated',
        });
      }
    }

    return phases;
  }
}

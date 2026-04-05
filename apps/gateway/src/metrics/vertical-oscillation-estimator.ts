import { Injectable } from '@nestjs/common';

/** Validation status for biomechanics proxy metrics. */
export type ValidationStatus =
  | 'unvalidated'
  | 'experimental'
  | 'station_validated'
  | 'externally_validated';

/** Result of a vertical oscillation estimation. Always tagged experimental. */
export interface VerticalOscillationEstimate {
  verticalOscillationCm: number;
  rawAmplitude: number;
  scalingFactor: number;
  confidence: number;
  /** Vertical oscillation from CSI is always experimental. */
  validationStatus: 'experimental';
}

/**
 * Estimates center-of-mass vertical oscillation from CSI amplitude envelope.
 *
 * Uses peak-to-trough analysis within each stride cycle, bandpass-filtered
 * around typical running stride frequency (1.2–3.5 Hz).
 *
 * A station-specific scaling factor converts raw amplitude swing to centimetres.
 * Without calibration, the scaling factor defaults to 1.0 and the output is a
 * dimensionless proxy.
 *
 * This metric is ALWAYS tagged as experimental — it is not directly measured.
 */
@Injectable()
export class VerticalOscillationEstimator {
  private readonly buffer: number[] = [];
  private readonly maxBufferSize: number;
  private scalingFactor: number;
  private readonly sampleRateHz: number;

  constructor(opts?: {
    maxBufferSize?: number;
    scalingFactor?: number;
    sampleRateHz?: number;
  }) {
    this.maxBufferSize = opts?.maxBufferSize ?? 500;
    this.scalingFactor = opts?.scalingFactor ?? 1.0;
    this.sampleRateHz = opts?.sampleRateHz ?? 100;
  }

  /** Update the station-specific scaling factor (e.g. from calibration). */
  setScalingFactor(factor: number): void {
    if (factor > 0) this.scalingFactor = factor;
  }

  /** Push a new absolute CSI amplitude sample. */
  addSample(amplitude: number): void {
    this.buffer.push(Math.abs(amplitude));
    if (this.buffer.length > this.maxBufferSize) {
      this.buffer.shift();
    }
  }

  /**
   * Estimate vertical oscillation from the current buffer.
   *
   * @param signalQuality Signal quality score (0–1) for confidence weighting
   */
  estimate(signalQuality = 1.0): VerticalOscillationEstimate | null {
    if (this.buffer.length < 60) return null;

    const filtered = this.bandpassFilter(this.buffer);
    const rawAmplitude = this.peakToTroughAmplitude(filtered);
    if (rawAmplitude <= 0) return null;

    const verticalOscillationCm =
      Math.round(rawAmplitude * this.scalingFactor * 100) / 100;

    // Confidence: penalise low signal quality and uncalibrated scaling
    const calibrationPenalty = this.scalingFactor === 1.0 ? 0.7 : 1.0;
    const confidence =
      Math.round(
        Math.min(1, signalQuality * 0.5 * calibrationPenalty + 0.2) * 100,
      ) / 100;

    return {
      verticalOscillationCm,
      rawAmplitude: Math.round(rawAmplitude * 1000) / 1000,
      scalingFactor: this.scalingFactor,
      confidence,
      validationStatus: 'experimental',
    };
  }

  /** Reset internal state. */
  reset(): void {
    this.buffer.length = 0;
  }

  // --- private helpers ---

  /**
   * Simple moving-average bandpass: subtract slow trend (LP at ~1 Hz)
   * then smooth at stride-frequency band (~1.2–3.5 Hz).
   */
  private bandpassFilter(data: number[]): number[] {
    // Low-pass to remove DC: window = sampleRate / 1.0 Hz
    const lpWindow = Math.max(3, Math.round(this.sampleRateHz / 1.0));
    const lowPassed = this.movingAverage(data, lpWindow);

    // Subtract DC to get oscillatory component
    const detrended = data.map((v, i) => v - lowPassed[i]);

    // Smooth at stride-frequency band: window ~ sampleRate / 3.5 Hz
    const bpWindow = Math.max(3, Math.round(this.sampleRateHz / 3.5));
    return this.movingAverage(detrended, bpWindow);
  }

  private movingAverage(data: number[], windowSize: number): number[] {
    const half = Math.floor(windowSize / 2);
    const result: number[] = [];
    for (let i = 0; i < data.length; i++) {
      const lo = Math.max(0, i - half);
      const hi = Math.min(data.length - 1, i + half);
      let sum = 0;
      for (let j = lo; j <= hi; j++) sum += data[j];
      result.push(sum / (hi - lo + 1));
    }
    return result;
  }

  private peakToTroughAmplitude(signal: number[]): number {
    let sumPeakTrough = 0;
    let cycles = 0;

    // Walk through the signal finding local peaks and troughs
    let i = 1;
    while (i < signal.length - 1) {
      // Find next peak
      while (i < signal.length - 1 && !(signal[i] > signal[i - 1] && signal[i] >= signal[i + 1])) i++;
      if (i >= signal.length - 1) break;
      const peak = signal[i];
      i++;

      // Find next trough
      while (i < signal.length - 1 && !(signal[i] < signal[i - 1] && signal[i] <= signal[i + 1])) i++;
      if (i >= signal.length - 1) break;
      const trough = signal[i];

      sumPeakTrough += peak - trough;
      cycles++;
      i++;
    }

    return cycles > 0 ? sumPeakTrough / cycles : 0;
  }
}

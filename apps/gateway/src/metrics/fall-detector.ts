import { Injectable } from '@nestjs/common';

/**
 * Detects potential fall events on a treadmill from CSI amplitude signals.
 *
 * Three-phase detection model:
 *   1. Normal running baseline (high-motion, stable variance)
 *   2. Sudden amplitude spike (impact exceeds 3σ over baseline)
 *   3. Variance drops to < 0.3× baseline within 2 seconds (stillness)
 *
 * This is a SAFETY-CRITICAL estimator. All outputs include confidence
 * and are marked 'experimental' — not a replacement for physical safety
 * systems (e.g., treadmill safety clip).
 */

// ─── Types ──────────────────────────────────────────────────────────

export type AlertLevel = 'warning' | 'critical';

export type ValidationStatus =
  | 'unvalidated'
  | 'experimental'
  | 'station_validated'
  | 'externally_validated';

export interface FallEvent {
  /** Timestamp of the detected impact (ms) */
  timestamp: number;
  /** Magnitude of the impact spike (amplitude units) */
  impactMagnitude: number;
  /** Rolling variance before impact */
  preImpactVariance: number;
  /** Rolling variance after impact (during stillness window) */
  postImpactVariance: number;
  /** Confidence in the detection [0, 1] */
  confidence: number;
  /** Alert severity */
  alertLevel: AlertLevel;
  /** Always 'experimental' */
  validationStatus: ValidationStatus;
}

export interface FallDetectorConfig {
  /** Rolling window size in ms for variance computation */
  varianceWindowMs?: number;
  /** Spike threshold in standard deviations above baseline */
  spikeThresholdSigma?: number;
  /** Post-impact stillness must be below this fraction of baseline variance */
  stillnessRatio?: number;
  /** Maximum time (ms) after spike to observe stillness */
  stillnessWindowMs?: number;
  /** Minimum time (ms) between fall alerts (debounce) */
  debouncePeriodMs?: number;
  /** Minimum samples before baseline is established */
  minBaselineSamples?: number;
}

// ─── Constants ──────────────────────────────────────────────────────

const DEFAULT_VARIANCE_WINDOW_MS = 1000;
const DEFAULT_SPIKE_SIGMA = 3.0;
const DEFAULT_STILLNESS_RATIO = 0.3;
const DEFAULT_STILLNESS_WINDOW_MS = 2000;
const DEFAULT_DEBOUNCE_MS = 10000;
const DEFAULT_MIN_BASELINE = 50;

// ─── State machine ──────────────────────────────────────────────────

type DetectorPhase = 'baseline' | 'spike_detected' | 'monitoring_stillness';

// ─── Implementation ─────────────────────────────────────────────────

@Injectable()
export class FallDetector {
  private readonly config: Required<FallDetectorConfig>;

  // Ring buffer for amplitude samples
  private readonly samples: { amplitude: number; timestampMs: number }[] = [];
  private readonly maxSamples = 500;

  // Baseline statistics (running)
  private baselineMean = 0;
  private baselineVariance = 0;
  private baselineCount = 0;

  // State machine
  private phase: DetectorPhase = 'baseline';
  private spikeTimestamp = 0;
  private spikeAmplitude = 0;
  private preImpactVariance = 0;

  // Debounce
  private lastAlertTimestamp = -Infinity;

  constructor(config?: FallDetectorConfig) {
    this.config = {
      varianceWindowMs: config?.varianceWindowMs ?? DEFAULT_VARIANCE_WINDOW_MS,
      spikeThresholdSigma: config?.spikeThresholdSigma ?? DEFAULT_SPIKE_SIGMA,
      stillnessRatio: config?.stillnessRatio ?? DEFAULT_STILLNESS_RATIO,
      stillnessWindowMs: config?.stillnessWindowMs ?? DEFAULT_STILLNESS_WINDOW_MS,
      debouncePeriodMs: config?.debouncePeriodMs ?? DEFAULT_DEBOUNCE_MS,
      minBaselineSamples: config?.minBaselineSamples ?? DEFAULT_MIN_BASELINE,
    };
  }

  /**
   * Process a single amplitude sample.
   *
   * @param amplitude CSI amplitude value
   * @param timestampMs Sample timestamp in milliseconds
   * @returns FallEvent if a fall is detected, null otherwise
   */
  processSample(amplitude: number, timestampMs: number): FallEvent | null {
    this.pushSample(amplitude, timestampMs);
    this.updateBaseline(amplitude);

    if (this.baselineCount < this.config.minBaselineSamples) {
      return null; // Not enough data for baseline
    }

    const baselineStd = Math.sqrt(this.baselineVariance);
    const rollingVariance = this.computeRollingVariance(timestampMs);

    switch (this.phase) {
      case 'baseline':
        return this.handleBaseline(amplitude, timestampMs, baselineStd, rollingVariance);

      case 'spike_detected':
      case 'monitoring_stillness':
        return this.handlePostSpike(timestampMs, rollingVariance);

      default:
        return null;
    }
  }

  /** Reset all internal state. */
  reset(): void {
    this.samples.length = 0;
    this.baselineMean = 0;
    this.baselineVariance = 0;
    this.baselineCount = 0;
    this.phase = 'baseline';
    this.spikeTimestamp = 0;
    this.spikeAmplitude = 0;
    this.preImpactVariance = 0;
    this.lastAlertTimestamp = -Infinity;
  }

  // ─── Private ────────────────────────────────────────────────────

  private pushSample(amplitude: number, timestampMs: number): void {
    this.samples.push({ amplitude, timestampMs });
    if (this.samples.length > this.maxSamples) {
      this.samples.shift();
    }
  }

  private updateBaseline(amplitude: number): void {
    // Welford's online algorithm for mean and variance
    this.baselineCount++;
    const delta = amplitude - this.baselineMean;
    this.baselineMean += delta / this.baselineCount;
    const delta2 = amplitude - this.baselineMean;
    this.baselineVariance +=
      (delta * delta2 - this.baselineVariance) / this.baselineCount;
  }

  private computeRollingVariance(currentTimestampMs: number): number {
    const windowStart = currentTimestampMs - this.config.varianceWindowMs;
    const windowSamples = this.samples.filter(
      (s) => s.timestampMs >= windowStart,
    );

    if (windowSamples.length < 3) return this.baselineVariance;

    const mean =
      windowSamples.reduce((sum, s) => sum + s.amplitude, 0) /
      windowSamples.length;

    let variance = 0;
    for (const s of windowSamples) {
      const d = s.amplitude - mean;
      variance += d * d;
    }
    variance /= windowSamples.length;

    return variance;
  }

  /** Compute rolling variance excluding the most recent sample (for pre-spike baseline). */
  private computeRollingVarianceExcluding(currentTimestampMs: number): number {
    const windowStart = currentTimestampMs - this.config.varianceWindowMs;
    const windowSamples = this.samples.filter(
      (s) => s.timestampMs >= windowStart && s.timestampMs < currentTimestampMs,
    );

    if (windowSamples.length < 3) return this.baselineVariance;

    const mean =
      windowSamples.reduce((sum, s) => sum + s.amplitude, 0) /
      windowSamples.length;

    let variance = 0;
    for (const s of windowSamples) {
      const d = s.amplitude - mean;
      variance += d * d;
    }
    variance /= windowSamples.length;

    return variance;
  }

  private handleBaseline(
    amplitude: number,
    timestampMs: number,
    baselineStd: number,
    rollingVariance: number,
  ): FallEvent | null {
    // Check for spike: amplitude exceeds mean + sigma * std
    if (Math.abs(amplitude - this.baselineMean) > this.config.spikeThresholdSigma * baselineStd) {
      this.phase = 'monitoring_stillness';
      this.spikeTimestamp = timestampMs;
      this.spikeAmplitude = amplitude;
      // Use pre-spike variance (exclude current spike from rolling window)
      this.preImpactVariance = this.computeRollingVarianceExcluding(timestampMs);
    }

    return null;
  }

  private handlePostSpike(
    timestampMs: number,
    rollingVariance: number,
  ): FallEvent | null {
    const elapsed = timestampMs - this.spikeTimestamp;

    // Stillness check window expired without detection
    if (elapsed > this.config.stillnessWindowMs) {
      this.phase = 'baseline';
      return null;
    }

    // Check for stillness: variance drops below threshold
    const varianceThreshold =
      this.preImpactVariance * this.config.stillnessRatio;

    if (rollingVariance < varianceThreshold && elapsed > this.config.varianceWindowMs) {
      // Fall detected — reset state and check debounce
      this.phase = 'baseline';

      if (timestampMs - this.lastAlertTimestamp < this.config.debouncePeriodMs) {
        return null; // Debounced
      }

      this.lastAlertTimestamp = timestampMs;

      const impactMagnitude = Math.abs(this.spikeAmplitude - this.baselineMean);
      const confidence = this.computeConfidence(
        impactMagnitude,
        this.preImpactVariance,
        rollingVariance,
      );

      return {
        timestamp: this.spikeTimestamp,
        impactMagnitude: round4(impactMagnitude),
        preImpactVariance: round4(this.preImpactVariance),
        postImpactVariance: round4(rollingVariance),
        confidence: round4(confidence),
        alertLevel: confidence >= 0.7 ? 'critical' : 'warning',
        validationStatus: 'experimental',
      };
    }

    return null;
  }

  private computeConfidence(
    impactMagnitude: number,
    preVariance: number,
    postVariance: number,
  ): number {
    const baselineStd = Math.sqrt(this.baselineVariance);

    // How many σ was the spike?
    const sigmaScore = baselineStd > 0
      ? Math.min(1, (impactMagnitude / baselineStd - this.config.spikeThresholdSigma) / 3)
      : 0;

    // How dramatic was the variance drop?
    const varianceDrop = preVariance > 0
      ? 1 - postVariance / preVariance
      : 0;

    // Weighted combination
    const raw = 0.4 * Math.max(0, sigmaScore) + 0.6 * Math.max(0, varianceDrop);
    return Math.max(0, Math.min(1, raw));
  }
}

// ─── Utils ──────────────────────────────────────────────────────────

function round4(v: number): number {
  return Math.round(v * 10000) / 10000;
}

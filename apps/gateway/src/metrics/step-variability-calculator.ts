import { Injectable } from '@nestjs/common';

/** Validation status for biomechanics proxy metrics. */
export type ValidationStatus =
  | 'unvalidated'
  | 'experimental'
  | 'station_validated'
  | 'externally_validated';

/** Per-step timing data used as input. */
export interface StepTiming {
  stepIntervalMs: number;
  stanceDurationMs?: number;
  swingDurationMs?: number;
  /** 'left' or 'right' if labeling is available. */
  side?: 'left' | 'right';
}

/** Full variability result computed over a rolling window. */
export interface StepVariabilityResult {
  stepIntervalMean: number;
  stepIntervalStd: number;
  stepIntervalCv: number;

  stanceTimeMean: number | null;
  stanceTimeStd: number | null;
  stanceTimeCv: number | null;

  swingTimeMean: number | null;
  swingTimeStd: number | null;
  swingTimeCv: number | null;

  strideTimeMean: number | null;
  strideTimeStd: number | null;
  strideTimeCv: number | null;

  /** Asymmetry index (0 = symmetric). Only set when left/right labels available. */
  leftRightAsymmetryIndex: number | null;

  /** Composite gait stability score (0–100, higher = more stable). */
  gaitStabilityScore: number;

  confidence: number;
  validationStatus: ValidationStatus;
  windowSize: number;
}

/**
 * Computes gait variability metrics from step-by-step timing data.
 *
 * Uses a rolling window (default: last 20 steps) to calculate coefficient of
 * variation (CV), means, standard deviations, and a composite gait stability
 * score.
 *
 * All outputs are proxy / estimated metrics.
 */
@Injectable()
export class StepVariabilityCalculator {
  private readonly steps: StepTiming[] = [];
  private readonly windowSize: number;

  constructor(opts?: { windowSize?: number }) {
    this.windowSize = opts?.windowSize ?? 20;
  }

  /** Add a new step timing entry. */
  addStep(step: StepTiming): void {
    this.steps.push(step);
    if (this.steps.length > this.windowSize * 2) {
      this.steps.splice(0, this.steps.length - this.windowSize * 2);
    }
  }

  /**
   * Compute variability metrics over the rolling window.
   *
   * @param signalQuality Signal quality score (0–1) for confidence weighting
   */
  compute(signalQuality = 1.0): StepVariabilityResult | null {
    const window = this.steps.slice(-this.windowSize);
    if (window.length < 3) return null;

    // Step interval stats
    const intervals = window.map((s) => s.stepIntervalMs);
    const stepIntervalMean = mean(intervals);
    const stepIntervalStd = std(intervals);
    const stepIntervalCv = cv(stepIntervalMean, stepIntervalStd);

    // Stance time stats (if available)
    const stanceTimes = window
      .map((s) => s.stanceDurationMs)
      .filter((v): v is number => v != null);
    const hasStance = stanceTimes.length >= 3;
    const stanceTimeMean = hasStance ? mean(stanceTimes) : null;
    const stanceTimeStd = hasStance ? std(stanceTimes) : null;
    const stanceTimeCv =
      stanceTimeMean != null && stanceTimeStd != null
        ? cv(stanceTimeMean, stanceTimeStd)
        : null;

    // Swing time stats (if available)
    const swingTimes = window
      .map((s) => s.swingDurationMs)
      .filter((v): v is number => v != null);
    const hasSwing = swingTimes.length >= 3;
    const swingTimeMean = hasSwing ? mean(swingTimes) : null;
    const swingTimeStd = hasSwing ? std(swingTimes) : null;
    const swingTimeCv =
      swingTimeMean != null && swingTimeStd != null
        ? cv(swingTimeMean, swingTimeStd)
        : null;

    // Stride time (= 2 consecutive steps) stats
    const strideTimes: number[] = [];
    for (let i = 0; i < intervals.length - 1; i += 2) {
      strideTimes.push(intervals[i] + intervals[i + 1]);
    }
    const hasStride = strideTimes.length >= 2;
    const strideTimeMean = hasStride ? mean(strideTimes) : null;
    const strideTimeStd = hasStride ? std(strideTimes) : null;
    const strideTimeCv =
      strideTimeMean != null && strideTimeStd != null
        ? cv(strideTimeMean, strideTimeStd)
        : null;

    // Left-right asymmetry index
    const leftRightAsymmetryIndex = this.computeAsymmetryIndex(window);

    // Gait stability score: lower CV = more stable, mapped to 0–100
    const gaitStabilityScore = this.computeStabilityScore(
      stepIntervalCv,
      stanceTimeCv,
      swingTimeCv,
    );

    // Confidence based on window fullness and signal quality
    const fullness = window.length / this.windowSize;
    const confidence =
      Math.round(Math.min(1, signalQuality * 0.5 + fullness * 0.5) * 100) / 100;

    return {
      stepIntervalMean: round2(stepIntervalMean),
      stepIntervalStd: round2(stepIntervalStd),
      stepIntervalCv: round2(stepIntervalCv),
      stanceTimeMean: stanceTimeMean != null ? round2(stanceTimeMean) : null,
      stanceTimeStd: stanceTimeStd != null ? round2(stanceTimeStd) : null,
      stanceTimeCv: stanceTimeCv != null ? round2(stanceTimeCv) : null,
      swingTimeMean: swingTimeMean != null ? round2(swingTimeMean) : null,
      swingTimeStd: swingTimeStd != null ? round2(swingTimeStd) : null,
      swingTimeCv: swingTimeCv != null ? round2(swingTimeCv) : null,
      strideTimeMean: strideTimeMean != null ? round2(strideTimeMean) : null,
      strideTimeStd: strideTimeStd != null ? round2(strideTimeStd) : null,
      strideTimeCv: strideTimeCv != null ? round2(strideTimeCv) : null,
      leftRightAsymmetryIndex,
      gaitStabilityScore,
      confidence,
      validationStatus: 'unvalidated',
      windowSize: window.length,
    };
  }

  /** Reset internal state. */
  reset(): void {
    this.steps.length = 0;
  }

  // --- private helpers ---

  private computeAsymmetryIndex(window: StepTiming[]): number | null {
    const left = window.filter((s) => s.side === 'left').map((s) => s.stepIntervalMs);
    const right = window.filter((s) => s.side === 'right').map((s) => s.stepIntervalMs);

    if (left.length < 2 || right.length < 2) return null;

    const leftMean = mean(left);
    const rightMean = mean(right);
    const maxMean = Math.max(leftMean, rightMean);
    if (maxMean === 0) return 0;

    return Math.round((Math.abs(leftMean - rightMean) / maxMean) * 1000) / 1000;
  }

  private computeStabilityScore(
    stepCv: number,
    stanceCv: number | null,
    swingCv: number | null,
  ): number {
    // Typical elite runner step CV ≈ 2–3%, recreational ≈ 4–8%
    // Map CV → score: 0% → 100, ≥15% → 0
    const stepScore = Math.max(0, Math.min(100, (1 - stepCv / 15) * 100));

    const components = [stepScore];
    if (stanceCv != null) {
      components.push(Math.max(0, Math.min(100, (1 - stanceCv / 15) * 100)));
    }
    if (swingCv != null) {
      components.push(Math.max(0, Math.min(100, (1 - swingCv / 15) * 100)));
    }

    const avg = components.reduce((a, b) => a + b, 0) / components.length;
    return Math.round(avg);
  }
}

// --- utility functions ---

function mean(values: number[]): number {
  return values.reduce((a, b) => a + b, 0) / values.length;
}

function std(values: number[]): number {
  const m = mean(values);
  const variance = values.reduce((s, v) => s + (v - m) ** 2, 0) / values.length;
  return Math.sqrt(variance);
}

function cv(meanVal: number, stdVal: number): number {
  if (meanVal === 0) return 0;
  return (stdVal / meanVal) * 100;
}

function round2(v: number): number {
  return Math.round(v * 100) / 100;
}

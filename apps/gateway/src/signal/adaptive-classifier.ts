/**
 * Adaptive Online Classifier — Per-Athlete Baseline Learning
 *
 * Learns each athlete's personal cadence range, typical symmetry, and contact
 * time patterns during a warmup phase, then detects deviations from THEIR
 * baseline rather than relying on population averages.
 *
 * Uses Welford's online algorithm for running mean/variance and linear
 * regression for session drift detection (fatigue signature).
 *
 * All outputs are estimated proxy metrics — not clinical-grade measurements.
 */

// ─── Constants ──────────────────────────────────────────────────────

export const DEFAULT_WARMUP_FRAMES = 300; // ~30s at 10Hz
export const DEFAULT_ANOMALY_THRESHOLD = 2.0; // z-score
export const DEFAULT_DRIFT_WINDOW = 600; // ~60s at 10Hz

export const METRICS_TO_TRACK = [
  'estimatedCadence',
  'stepIntervalEstimate',
  'symmetryProxy',
  'contactTimeProxy',
  'flightTimeProxy',
  'fatigueDriftScore',
] as const;

export type TrackableMetric = (typeof METRICS_TO_TRACK)[number];

// ─── Types ──────────────────────────────────────────────────────────

export interface MetricBaseline {
  mean: number;
  std: number;
  min: number;
  max: number;
}

export interface AthleteProfile {
  athleteId: string;
  metricBaselines: Record<string, MetricBaseline>;
  warmupFrames: number;
  sessionStartTimestamp: number;
  isWarmupComplete: boolean;
}

export interface DeviationInfo {
  zScore: number;
  percentile: number;
  isAnomaly: boolean;
  direction: 'above' | 'below' | 'normal';
}

export interface AdaptiveClassification {
  deviations: Record<string, DeviationInfo>;
  baselineEstablished: boolean;
  warmupProgress: number;
  overallAnomalyScore: number;
  profile: AthleteProfile;
  sessionDrift: Record<string, number>;
}

export interface AdaptiveClassifierConfig {
  warmupFrames: number;
  anomalyThreshold: number;
  driftWindowSize: number;
  metricsToTrack: readonly string[];
}

// ─── Helpers ────────────────────────────────────────────────────────

function round4(v: number): number {
  return Math.round(v * 10_000) / 10_000;
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

/**
 * Approximate percentile from z-score using the error function approximation.
 * Uses Abramowitz and Stegun approximation for the normal CDF.
 */
function zToPercentile(z: number): number {
  // Approximate Φ(z) via logistic approximation: Φ(z) ≈ 1/(1+exp(-1.7*z))
  const p = 1 / (1 + Math.exp(-1.7 * z));
  return clamp(round4(p * 100), 0, 100);
}

/**
 * Simple linear regression slope via least-squares.
 */
function linearSlope(values: number[]): number {
  const n = values.length;
  if (n < 2) return 0;

  let sumX = 0;
  let sumY = 0;
  let sumXY = 0;
  let sumX2 = 0;

  for (let i = 0; i < n; i++) {
    sumX += i;
    sumY += values[i];
    sumXY += i * values[i];
    sumX2 += i * i;
  }

  const denom = n * sumX2 - sumX * sumX;
  if (Math.abs(denom) < 1e-12) return 0;

  return (n * sumXY - sumX * sumY) / denom;
}

// ─── Welford Accumulator ────────────────────────────────────────────

interface WelfordState {
  count: number;
  mean: number;
  m2: number;
  min: number;
  max: number;
}

function welfordInit(): WelfordState {
  return { count: 0, mean: 0, m2: 0, min: Infinity, max: -Infinity };
}

function welfordUpdate(state: WelfordState, value: number): void {
  state.count++;
  const delta = value - state.mean;
  state.mean += delta / state.count;
  const delta2 = value - state.mean;
  state.m2 += delta * delta2;
  if (value < state.min) state.min = value;
  if (value > state.max) state.max = value;
}

function welfordVariance(state: WelfordState): number {
  return state.count < 2 ? 0 : state.m2 / state.count;
}

function welfordStd(state: WelfordState): number {
  return Math.sqrt(welfordVariance(state));
}

// ─── Implementation ─────────────────────────────────────────────────

export class AdaptiveOnlineClassifier {
  private readonly athleteId: string;
  private readonly config: AdaptiveClassifierConfig;

  // Warmup accumulators (Welford per metric)
  private warmupAccumulators: Map<string, WelfordState> = new Map();
  private warmupCount = 0;

  // Frozen baseline after warmup
  private baseline: Record<string, MetricBaseline> | null = null;
  private sessionStartTimestamp = 0;

  // Drift detection: circular buffer of recent metric values
  private driftBuffers: Map<string, number[]> = new Map();
  private driftBufferIndex = 0;
  private driftBufferCount = 0;

  constructor(
    athleteId: string,
    config?: Partial<AdaptiveClassifierConfig>,
  ) {
    this.athleteId = athleteId;
    this.config = {
      warmupFrames: config?.warmupFrames ?? DEFAULT_WARMUP_FRAMES,
      anomalyThreshold: config?.anomalyThreshold ?? DEFAULT_ANOMALY_THRESHOLD,
      driftWindowSize: config?.driftWindowSize ?? DEFAULT_DRIFT_WINDOW,
      metricsToTrack: config?.metricsToTrack ?? METRICS_TO_TRACK,
    };

    this.initAccumulators();
  }

  /**
   * Process a new metric snapshot and classify deviations.
   */
  classify(metrics: Record<string, number>, timestamp: number): AdaptiveClassification {
    if (this.sessionStartTimestamp === 0) {
      this.sessionStartTimestamp = timestamp;
    }

    // During warmup: accumulate statistics
    if (!this.baseline) {
      this.accumulateWarmup(metrics);

      // Check if warmup just completed
      if (this.warmupCount >= this.config.warmupFrames) {
        this.freezeBaseline();
      }
    }

    // Update drift buffer (even during warmup, post-baseline)
    if (this.baseline) {
      this.updateDriftBuffer(metrics);
    }

    return this.buildClassification(metrics);
  }

  /** Export current athlete profile (for persistence) */
  exportProfile(): AthleteProfile {
    const baselines: Record<string, MetricBaseline> = {};

    if (this.baseline) {
      Object.assign(baselines, this.baseline);
    } else {
      // Export current warmup state
      for (const metric of this.config.metricsToTrack) {
        const acc = this.warmupAccumulators.get(metric);
        if (acc && acc.count > 0) {
          baselines[metric] = {
            mean: round4(acc.mean),
            std: round4(welfordStd(acc)),
            min: round4(acc.min),
            max: round4(acc.max),
          };
        }
      }
    }

    return {
      athleteId: this.athleteId,
      metricBaselines: baselines,
      warmupFrames: this.warmupCount,
      sessionStartTimestamp: this.sessionStartTimestamp,
      isWarmupComplete: this.baseline !== null,
    };
  }

  /** Import a previously saved profile (skip warmup) */
  importProfile(profile: AthleteProfile): void {
    if (profile.isWarmupComplete && Object.keys(profile.metricBaselines).length > 0) {
      this.baseline = { ...profile.metricBaselines };
      this.warmupCount = profile.warmupFrames;
      this.sessionStartTimestamp = profile.sessionStartTimestamp;
    }
  }

  /** Whether baseline warmup is complete */
  isReady(): boolean {
    return this.baseline !== null;
  }

  /** Get warmup progress [0, 1] */
  getWarmupProgress(): number {
    return round4(clamp(this.warmupCount / this.config.warmupFrames, 0, 1));
  }

  reset(): void {
    this.warmupAccumulators.clear();
    this.warmupCount = 0;
    this.baseline = null;
    this.sessionStartTimestamp = 0;
    this.driftBuffers.clear();
    this.driftBufferIndex = 0;
    this.driftBufferCount = 0;
    this.initAccumulators();
  }

  // ─── Private ────────────────────────────────────────────────────

  private initAccumulators(): void {
    for (const metric of this.config.metricsToTrack) {
      this.warmupAccumulators.set(metric, welfordInit());
      this.driftBuffers.set(metric, new Array(this.config.driftWindowSize).fill(0));
    }
  }

  private accumulateWarmup(metrics: Record<string, number>): void {
    for (const metric of this.config.metricsToTrack) {
      const value = metrics[metric] ?? 0;
      const acc = this.warmupAccumulators.get(metric)!;
      welfordUpdate(acc, value);
    }
    this.warmupCount++;
  }

  private freezeBaseline(): void {
    this.baseline = {};
    for (const metric of this.config.metricsToTrack) {
      const acc = this.warmupAccumulators.get(metric)!;
      this.baseline[metric] = {
        mean: round4(acc.mean),
        std: round4(welfordStd(acc)),
        min: round4(acc.min === Infinity ? 0 : acc.min),
        max: round4(acc.max === -Infinity ? 0 : acc.max),
      };
    }
  }

  private updateDriftBuffer(metrics: Record<string, number>): void {
    for (const metric of this.config.metricsToTrack) {
      const buf = this.driftBuffers.get(metric)!;
      buf[this.driftBufferIndex] = metrics[metric] ?? 0;
    }
    this.driftBufferIndex = (this.driftBufferIndex + 1) % this.config.driftWindowSize;
    if (this.driftBufferCount < this.config.driftWindowSize) this.driftBufferCount++;
  }

  private computeDrift(): Record<string, number> {
    const drift: Record<string, number> = {};
    if (this.driftBufferCount < 10) {
      // Not enough data for meaningful drift
      for (const metric of this.config.metricsToTrack) {
        drift[metric] = 0;
      }
      return drift;
    }

    for (const metric of this.config.metricsToTrack) {
      const buf = this.driftBuffers.get(metric)!;
      // Get the oldest-first ordered values from circular buffer
      const count = Math.min(this.driftBufferCount, this.config.driftWindowSize);
      const ordered: number[] = [];
      const start = this.driftBufferCount <= this.config.driftWindowSize
        ? 0
        : this.driftBufferIndex;
      for (let i = 0; i < count; i++) {
        ordered.push(buf[(start + i) % this.config.driftWindowSize]);
      }
      drift[metric] = round4(linearSlope(ordered));
    }

    return drift;
  }

  private buildClassification(metrics: Record<string, number>): AdaptiveClassification {
    const deviations: Record<string, DeviationInfo> = {};
    let maxAbsZ = 0;

    for (const metric of this.config.metricsToTrack) {
      if (!this.baseline) {
        deviations[metric] = {
          zScore: 0,
          percentile: 50,
          isAnomaly: false,
          direction: 'normal',
        };
        continue;
      }

      const bl = this.baseline[metric];
      const value = metrics[metric] ?? 0;

      let zScore = 0;
      if (bl.std > 1e-6) {
        zScore = (value - bl.mean) / bl.std;
      }

      const absZ = Math.abs(zScore);
      if (absZ > maxAbsZ) maxAbsZ = absZ;

      let direction: 'above' | 'below' | 'normal' = 'normal';
      if (zScore > this.config.anomalyThreshold) direction = 'above';
      else if (zScore < -this.config.anomalyThreshold) direction = 'below';

      deviations[metric] = {
        zScore: round4(zScore),
        percentile: zToPercentile(zScore),
        isAnomaly: absZ > this.config.anomalyThreshold,
        direction,
      };
    }

    // Normalize overall anomaly to [0, 1] — using sigmoid-like mapping
    const overallAnomalyScore = round4(clamp(maxAbsZ / (this.config.anomalyThreshold * 2), 0, 1));

    return {
      deviations,
      baselineEstablished: this.baseline !== null,
      warmupProgress: this.getWarmupProgress(),
      overallAnomalyScore,
      profile: this.exportProfile(),
      sessionDrift: this.computeDrift(),
    };
  }
}

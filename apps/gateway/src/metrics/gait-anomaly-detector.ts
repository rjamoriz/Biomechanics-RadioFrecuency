import { Injectable } from '@nestjs/common';

/**
 * Detects anomalous gait patterns by maintaining a rolling baseline
 * and flagging metrics that deviate beyond configurable thresholds.
 *
 * Monitored metrics (all are proxy estimates, not clinical measurements):
 *   - cadence (steps/min)
 *   - step interval coefficient of variation
 *   - asymmetry proxy
 *   - contact time proxy (ms)
 *
 * Detection activates only after a minimum baseline window (default: 30 strides).
 * All outputs carry 'experimental' validation status.
 */

// ─── Types ──────────────────────────────────────────────────────────

export type AnomalyType =
  | 'cadence_drop'
  | 'cadence_spike'
  | 'asymmetry_increase'
  | 'variability_increase'
  | 'contact_time_drift'
  | 'form_degradation';

export type Severity = 'mild' | 'moderate' | 'severe';

export type ValidationStatus =
  | 'unvalidated'
  | 'experimental'
  | 'station_validated'
  | 'externally_validated';

export interface GaitAnomaly {
  /** Anomaly classification */
  type: AnomalyType;
  /** Which metric triggered the anomaly */
  metric: string;
  /** Current value of the metric */
  currentValue: number;
  /** Baseline rolling mean for this metric */
  baselineMean: number;
  /** Baseline rolling std for this metric */
  baselineStd: number;
  /** How many std deviations from baseline */
  zScore: number;
  /** Timestamp of the anomaly (ms) */
  timestamp: number;
  /** Severity classification */
  severity: Severity;
  /** Human-readable description */
  message: string;
  /** Confidence [0, 1] */
  confidence: number;
  /** Always 'experimental' */
  validationStatus: ValidationStatus;
}

export interface GaitMetricsSample {
  /** Estimated cadence (steps/min) */
  cadence: number;
  /** Step interval coefficient of variation [0, 1] */
  stepIntervalCV: number;
  /** Asymmetry proxy [0, 1] where 0 = perfect symmetry */
  asymmetry: number;
  /** Contact time proxy in ms */
  contactTimeMs: number;
  /** Sample timestamp (ms) */
  timestampMs: number;
}

export interface GaitAnomalyDetectorConfig {
  /** Z-score threshold for anomaly detection (default 2.5) */
  zScoreThreshold?: number;
  /** Minimum strides before baseline is established */
  minBaselineStrides?: number;
  /** Maximum baseline window size (strides) for rolling stats */
  maxBaselineWindow?: number;
}

// ─── Constants ──────────────────────────────────────────────────────

const DEFAULT_Z_THRESHOLD = 2.5;
const DEFAULT_MIN_BASELINE = 30;
const DEFAULT_MAX_WINDOW = 200;

/** Mapping from metric name to anomaly type(s). */
const METRIC_ANOMALY_MAP: Record<string, { low?: AnomalyType; high?: AnomalyType }> = {
  cadence: { low: 'cadence_drop', high: 'cadence_spike' },
  stepIntervalCV: { high: 'variability_increase' },
  asymmetry: { high: 'asymmetry_increase' },
  contactTimeMs: { low: 'contact_time_drift', high: 'contact_time_drift' },
};

// ─── Implementation ─────────────────────────────────────────────────

@Injectable()
export class GaitAnomalyDetector {
  private readonly config: Required<GaitAnomalyDetectorConfig>;
  private readonly history: Record<string, number[]> = {
    cadence: [],
    stepIntervalCV: [],
    asymmetry: [],
    contactTimeMs: [],
  };
  private strideCount = 0;
  private baselineReady = false;

  constructor(config?: GaitAnomalyDetectorConfig) {
    this.config = {
      zScoreThreshold: config?.zScoreThreshold ?? DEFAULT_Z_THRESHOLD,
      minBaselineStrides: config?.minBaselineStrides ?? DEFAULT_MIN_BASELINE,
      maxBaselineWindow: config?.maxBaselineWindow ?? DEFAULT_MAX_WINDOW,
    };
  }

  /**
   * Process a new gait metrics sample and check for anomalies.
   *
   * @returns Array of detected anomalies (may be empty)
   */
  processSample(sample: GaitMetricsSample): GaitAnomaly[] {
    this.strideCount++;

    this.pushMetric('cadence', sample.cadence);
    this.pushMetric('stepIntervalCV', sample.stepIntervalCV);
    this.pushMetric('asymmetry', sample.asymmetry);
    this.pushMetric('contactTimeMs', sample.contactTimeMs);

    if (this.strideCount < this.config.minBaselineStrides) {
      return []; // Still establishing baseline
    }

    this.baselineReady = true;

    const anomalies: GaitAnomaly[] = [];

    this.checkMetric('cadence', sample.cadence, sample.timestampMs, anomalies);
    this.checkMetric('stepIntervalCV', sample.stepIntervalCV, sample.timestampMs, anomalies);
    this.checkMetric('asymmetry', sample.asymmetry, sample.timestampMs, anomalies);
    this.checkMetric('contactTimeMs', sample.contactTimeMs, sample.timestampMs, anomalies);

    // Composite form degradation: if >= 2 metrics are anomalous
    if (anomalies.length >= 2) {
      const worstZ = Math.max(...anomalies.map((a) => Math.abs(a.zScore)));
      anomalies.push({
        type: 'form_degradation',
        metric: 'composite',
        currentValue: anomalies.length,
        baselineMean: 0,
        baselineStd: 0,
        zScore: round4(worstZ),
        timestamp: sample.timestampMs,
        severity: this.classifySeverity(worstZ),
        message: `Estimated form degradation: ${anomalies.length} metrics outside baseline (experimental proxy)`,
        confidence: round4(Math.min(1, worstZ / 5)),
        validationStatus: 'experimental',
      });
    }

    return anomalies;
  }

  /** Whether the baseline has been established. */
  isBaselineReady(): boolean {
    return this.baselineReady;
  }

  /** Current stride count. */
  getStrideCount(): number {
    return this.strideCount;
  }

  /** Reset all state. */
  reset(): void {
    for (const key of Object.keys(this.history)) {
      this.history[key] = [];
    }
    this.strideCount = 0;
    this.baselineReady = false;
  }

  // ─── Private ────────────────────────────────────────────────────

  private pushMetric(name: string, value: number): void {
    const arr = this.history[name];
    arr.push(value);
    if (arr.length > this.config.maxBaselineWindow) {
      arr.shift();
    }
  }

  private checkMetric(
    name: string,
    currentValue: number,
    timestampMs: number,
    anomalies: GaitAnomaly[],
  ): void {
    const values = this.history[name];
    // Use all values except the most recent (which is the current sample)
    const baselineValues = values.slice(0, -1);
    if (baselineValues.length < this.config.minBaselineStrides) return;

    const mean = computeMean(baselineValues);
    const std = computeStd(baselineValues, mean);

    if (std < 1e-9) return; // No variance in baseline — skip

    const zScore = (currentValue - mean) / std;
    const absZ = Math.abs(zScore);

    if (absZ < this.config.zScoreThreshold) return;

    const mapping = METRIC_ANOMALY_MAP[name];
    if (!mapping) return;

    const type =
      zScore < 0
        ? mapping.low ?? mapping.high!
        : mapping.high ?? mapping.low!;

    const severity = this.classifySeverity(absZ);
    const confidence = round4(Math.min(1, absZ / 5));

    anomalies.push({
      type,
      metric: name,
      currentValue: round4(currentValue),
      baselineMean: round4(mean),
      baselineStd: round4(std),
      zScore: round4(zScore),
      timestamp: timestampMs,
      severity,
      message: `Estimated ${name} anomaly: ${round4(currentValue)} is ${round4(absZ)}σ from baseline ${round4(mean)} (experimental proxy)`,
      confidence,
      validationStatus: 'experimental',
    });
  }

  private classifySeverity(absZ: number): Severity {
    if (absZ >= 4.0) return 'severe';
    if (absZ >= 3.0) return 'moderate';
    return 'mild';
  }
}

// ─── Utils ──────────────────────────────────────────────────────────

function computeMean(values: number[]): number {
  return values.reduce((s, v) => s + v, 0) / values.length;
}

function computeStd(values: number[], mean: number): number {
  if (values.length < 2) return 0;
  const variance =
    values.reduce((s, v) => s + (v - mean) ** 2, 0) / values.length;
  return Math.sqrt(variance);
}

function round4(v: number): number {
  return Math.round(v * 10000) / 10000;
}

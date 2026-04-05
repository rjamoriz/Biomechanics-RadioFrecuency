/**
 * Cross-Viewpoint Fusion — Multi-Station Metric Consensus
 *
 * Fuses metric observations from multiple ESP32 stations monitoring the
 * same treadmill using quality-weighted averaging with outlier rejection.
 *
 * All fused outputs remain estimated proxy metrics — not clinical-grade.
 */

// ─── Constants ──────────────────────────────────────────────────────

export const DEFAULT_OUTLIER_SIGMA = 2.0;
export const MIN_STATIONS_FOR_OUTLIER_DETECTION = 3;

export const METRICS_TO_FUSE = [
  'estimatedCadence',
  'stepIntervalEstimate',
  'symmetryProxy',
  'contactTimeProxy',
  'flightTimeProxy',
  'fatigueDriftScore',
] as const;

export type FusableMetric = (typeof METRICS_TO_FUSE)[number];

// ─── Types ──────────────────────────────────────────────────────────

export interface StationObservation {
  stationId: string;
  metrics: Record<string, number>;
  signalQuality: number;
  fresnelZoneMargin: number;
  gateAcceptanceRate: number;
  timestamp: number;
}

export interface FusedMetrics {
  estimatedCadence: number;
  stepIntervalEstimate: number;
  symmetryProxy: number;
  contactTimeProxy: number;
  flightTimeProxy: number;
  fatigueDriftScore: number;
  signalQualityScore: number;
  consensusConfidence: number;
  metricAgreement: Record<string, number>;
  stationWeights: Record<string, number>;
  stationCount: number;
  outlierStations: string[];
  timestamp: number;
}

// ─── Helpers ────────────────────────────────────────────────────────

function round4(v: number): number {
  return Math.round(v * 10_000) / 10_000;
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

// ─── Implementation ─────────────────────────────────────────────────

export class CrossViewpointFusion {
  private readonly outlierSigma: number;

  constructor(outlierSigma: number = DEFAULT_OUTLIER_SIGMA) {
    this.outlierSigma = outlierSigma;
  }

  /**
   * Fuse observations from multiple stations into a consensus metric set.
   */
  fuse(observations: StationObservation[]): FusedMetrics {
    if (observations.length === 0) {
      return this.emptyResult(Date.now());
    }

    if (observations.length === 1) {
      return this.fuseSingle(observations[0]);
    }

    const timestamp = Math.max(...observations.map((o) => o.timestamp));

    // Compute raw quality weights
    const rawWeights = new Map<string, number>();
    for (const obs of observations) {
      const w = Math.max(obs.signalQuality, 0) *
        Math.max(obs.fresnelZoneMargin, 0) *
        Math.max(obs.gateAcceptanceRate, 0);
      rawWeights.set(obs.stationId, w);
    }

    // Outlier detection per metric (only with 3+ stations)
    const outlierStations = new Set<string>();
    if (observations.length >= MIN_STATIONS_FOR_OUTLIER_DETECTION) {
      for (const metric of METRICS_TO_FUSE) {
        const values = observations.map((o) => o.metrics[metric] ?? 0);
        const weights = observations.map((o) => rawWeights.get(o.stationId) ?? 0);
        const { outlierIndices } = this.detectOutliers(values, weights);
        for (const idx of outlierIndices) {
          outlierStations.add(observations[idx].stationId);
        }
      }
    }

    // Adjust weights: outliers get 0.1× their original weight
    const adjustedWeights = new Map<string, number>();
    for (const obs of observations) {
      const raw = rawWeights.get(obs.stationId) ?? 0;
      const adjusted = outlierStations.has(obs.stationId) ? raw * 0.1 : raw;
      adjustedWeights.set(obs.stationId, adjusted);
    }

    // Normalize weights
    const totalWeight = Array.from(adjustedWeights.values()).reduce((a, b) => a + b, 0);
    const normalizedWeights: Record<string, number> = {};
    for (const [id, w] of adjustedWeights) {
      normalizedWeights[id] = totalWeight > 0 ? round4(w / totalWeight) : round4(1 / observations.length);
    }

    // Weighted fusion per metric
    const fusedValues: Record<string, number> = {};
    const metricAgreement: Record<string, number> = {};

    for (const metric of METRICS_TO_FUSE) {
      let wSum = 0;
      let vSum = 0;
      const values: number[] = [];

      for (const obs of observations) {
        const val = obs.metrics[metric] ?? 0;
        const w = adjustedWeights.get(obs.stationId) ?? 0;
        vSum += w * val;
        wSum += w;
        values.push(val);
      }

      fusedValues[metric] = wSum > 0 ? round4(vSum / wSum) : 0;

      // Agreement: 1 - CV (coefficient of variation)
      const mean = values.reduce((a, b) => a + b, 0) / values.length;
      const variance = values.reduce((a, v) => a + (v - mean) ** 2, 0) / values.length;
      const std = Math.sqrt(variance);
      const cv = Math.abs(mean) > 1e-6 ? std / Math.abs(mean) : (std > 1e-6 ? 1 : 0);
      metricAgreement[metric] = round4(clamp(1 - cv, 0, 1));
    }

    // Fused signal quality
    let sqSum = 0;
    let sqWsum = 0;
    for (const obs of observations) {
      const w = adjustedWeights.get(obs.stationId) ?? 0;
      sqSum += w * obs.signalQuality;
      sqWsum += w;
    }
    const fusedSignalQuality = sqWsum > 0 ? round4(sqSum / sqWsum) : 0;

    // Consensus confidence: average of per-metric agreements
    const agreementValues = Object.values(metricAgreement);
    const consensusConfidence = round4(
      agreementValues.reduce((a, b) => a + b, 0) / agreementValues.length,
    );

    return {
      estimatedCadence: fusedValues.estimatedCadence ?? 0,
      stepIntervalEstimate: fusedValues.stepIntervalEstimate ?? 0,
      symmetryProxy: fusedValues.symmetryProxy ?? 0,
      contactTimeProxy: fusedValues.contactTimeProxy ?? 0,
      flightTimeProxy: fusedValues.flightTimeProxy ?? 0,
      fatigueDriftScore: fusedValues.fatigueDriftScore ?? 0,
      signalQualityScore: fusedSignalQuality,
      consensusConfidence,
      metricAgreement,
      stationWeights: normalizedWeights,
      stationCount: observations.length,
      outlierStations: [...outlierStations],
      timestamp,
    };
  }

  /**
   * Single observation passthrough — wraps one station's data as a fusion result.
   */
  fuseSingle(obs: StationObservation): FusedMetrics {
    return {
      estimatedCadence: obs.metrics.estimatedCadence ?? 0,
      stepIntervalEstimate: obs.metrics.stepIntervalEstimate ?? 0,
      symmetryProxy: obs.metrics.symmetryProxy ?? 0,
      contactTimeProxy: obs.metrics.contactTimeProxy ?? 0,
      flightTimeProxy: obs.metrics.flightTimeProxy ?? 0,
      fatigueDriftScore: obs.metrics.fatigueDriftScore ?? 0,
      signalQualityScore: obs.signalQuality,
      consensusConfidence: 1,
      metricAgreement: Object.fromEntries(METRICS_TO_FUSE.map((m) => [m, 1])),
      stationWeights: { [obs.stationId]: 1 },
      stationCount: 1,
      outlierStations: [],
      timestamp: obs.timestamp,
    };
  }

  reset(): void {
    // Stateless — nothing to reset, but maintain interface parity
  }

  // ─── Private ────────────────────────────────────────────────────

  private detectOutliers(
    values: number[],
    weights: number[],
  ): { outlierIndices: number[] } {
    // Weighted mean
    let wSum = 0;
    let vSum = 0;
    for (let i = 0; i < values.length; i++) {
      wSum += weights[i];
      vSum += weights[i] * values[i];
    }
    const wMean = wSum > 0 ? vSum / wSum : 0;

    // Weighted std
    let varSum = 0;
    for (let i = 0; i < values.length; i++) {
      varSum += weights[i] * (values[i] - wMean) ** 2;
    }
    const wStd = wSum > 0 ? Math.sqrt(varSum / wSum) : 0;

    if (wStd < 1e-9) return { outlierIndices: [] };

    const outlierIndices: number[] = [];
    for (let i = 0; i < values.length; i++) {
      if (Math.abs(values[i] - wMean) > this.outlierSigma * wStd) {
        outlierIndices.push(i);
      }
    }

    return { outlierIndices };
  }

  private emptyResult(timestamp: number): FusedMetrics {
    return {
      estimatedCadence: 0,
      stepIntervalEstimate: 0,
      symmetryProxy: 0,
      contactTimeProxy: 0,
      flightTimeProxy: 0,
      fatigueDriftScore: 0,
      signalQualityScore: 0,
      consensusConfidence: 0,
      metricAgreement: {},
      stationWeights: {},
      stationCount: 0,
      outlierStations: [],
      timestamp,
    };
  }
}

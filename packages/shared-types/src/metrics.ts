import { ValidationStatus, ConfidenceLevel } from './common';

/* ──────────────────────────────────────────────
 * Realtime proxy metrics computed by the gateway.
 * ────────────────────────────────────────────── */

export interface RealtimeMetrics {
  sessionId: string;
  timestamp: number;

  /** Estimated cadence (steps/min). */
  estimatedCadence: number;
  /** Estimated step interval (ms). */
  stepIntervalEstimate: number;
  /** Step interval variability — coefficient of variation. */
  stepIntervalVariability: number;
  /** Left-right symmetry proxy (0–1, 1 = perfect symmetry). */
  symmetryProxy: number;
  /** Ground contact-time proxy (ms). */
  contactTimeProxy: number;
  /** Estimated flight-time proxy (ms). */
  flightTimeProxy: number;
  /** Form stability score (0–1). */
  formStabilityScore: number;
  /** Fatigue drift score (0–1, 0 = no drift). */
  fatigueDriftScore: number;

  /** Signal quality (0–1). */
  signalQualityScore: number;
  /** Overall metric confidence (0–1). */
  metricConfidence: number;
  /** Confidence classification. */
  confidenceLevel: ConfidenceLevel;
  /** Validation status of these estimates. */
  validationStatus: ValidationStatus;

  /** Current treadmill speed. */
  speedKmh?: number;
  /** Current treadmill incline. */
  inclinePercent?: number;
}

/* ──────────────────────────────────────────────
 * Persisted derived metric series.
 * ────────────────────────────────────────────── */

export interface MetricDataPoint {
  t: number;
  v: number;
}

export interface DerivedMetricSeries {
  id: string;
  sessionId: string;
  metricName: string;
  unit: string;
  dataPoints: MetricDataPoint[];
  confidence: number;
  signalQuality: number;
  validationStatus: ValidationStatus;
  createdAt: string;
}

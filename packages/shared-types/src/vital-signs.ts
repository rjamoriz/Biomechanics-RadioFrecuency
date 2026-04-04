import { ValidationStatus, ConfidenceLevel } from './common';

/* ──────────────────────────────────────────────
 * Vital signs estimated from Wi-Fi CSI phase.
 *
 * IMPORTANT: These are proxy metrics, NOT clinical
 * measurements. Always expose confidence and
 * validation status to the consumer.
 * ────────────────────────────────────────────── */

/**
 * A single vital sign estimate (breathing or heart rate).
 */
export interface VitalEstimate {
  /** Estimated rate in beats/breaths per minute. */
  estimatedBpm: number;
  /** Model confidence (0–1). */
  confidence: number;
  /** Confidence classification. */
  confidenceLevel: ConfidenceLevel;
  /** Number of subcarriers contributing to this estimate. */
  subcarriersUsed: number;
  /** Label: 'breathing' | 'heartRate'. */
  label: string;
  /** Validation state. */
  validationStatus: ValidationStatus;
}

/**
 * Full vital signs snapshot from the gateway.
 */
export interface VitalSignsSnapshot {
  timestamp: number;
  /** Estimated breathing rate (6–30 BPM band). */
  breathing: VitalEstimate | null;
  /** Estimated heart rate (48–120 BPM band). */
  heartRate: VitalEstimate | null;
  /** Total CSI packets processed. */
  sampleCount: number;
  /** Buffer fill ratio (0–1). */
  bufferFill: number;
}

/**
 * WebSocket event payload for vital signs streaming.
 */
export interface WsVitalSigns {
  event: 'vital-signs';
  timestamp: number;
  breathing: VitalEstimate | null;
  heartRate: VitalEstimate | null;
  bufferFill: number;
  disclaimer: string;
}

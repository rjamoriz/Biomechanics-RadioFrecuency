/* ──────────────────────────────────────────────
 * Common enums and base types shared across the
 * Biomechanics platform.
 * ────────────────────────────────────────────── */

/** Validation state for any estimated or inferred output. */
export type ValidationStatus =
  | 'unvalidated'
  | 'experimental'
  | 'station_validated'
  | 'externally_validated';

/** Status of a sensing session. */
export type SessionStatus =
  | 'created'
  | 'running'
  | 'paused'
  | 'completed'
  | 'cancelled';

/** Calibration status of a station. */
export type CalibrationStatus =
  | 'uncalibrated'
  | 'in-progress'
  | 'calibrated'
  | 'expired';

/** User role within the platform. */
export type UserRole = 'admin' | 'coach' | 'operator' | 'viewer';

/** Confidence level classification. */
export type ConfidenceLevel = 'high' | 'medium' | 'low';

/** Base entity shape for all domain objects persisted in the backend. */
export interface BaseEntity {
  id: string;
  createdAt: string;
  updatedAt: string;
}

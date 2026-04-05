/**
 * Persistent Field Model — RF Baseline Learning
 *
 * Learns the station's RF signature when no athlete is present, then
 * subtracts the baseline to isolate athlete-induced CSI changes.
 * Detects long-term drift and flags calibration staleness.
 *
 * State machine: UNCALIBRATED → CALIBRATING → CALIBRATED → DRIFTING → RECALIBRATING
 *
 * All outputs are estimated proxy metrics — not clinical-grade measurements.
 */

// ─── Constants ──────────────────────────────────────────────────────

/** Frames required for a complete calibration (5 s at 100 Hz) */
export const DEFAULT_CALIBRATION_FRAMES = 500;

/** Motion energy above this threshold indicates athlete presence */
export const PRESENCE_THRESHOLD = 0.15;

/** Drift score above this triggers DRIFTING state */
export const DRIFT_THRESHOLD = 0.3;

/** Seconds before calibration is considered stale */
export const MAX_CALIBRATION_AGE = 3600;

/** EMA alpha for drift score smoothing */
export const DRIFT_ALPHA = 0.02;

// ─── Types ──────────────────────────────────────────────────────────

export enum FieldModelState {
  UNCALIBRATED = 'uncalibrated',
  CALIBRATING = 'calibrating',
  CALIBRATED = 'calibrated',
  DRIFTING = 'drifting',
  RECALIBRATING = 'recalibrating',
}

export interface FieldModelSnapshot {
  /** Current state machine state */
  state: FieldModelState;
  /** Per-subcarrier amplitude baseline mean (null if uncalibrated) */
  baselineMean: number[] | null;
  /** Per-subcarrier amplitude baseline variance (null if uncalibrated) */
  baselineVariance: number[] | null;
  /** Frames collected during calibration */
  calibrationFrameCount: number;
  /** Timestamp of last completed calibration (null if never) */
  lastCalibrationTimestamp: number | null;
  /** Drift score [0, 1]; 1 = severe drift from baseline */
  driftScore: number;
  /** Current residual energy (how much athlete disturbs field) */
  motionEnergy: number;
  /** Whether motion energy exceeds presence threshold */
  presenceDetected: boolean;
  /** Seconds since last calibration completed */
  calibrationAge: number;
}

export interface BaselineExport {
  mean: number[];
  variance: number[];
  timestamp: number;
}

// ─── Implementation ─────────────────────────────────────────────────

export class PersistentFieldModel {
  private state = FieldModelState.UNCALIBRATED;
  private readonly requiredFrames: number;

  // Calibration accumulators (Welford online algorithm)
  private calibrationCount = 0;
  private calibrationSum: number[] = [];
  private calibrationSumSq: number[] = [];

  // Stored baseline
  private baselineMean: number[] | null = null;
  private baselineVariance: number[] | null = null;
  private lastCalibrationTimestamp: number | null = null;

  // Drift tracking
  private driftScore = 0;
  private lastMotionEnergy = 0;

  constructor(calibrationFrames: number = DEFAULT_CALIBRATION_FRAMES) {
    this.requiredFrames = calibrationFrames;
  }

  /**
   * Process a CSI amplitude frame and return updated field model state.
   */
  processFrame(amplitudes: number[], timestamp: number): FieldModelSnapshot {
    if (amplitudes.length === 0) {
      return this.getSnapshot(timestamp);
    }

    switch (this.state) {
      case FieldModelState.UNCALIBRATED:
        // No processing until calibration starts
        break;

      case FieldModelState.CALIBRATING:
      case FieldModelState.RECALIBRATING:
        this.accumulateCalibration(amplitudes);
        if (this.calibrationCount >= this.requiredFrames) {
          this.finalizeCalibration(timestamp);
        }
        break;

      case FieldModelState.CALIBRATED:
      case FieldModelState.DRIFTING:
        this.updateDrift(amplitudes);
        if (this.state === FieldModelState.CALIBRATED && this.driftScore > DRIFT_THRESHOLD) {
          this.state = FieldModelState.DRIFTING;
        }
        break;
    }

    this.lastMotionEnergy = this.baselineMean
      ? this.computeMotionEnergy(amplitudes)
      : 0;

    return this.getSnapshot(timestamp);
  }

  /**
   * Start or restart baseline calibration.
   * Should be called when station is empty (no athlete).
   */
  startCalibration(): void {
    const nextState =
      this.state === FieldModelState.DRIFTING || this.state === FieldModelState.CALIBRATED
        ? FieldModelState.RECALIBRATING
        : FieldModelState.CALIBRATING;

    this.state = nextState;
    this.calibrationCount = 0;
    this.calibrationSum = [];
    this.calibrationSumSq = [];
  }

  /** Whether a valid baseline exists */
  isCalibrated(): boolean {
    return (
      this.state === FieldModelState.CALIBRATED ||
      this.state === FieldModelState.DRIFTING
    );
  }

  /**
   * Compute baseline-subtracted residual per subcarrier.
   * Returns zeros if uncalibrated.
   */
  getResidual(amplitudes: number[]): number[] {
    if (!this.baselineMean) {
      return new Array(amplitudes.length).fill(0);
    }
    const n = Math.min(amplitudes.length, this.baselineMean.length);
    const residual = new Array<number>(n);
    for (let i = 0; i < n; i++) {
      residual[i] = amplitudes[i] - this.baselineMean[i];
    }
    return residual;
  }

  /**
   * Compute motion energy: sum(residual^2) / num_subcarriers.
   * Higher values = more athlete-induced disturbance.
   */
  getMotionEnergy(amplitudes: number[]): number {
    return this.computeMotionEnergy(amplitudes);
  }

  /** Current snapshot (uses provided timestamp for age computation) */
  getSnapshot(timestamp?: number): FieldModelSnapshot {
    const now = timestamp ?? Date.now();
    const calibrationAge = this.lastCalibrationTimestamp
      ? (now - this.lastCalibrationTimestamp) / 1000
      : 0;

    return {
      state: this.state,
      baselineMean: this.baselineMean,
      baselineVariance: this.baselineVariance,
      calibrationFrameCount: this.calibrationCount,
      lastCalibrationTimestamp: this.lastCalibrationTimestamp,
      driftScore: round4(this.driftScore),
      motionEnergy: round4(this.lastMotionEnergy),
      presenceDetected: this.lastMotionEnergy > PRESENCE_THRESHOLD,
      calibrationAge: Math.round(calibrationAge),
    };
  }

  /** Export baseline for persistence (e.g. save to disk or backend) */
  exportBaseline(): BaselineExport | null {
    if (!this.baselineMean || !this.baselineVariance || !this.lastCalibrationTimestamp) {
      return null;
    }
    return {
      mean: [...this.baselineMean],
      variance: [...this.baselineVariance],
      timestamp: this.lastCalibrationTimestamp,
    };
  }

  /** Import a previously saved baseline */
  importBaseline(baseline: BaselineExport): void {
    this.baselineMean = [...baseline.mean];
    this.baselineVariance = [...baseline.variance];
    this.lastCalibrationTimestamp = baseline.timestamp;
    this.state = FieldModelState.CALIBRATED;
    this.driftScore = 0;
  }

  /** Reset all state */
  reset(): void {
    this.state = FieldModelState.UNCALIBRATED;
    this.calibrationCount = 0;
    this.calibrationSum = [];
    this.calibrationSumSq = [];
    this.baselineMean = null;
    this.baselineVariance = null;
    this.lastCalibrationTimestamp = null;
    this.driftScore = 0;
    this.lastMotionEnergy = 0;
  }

  // ─── Private ────────────────────────────────────────────────────

  private accumulateCalibration(amplitudes: number[]): void {
    const n = amplitudes.length;

    // Initialize accumulators on first frame
    if (this.calibrationSum.length === 0) {
      this.calibrationSum = new Array(n).fill(0);
      this.calibrationSumSq = new Array(n).fill(0);
    }

    const len = Math.min(n, this.calibrationSum.length);
    for (let i = 0; i < len; i++) {
      this.calibrationSum[i] += amplitudes[i];
      this.calibrationSumSq[i] += amplitudes[i] * amplitudes[i];
    }
    this.calibrationCount++;
  }

  private finalizeCalibration(timestamp: number): void {
    const count = this.calibrationCount;
    const n = this.calibrationSum.length;

    this.baselineMean = new Array(n);
    this.baselineVariance = new Array(n);

    for (let i = 0; i < n; i++) {
      const mean = this.calibrationSum[i] / count;
      this.baselineMean[i] = mean;
      // Var = E[X^2] - E[X]^2
      this.baselineVariance[i] = Math.max(
        0,
        this.calibrationSumSq[i] / count - mean * mean,
      );
    }

    this.lastCalibrationTimestamp = timestamp;
    this.state = FieldModelState.CALIBRATED;
    this.driftScore = 0;
  }

  private computeMotionEnergy(amplitudes: number[]): number {
    if (!this.baselineMean) return 0;
    const n = Math.min(amplitudes.length, this.baselineMean.length);
    if (n === 0) return 0;

    let sumSqResidual = 0;
    for (let i = 0; i < n; i++) {
      const r = amplitudes[i] - this.baselineMean[i];
      sumSqResidual += r * r;
    }
    return sumSqResidual / n;
  }

  private updateDrift(amplitudes: number[]): void {
    if (!this.baselineMean) return;
    const n = Math.min(amplitudes.length, this.baselineMean.length);
    if (n === 0) return;

    // Correlation-based drift: measure how much current frame deviates
    // from baseline mean, normalized by baseline variance
    let driftSignal = 0;
    let validCount = 0;

    for (let i = 0; i < n; i++) {
      const variance = this.baselineVariance?.[i] ?? 0;
      // Use a floor on std-dev so constant-signal baselines still detect drift
      const stdDev = Math.sqrt(Math.max(variance, 1e-6));
      const deviation = Math.abs(amplitudes[i] - this.baselineMean[i]);
      driftSignal += deviation / stdDev;
      validCount++;
    }

    const rawDrift = validCount > 0
      ? Math.min(1, (driftSignal / validCount) / 5) // normalize: 5 std-devs = max drift
      : 0;

    // EMA smooth the drift score
    this.driftScore = this.driftScore * (1 - DRIFT_ALPHA) + rawDrift * DRIFT_ALPHA;
  }
}

// ─── Helpers ────────────────────────────────────────────────────────

function round4(v: number): number {
  return Math.round(v * 10000) / 10000;
}

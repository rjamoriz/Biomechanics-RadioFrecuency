/**
 * SpotFi-Inspired Angle of Arrival Estimator
 *
 * Estimates the dominant signal arrival angle from CSI phase slope across
 * subcarriers. For single-antenna ESP32 this provides a phase-slope proxy
 * for path length changes, lateral displacement, and lateral sway detection.
 *
 * All outputs are estimated proxy metrics — not clinical-grade measurements.
 */

// ─── Constants ──────────────────────────────────────────────────────

export const SPEED_OF_LIGHT = 299_792_458;
export const DEFAULT_SUBCARRIER_SPACING = 312_500; // Hz (20MHz / 64)
export const DEFAULT_CARRIER_FREQ = 2.4; // GHz
export const HISTORY_SIZE = 100;
export const MIN_CONFIDENCE_R2 = 0.5;
export const SMOOTHING_ALPHA = 0.3;

// ─── Types ──────────────────────────────────────────────────────────

export interface AoAEstimate {
  /** Estimated dominant angle in degrees [-90, 90] relative to broadside */
  dominantAngleDeg: number;
  /** Phase slope across subcarriers (rad/subcarrier) */
  phaseSlope: number;
  /** Estimated path length change in meters */
  pathLengthDelta: number;
  /** Lateral displacement estimate in meters (requires station geometry) */
  lateralDisplacement: number;
  /** Estimate confidence [0, 1] based on linear fit R² */
  confidence: number;
  /** AoA change rate (degrees/second) — lateral sway indicator */
  aoaChangeRate: number;
  /** Timestamp */
  timestamp: number;
}

export interface SpotFiConfig {
  /** Subcarrier spacing in Hz (default 312500 for 20MHz/64) */
  subcarrierSpacingHz: number;
  /** Carrier frequency in GHz (default 2.4) */
  carrierFreqGHz: number;
  /** Antenna to treadmill center distance in meters */
  antennaToTreadmillDistance: number;
  /** Minimum R² for confident estimate (default 0.5) */
  minConfidenceR2: number;
  /** EMA alpha for AoA smoothing (default 0.3) */
  smoothingAlpha: number;
}

// ─── Helpers ────────────────────────────────────────────────────────

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

function round4(v: number): number {
  return Math.round(v * 10_000) / 10_000;
}

/**
 * Unwrap phase differences so they stay in [-π, π].
 */
function wrapToPi(angle: number): number {
  while (angle > Math.PI) angle -= 2 * Math.PI;
  while (angle < -Math.PI) angle += 2 * Math.PI;
  return angle;
}

/**
 * Weighted linear regression: y = slope * x + intercept
 * Returns { slope, intercept, r2 }.
 */
function weightedLinearRegression(
  x: number[],
  y: number[],
  w: number[],
): { slope: number; intercept: number; r2: number } {
  const n = x.length;
  if (n < 2) return { slope: 0, intercept: 0, r2: 0 };

  let sumW = 0;
  let sumWx = 0;
  let sumWy = 0;
  let sumWxy = 0;
  let sumWx2 = 0;

  for (let i = 0; i < n; i++) {
    const wi = w[i];
    sumW += wi;
    sumWx += wi * x[i];
    sumWy += wi * y[i];
    sumWxy += wi * x[i] * y[i];
    sumWx2 += wi * x[i] * x[i];
  }

  if (sumW < 1e-12) return { slope: 0, intercept: 0, r2: 0 };

  const denom = sumW * sumWx2 - sumWx * sumWx;
  if (Math.abs(denom) < 1e-12) return { slope: 0, intercept: 0, r2: 0 };

  const slope = (sumW * sumWxy - sumWx * sumWy) / denom;
  const intercept = (sumWy - slope * sumWx) / sumW;

  // Weighted R²
  const yMean = sumWy / sumW;
  let ssTot = 0;
  let ssRes = 0;
  for (let i = 0; i < n; i++) {
    const predicted = slope * x[i] + intercept;
    ssRes += w[i] * (y[i] - predicted) ** 2;
    ssTot += w[i] * (y[i] - yMean) ** 2;
  }

  const r2 = ssTot < 1e-12 ? 0 : clamp(1 - ssRes / ssTot, 0, 1);

  return { slope, intercept, r2 };
}

// ─── Implementation ─────────────────────────────────────────────────

export class SpotFiAoAEstimator {
  private readonly config: SpotFiConfig;
  private readonly history: AoAEstimate[];
  private historyIndex = 0;
  private historyCount = 0;
  private smoothedAngle = 0;
  private prevAngle: number | null = null;
  private prevTimestamp: number | null = null;

  constructor(config?: Partial<SpotFiConfig>) {
    this.config = {
      subcarrierSpacingHz: config?.subcarrierSpacingHz ?? DEFAULT_SUBCARRIER_SPACING,
      carrierFreqGHz: config?.carrierFreqGHz ?? DEFAULT_CARRIER_FREQ,
      antennaToTreadmillDistance: config?.antennaToTreadmillDistance ?? 1.5,
      minConfidenceR2: config?.minConfidenceR2 ?? MIN_CONFIDENCE_R2,
      smoothingAlpha: config?.smoothingAlpha ?? SMOOTHING_ALPHA,
    };
    this.history = new Array<AoAEstimate>(HISTORY_SIZE);
  }

  /**
   * Estimate AoA from a single frame's phase array.
   *
   * Uses phase slope across subcarriers via weighted linear regression.
   * Weights = amplitude (not available here, so uniform weight unless
   * caller provides unwrapped + cleaned phases).
   */
  estimate(phases: number[], timestamp: number): AoAEstimate {
    if (phases.length < 2) {
      return this.makeEstimate(0, 0, 0, timestamp);
    }

    // Compute phase differences between adjacent subcarriers
    const n = phases.length;
    const indices: number[] = [];
    const diffs: number[] = [];
    const weights: number[] = [];

    for (let k = 0; k < n - 1; k++) {
      const diff = wrapToPi(phases[k + 1] - phases[k]);
      indices.push(k);
      diffs.push(diff);
      // Uniform weight (we don't have amplitude per-pair here)
      weights.push(1);
    }

    // Weighted linear regression: phase_diff vs subcarrier index
    const fit = weightedLinearRegression(indices, diffs, weights);

    // Phase slope in rad per subcarrier
    const phaseSlope = fit.slope;

    // Time-of-flight estimate: τ = Δφ_total / (2π × Δf)
    // Path length delta = τ × c
    const totalPhaseDiff = phaseSlope * (n - 1);
    const tau = totalPhaseDiff / (2 * Math.PI * this.config.subcarrierSpacingHz);
    const pathLengthDelta = tau * SPEED_OF_LIGHT;

    // Estimate angle from phase slope
    // For single antenna, angle ≈ asin(phaseSlope × c / (2π × d × Δf))
    // where d = antenna spacing. For single antenna we approximate with
    // wavelength-based mapping.
    const carrierFreqHz = this.config.carrierFreqGHz * 1e9;
    const wavelength = SPEED_OF_LIGHT / carrierFreqHz;
    // Normalized angle proxy: phaseSlope relates to sin(θ)
    const sinTheta = clamp(
      (phaseSlope * SPEED_OF_LIGHT) / (2 * Math.PI * this.config.subcarrierSpacingHz * wavelength),
      -1,
      1,
    );
    const rawAngleDeg = (Math.asin(sinTheta) * 180) / Math.PI;

    const confidence = fit.r2;

    return this.makeEstimate(rawAngleDeg, phaseSlope, pathLengthDelta, timestamp, confidence);
  }

  /**
   * Estimate AoA from phase array with per-subcarrier amplitude weights.
   */
  estimateWeighted(phases: number[], amplitudes: number[], timestamp: number): AoAEstimate {
    if (phases.length < 2 || amplitudes.length < phases.length) {
      return this.makeEstimate(0, 0, 0, timestamp);
    }

    const n = phases.length;
    const indices: number[] = [];
    const diffs: number[] = [];
    const weights: number[] = [];

    for (let k = 0; k < n - 1; k++) {
      const diff = wrapToPi(phases[k + 1] - phases[k]);
      indices.push(k);
      diffs.push(diff);
      // Weight = geometric mean of adjacent subcarrier amplitudes
      weights.push(Math.sqrt(Math.max(amplitudes[k], 0) * Math.max(amplitudes[k + 1], 0)));
    }

    const fit = weightedLinearRegression(indices, diffs, weights);
    const phaseSlope = fit.slope;
    const totalPhaseDiff = phaseSlope * (n - 1);
    const tau = totalPhaseDiff / (2 * Math.PI * this.config.subcarrierSpacingHz);
    const pathLengthDelta = tau * SPEED_OF_LIGHT;

    const carrierFreqHz = this.config.carrierFreqGHz * 1e9;
    const wavelength = SPEED_OF_LIGHT / carrierFreqHz;
    const sinTheta = clamp(
      (phaseSlope * SPEED_OF_LIGHT) / (2 * Math.PI * this.config.subcarrierSpacingHz * wavelength),
      -1,
      1,
    );
    const rawAngleDeg = (Math.asin(sinTheta) * 180) / Math.PI;

    return this.makeEstimate(rawAngleDeg, phaseSlope, pathLengthDelta, timestamp, fit.r2);
  }

  /** Get smoothed AoA history (last N estimates) */
  getHistory(): AoAEstimate[] {
    const count = Math.min(this.historyCount, HISTORY_SIZE);
    const result: AoAEstimate[] = [];
    const start = this.historyCount <= HISTORY_SIZE
      ? 0
      : this.historyIndex;
    for (let i = 0; i < count; i++) {
      const idx = (start + i) % HISTORY_SIZE;
      result.push(this.history[idx]);
    }
    return result;
  }

  /** Get lateral sway amplitude from recent history (peak-to-peak) */
  getLateralSwayAmplitude(): number {
    const hist = this.getHistory();
    if (hist.length < 2) return 0;

    let min = Infinity;
    let max = -Infinity;
    for (const est of hist) {
      if (est.lateralDisplacement < min) min = est.lateralDisplacement;
      if (est.lateralDisplacement > max) max = est.lateralDisplacement;
    }

    return round4(max - min);
  }

  reset(): void {
    this.historyIndex = 0;
    this.historyCount = 0;
    this.smoothedAngle = 0;
    this.prevAngle = null;
    this.prevTimestamp = null;
  }

  // ─── Private ────────────────────────────────────────────────────

  private makeEstimate(
    rawAngleDeg: number,
    phaseSlope: number,
    pathLengthDelta: number,
    timestamp: number,
    confidence = 0,
  ): AoAEstimate {
    // EMA smoothing on angle
    if (this.prevAngle === null) {
      this.smoothedAngle = rawAngleDeg;
    } else {
      this.smoothedAngle =
        this.config.smoothingAlpha * rawAngleDeg +
        (1 - this.config.smoothingAlpha) * this.smoothedAngle;
    }

    // AoA change rate
    let aoaChangeRate = 0;
    if (this.prevAngle !== null && this.prevTimestamp !== null) {
      const dt = (timestamp - this.prevTimestamp) / 1000; // seconds
      if (dt > 0) {
        aoaChangeRate = (this.smoothedAngle - this.prevAngle) / dt;
      }
    }

    // Lateral displacement from angle + known geometry
    const anglRad = (this.smoothedAngle * Math.PI) / 180;
    const lateralDisplacement = Math.sin(anglRad) * this.config.antennaToTreadmillDistance;

    const estimate: AoAEstimate = {
      dominantAngleDeg: round4(this.smoothedAngle),
      phaseSlope: round4(phaseSlope),
      pathLengthDelta: round4(pathLengthDelta),
      lateralDisplacement: round4(lateralDisplacement),
      confidence: round4(clamp(confidence, 0, 1)),
      aoaChangeRate: round4(aoaChangeRate),
      timestamp,
    };

    // Store previous for change rate
    this.prevAngle = this.smoothedAngle;
    this.prevTimestamp = timestamp;

    // Push to circular history
    this.history[this.historyIndex] = estimate;
    this.historyIndex = (this.historyIndex + 1) % HISTORY_SIZE;
    if (this.historyCount < HISTORY_SIZE) this.historyCount++;

    return estimate;
  }
}

/**
 * Multi-Environment Normalizer — CSI Baseline Normalization
 *
 * Normalizes raw CSI signals by subtracting environment-specific baselines
 * (noise floor, ambient reflections) so downstream algorithms process only
 * athlete-induced signal changes.
 *
 * AdaptiveNormalizer extends the base class with EMA-driven baseline drift
 * compensation for long-running sessions.
 *
 * All outputs are estimated proxy metrics — not clinical-grade measurements.
 */

// ─── Types ──────────────────────────────────────────────────────────

export interface EnvironmentBaseline {
  /** Estimated noise floor level per subcarrier */
  noiseFloor: number;
  /** Per-subcarrier ambient mean amplitudes */
  ambientMean: number[];
  /** Per-subcarrier ambient variance */
  ambientVariance: number[];
  /** Timestamp when baseline was captured */
  capturedAt: number;
  /** Number of subcarriers in baseline */
  subcarrierCount: number;
}

export interface NormalizeResult {
  /** Baseline-subtracted normalized subcarrier values */
  normalized: number[];
  /** Signal quality metric [0, 1]: signal power / (signal + noise) power */
  quality: number;
  /** Whether any values were clipped (> 3σ outliers) */
  clipped: boolean;
}

// ─── EnvironmentNormalizer ──────────────────────────────────────────

/**
 * Subtracts an environment baseline from raw CSI subcarrier values.
 * Quality metric is the ratio of useful signal power to total (signal + noise).
 */
export class EnvironmentNormalizer {
  protected baseline: EnvironmentBaseline | null = null;

  /** Set the environment reference baseline. */
  setBaseline(baseline: EnvironmentBaseline): void {
    this.baseline = { ...baseline, ambientMean: [...baseline.ambientMean], ambientVariance: [...baseline.ambientVariance] };
  }

  /** Whether a baseline has been set. */
  hasBaseline(): boolean {
    return this.baseline !== null;
  }

  /** Return the current baseline or null. */
  getBaseline(): EnvironmentBaseline | null {
    if (!this.baseline) return null;
    return {
      ...this.baseline,
      ambientMean: [...this.baseline.ambientMean],
      ambientVariance: [...this.baseline.ambientVariance],
    };
  }

  /**
   * Normalize raw subcarrier amplitudes against the baseline.
   *
   * @throws Error if no baseline has been set
   */
  normalize(rawSubcarriers: number[]): NormalizeResult {
    if (!this.baseline) {
      throw new Error('Cannot normalize without a baseline. Call setBaseline() first.');
    }

    const n = Math.min(rawSubcarriers.length, this.baseline.ambientMean.length);
    const normalized = new Array<number>(n);
    let clipped = false;
    let signalPower = 0;
    let noisePower = 0;

    for (let i = 0; i < n; i++) {
      // Subtract ambient baseline
      let value = rawSubcarriers[i] - this.baseline.ambientMean[i];

      // Compute sigma for outlier clipping
      const sigma = Math.sqrt(Math.max(this.baseline.ambientVariance[i], 1e-9));
      const clipThreshold = 3 * sigma;

      if (Math.abs(value) > clipThreshold) {
        value = Math.sign(value) * clipThreshold;
        clipped = true;
      }

      normalized[i] = value;
      signalPower += value * value;
      noisePower += this.baseline.ambientVariance[i];
    }

    // Quality = SNR-inspired: signal / (signal + noise), bounded [0, 1]
    const totalPower = signalPower + noisePower;
    const quality = totalPower > 0 ? Math.min(1, Math.max(0, signalPower / totalPower)) : 0;

    return {
      normalized: normalized.map(v => round4(v)),
      quality: round4(quality),
      clipped,
    };
  }
}

// ─── AdaptiveNormalizer ─────────────────────────────────────────────

/**
 * Extends EnvironmentNormalizer with slow EMA-based baseline adaptation.
 * Compensates for gradual environmental drift (temperature, humidity changes)
 * during long recording sessions.
 */
export class AdaptiveNormalizer extends EnvironmentNormalizer {
  private readonly adaptationRate: number;
  private initialBaseline: EnvironmentBaseline | null = null;
  private adaptationSteps = 0;

  /**
   * @param adaptationRate EMA rate ∈ (0, 1]; 0.01 = very slow adaptation
   */
  constructor(adaptationRate: number = 0.01) {
    super();
    this.adaptationRate = Math.max(0, Math.min(1, adaptationRate));
  }

  /** Override to also store the initial baseline for progress tracking. */
  override setBaseline(baseline: EnvironmentBaseline): void {
    super.setBaseline(baseline);
    this.initialBaseline = {
      ...baseline,
      ambientMean: [...baseline.ambientMean],
      ambientVariance: [...baseline.ambientVariance],
    };
    this.adaptationSteps = 0;
  }

  /**
   * Normalize AND adapt the internal baseline toward the new observation.
   */
  override normalize(rawSubcarriers: number[]): NormalizeResult {
    const result = super.normalize(rawSubcarriers);

    // Adapt baseline toward current observation
    if (this.baseline) {
      const alpha = this.adaptationRate;
      const n = Math.min(rawSubcarriers.length, this.baseline.ambientMean.length);
      for (let i = 0; i < n; i++) {
        const diff = rawSubcarriers[i] - this.baseline.ambientMean[i];
        this.baseline.ambientMean[i] += alpha * diff;
        this.baseline.ambientVariance[i] =
          (1 - alpha) * (this.baseline.ambientVariance[i] + alpha * diff * diff);
      }
      this.adaptationSteps++;
    }

    return result;
  }

  /**
   * How much the baseline has shifted from its initial state, in [0, 1].
   * 0 = no drift, 1 = large drift (normalized by initial magnitude).
   */
  getAdaptationProgress(): number {
    if (!this.baseline || !this.initialBaseline || this.adaptationSteps === 0) {
      return 0;
    }

    const n = Math.min(this.baseline.ambientMean.length, this.initialBaseline.ambientMean.length);
    if (n === 0) return 0;

    let driftSumSq = 0;
    let initialSumSq = 0;

    for (let i = 0; i < n; i++) {
      const shift = this.baseline.ambientMean[i] - this.initialBaseline.ambientMean[i];
      driftSumSq += shift * shift;
      initialSumSq += this.initialBaseline.ambientMean[i] * this.initialBaseline.ambientMean[i];
    }

    // Ratio of drift magnitude to initial magnitude, capped at 1
    const ratio = initialSumSq > 0 ? Math.sqrt(driftSumSq / initialSumSq) : 0;
    return round4(Math.min(1, ratio));
  }
}

// ─── Helpers ────────────────────────────────────────────────────────

function round4(v: number): number {
  return Math.round(v * 10000) / 10000;
}

/**
 * Signal-Line Protocol — 6-Stage CSI Processing Pipeline
 *
 * Formalizes the CSI processing chain with explicit stage gates,
 * timing, and diagnostics. Provides observability for the entire
 * ingestion-to-output path.
 *
 * Stages:
 *   1. ACQUISITION   — raw packet validation
 *   2. NORMALIZATION  — I/Q → amplitude/phase conversion
 *   3. FILTERING      — Hampel, phase unwrap, detrend
 *   4. FEATURE_EXTRACTION — coherence, BVP, spectral features
 *   5. CLASSIFICATION — gait state, rule engine, vital signs
 *   6. OUTPUT         — metric snapshot, WebSocket stream
 *
 * Pure coordinator — wraps existing services with timing and gate checks.
 *
 * All outputs are estimated proxy metrics — not clinical-grade measurements.
 */

import { GateDecision } from './coherence-gate';

// ─── Constants ──────────────────────────────────────────────────────

/** Maximum per-frame processing budget in ms */
const FRAME_BUDGET_MS = 10;

/** Minimum valid subcarrier count */
const MIN_SUBCARRIERS = 1;

/** Maximum valid subcarrier count */
const MAX_SUBCARRIERS = 128;

/** Minimum valid RSSI (dBm) */
const MIN_RSSI = -100;

/** Maximum valid RSSI (dBm) */
const MAX_RSSI = 10;

/** Maximum outlier ratio from Hampel filter before stage fails */
const MAX_OUTLIER_RATIO = 0.5;

/** Rolling throughput window size */
const THROUGHPUT_WINDOW = 100;

/** EMA alpha for per-stage pass rate tracking */
const PASS_RATE_ALPHA = 0.05;

// ─── Types ──────────────────────────────────────────────────────────

export enum PipelineStage {
  ACQUISITION = 'acquisition',
  NORMALIZATION = 'normalization',
  FILTERING = 'filtering',
  FEATURE_EXTRACTION = 'feature',
  CLASSIFICATION = 'classification',
  OUTPUT = 'output',
}

export interface StageResult {
  /** Which pipeline stage */
  stage: PipelineStage;
  /** Whether this stage's gate passed */
  passed: boolean;
  /** Timestamp when stage was evaluated */
  timestamp: number;
  /** Stage processing duration in ms */
  durationMs: number;
  /** Stage-specific diagnostic metrics */
  diagnostics: Record<string, number>;
}

export interface PipelineReport {
  /** Frame index (monotonically increasing) */
  frameIndex: number;
  /** Report timestamp */
  timestamp: number;
  /** Total pipeline duration for this frame in ms */
  totalDurationMs: number;
  /** Per-stage results */
  stages: StageResult[];
  /** Whether ALL stages passed */
  passed: boolean;
  /** First stage that failed (null if all passed) */
  failedAt: PipelineStage | null;
  /** Rolling throughput in Hz */
  throughputHz: number;
}

// ─── Stage input types for gate evaluation ──────────────────────────

export interface AcquisitionInput {
  rssi: number;
  subcarrierCount: number;
  mac: string;
  timestamp: number;
}

export interface NormalizationInput {
  amplitude: number[];
  phase: number[];
}

export interface FilteringInput {
  outlierCount: number;
  totalSamples: number;
  phaseContinuous: boolean;
}

export interface FeatureInput {
  gateDecision: GateDecision;
}

export interface ClassificationInput {
  metricsProduced: boolean;
  confidence: number;
}

export interface OutputInput {
  emitted: boolean;
}

// ─── Implementation ─────────────────────────────────────────────────

export class SignalLinePipeline {
  private frameIndex = 0;
  private readonly passRates: Record<PipelineStage, number> = {
    [PipelineStage.ACQUISITION]: 1,
    [PipelineStage.NORMALIZATION]: 1,
    [PipelineStage.FILTERING]: 1,
    [PipelineStage.FEATURE_EXTRACTION]: 1,
    [PipelineStage.CLASSIFICATION]: 1,
    [PipelineStage.OUTPUT]: 1,
  };
  private initialized = false;

  // Rolling throughput
  private timestamps: number[] = [];

  /**
   * Evaluate all 6 stages and produce a pipeline report.
   * Each stage is evaluated independently so diagnostics capture every gate.
   */
  evaluate(stages: {
    acquisition: AcquisitionInput;
    normalization: NormalizationInput;
    filtering: FilteringInput;
    feature: FeatureInput;
    classification: ClassificationInput;
    output: OutputInput;
  }): PipelineReport {
    const now = Date.now();
    const pipelineStart = performance.now();
    const results: StageResult[] = [];
    let failedAt: PipelineStage | null = null;

    // 1. ACQUISITION
    const acqResult = this.evaluateAcquisition(stages.acquisition, now);
    results.push(acqResult);
    if (!acqResult.passed && !failedAt) failedAt = PipelineStage.ACQUISITION;

    // 2. NORMALIZATION
    const normResult = this.evaluateNormalization(stages.normalization, now);
    results.push(normResult);
    if (!normResult.passed && !failedAt) failedAt = PipelineStage.NORMALIZATION;

    // 3. FILTERING
    const filtResult = this.evaluateFiltering(stages.filtering, now);
    results.push(filtResult);
    if (!filtResult.passed && !failedAt) failedAt = PipelineStage.FILTERING;

    // 4. FEATURE_EXTRACTION
    const featResult = this.evaluateFeature(stages.feature, now);
    results.push(featResult);
    if (!featResult.passed && !failedAt) failedAt = PipelineStage.FEATURE_EXTRACTION;

    // 5. CLASSIFICATION
    const classResult = this.evaluateClassification(stages.classification, now);
    results.push(classResult);
    if (!classResult.passed && !failedAt) failedAt = PipelineStage.CLASSIFICATION;

    // 6. OUTPUT
    const outResult = this.evaluateOutput(stages.output, now, pipelineStart);
    results.push(outResult);
    if (!outResult.passed && !failedAt) failedAt = PipelineStage.OUTPUT;

    const totalDurationMs = round2(performance.now() - pipelineStart);

    // Update throughput tracking
    this.timestamps.push(now);
    if (this.timestamps.length > THROUGHPUT_WINDOW) {
      this.timestamps.shift();
    }

    this.frameIndex++;

    return {
      frameIndex: this.frameIndex,
      timestamp: now,
      totalDurationMs,
      stages: results,
      passed: failedAt === null,
      failedAt,
      throughputHz: round2(this.computeThroughput()),
    };
  }

  /** Get current per-stage pass rates */
  getPassRates(): Record<PipelineStage, number> {
    const rounded: Record<string, number> = {};
    for (const stage of Object.values(PipelineStage)) {
      rounded[stage] = round4(this.passRates[stage]);
    }
    return rounded as Record<PipelineStage, number>;
  }

  /** Reset counters and history */
  reset(): void {
    this.frameIndex = 0;
    this.timestamps = [];
    this.initialized = false;
    for (const stage of Object.values(PipelineStage)) {
      this.passRates[stage] = 1;
    }
  }

  // ─── Stage evaluators ─────────────────────────────────────────────

  private evaluateAcquisition(input: AcquisitionInput, now: number): StageResult {
    const start = performance.now();
    const validRssi = input.rssi >= MIN_RSSI && input.rssi <= MAX_RSSI;
    const validSubcarriers =
      input.subcarrierCount >= MIN_SUBCARRIERS &&
      input.subcarrierCount <= MAX_SUBCARRIERS;
    const validMac = input.mac.length > 0;
    const passed = validRssi && validSubcarriers && validMac;

    this.updatePassRate(PipelineStage.ACQUISITION, passed);

    return {
      stage: PipelineStage.ACQUISITION,
      passed,
      timestamp: now,
      durationMs: round2(performance.now() - start),
      diagnostics: {
        rssi: input.rssi,
        subcarrierCount: input.subcarrierCount,
        validRssi: validRssi ? 1 : 0,
        validSubcarriers: validSubcarriers ? 1 : 0,
      },
    };
  }

  private evaluateNormalization(input: NormalizationInput, now: number): StageResult {
    const start = performance.now();
    const ampFinite = input.amplitude.every(isFinite);
    const phaseFinite = input.phase.every(isFinite);
    const passed = ampFinite && phaseFinite && input.amplitude.length > 0;

    this.updatePassRate(PipelineStage.NORMALIZATION, passed);

    return {
      stage: PipelineStage.NORMALIZATION,
      passed,
      timestamp: now,
      durationMs: round2(performance.now() - start),
      diagnostics: {
        amplitudeLength: input.amplitude.length,
        phaseLength: input.phase.length,
        ampFinite: ampFinite ? 1 : 0,
        phaseFinite: phaseFinite ? 1 : 0,
      },
    };
  }

  private evaluateFiltering(input: FilteringInput, now: number): StageResult {
    const start = performance.now();
    const outlierRatio =
      input.totalSamples > 0 ? input.outlierCount / input.totalSamples : 0;
    const passed = outlierRatio < MAX_OUTLIER_RATIO && input.phaseContinuous;

    this.updatePassRate(PipelineStage.FILTERING, passed);

    return {
      stage: PipelineStage.FILTERING,
      passed,
      timestamp: now,
      durationMs: round2(performance.now() - start),
      diagnostics: {
        outlierRatio: round4(outlierRatio),
        phaseContinuous: input.phaseContinuous ? 1 : 0,
      },
    };
  }

  private evaluateFeature(input: FeatureInput, now: number): StageResult {
    const start = performance.now();
    const passed = input.gateDecision.accepted;

    this.updatePassRate(PipelineStage.FEATURE_EXTRACTION, passed);

    return {
      stage: PipelineStage.FEATURE_EXTRACTION,
      passed,
      timestamp: now,
      durationMs: round2(performance.now() - start),
      diagnostics: {
        gateScore: input.gateDecision.gateScore,
        acceptanceRate: input.gateDecision.acceptanceRate,
        consecutiveRejections: input.gateDecision.consecutiveRejections,
      },
    };
  }

  private evaluateClassification(input: ClassificationInput, now: number): StageResult {
    const start = performance.now();
    const passed = input.metricsProduced && input.confidence > 0;

    this.updatePassRate(PipelineStage.CLASSIFICATION, passed);

    return {
      stage: PipelineStage.CLASSIFICATION,
      passed,
      timestamp: now,
      durationMs: round2(performance.now() - start),
      diagnostics: {
        metricsProduced: input.metricsProduced ? 1 : 0,
        confidence: input.confidence,
      },
    };
  }

  private evaluateOutput(
    input: OutputInput,
    now: number,
    pipelineStart: number,
  ): StageResult {
    const start = performance.now();
    const elapsed = performance.now() - pipelineStart;
    const withinBudget = elapsed <= FRAME_BUDGET_MS;
    const passed = input.emitted && withinBudget;

    this.updatePassRate(PipelineStage.OUTPUT, passed);

    return {
      stage: PipelineStage.OUTPUT,
      passed,
      timestamp: now,
      durationMs: round2(performance.now() - start),
      diagnostics: {
        emitted: input.emitted ? 1 : 0,
        totalElapsedMs: round2(elapsed),
        withinBudget: withinBudget ? 1 : 0,
      },
    };
  }

  // ─── Helpers ──────────────────────────────────────────────────────

  private updatePassRate(stage: PipelineStage, passed: boolean): void {
    const value = passed ? 1 : 0;
    if (!this.initialized) {
      this.passRates[stage] = value;
      // Mark as initialized after all 6 stages have been processed
      if (stage === PipelineStage.OUTPUT) this.initialized = true;
    } else {
      this.passRates[stage] =
        this.passRates[stage] * (1 - PASS_RATE_ALPHA) + value * PASS_RATE_ALPHA;
    }
  }

  private computeThroughput(): number {
    if (this.timestamps.length < 2) return 0;
    const windowMs =
      this.timestamps[this.timestamps.length - 1] - this.timestamps[0];
    if (windowMs <= 0) return 0;
    return ((this.timestamps.length - 1) / windowMs) * 1000;
  }
}

// ─── Helpers ────────────────────────────────────────────────────────

function round2(v: number): number {
  return Math.round(v * 100) / 100;
}

function round4(v: number): number {
  return Math.round(v * 10000) / 10000;
}

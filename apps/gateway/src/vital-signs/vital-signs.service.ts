import { Injectable, Logger } from '@nestjs/common';
import { HampelFilter } from '../signal/hampel-filter';
import { PhaseUnwrapper } from '../signal/phase-unwrapper';
import { BandpassFilter } from '../signal/bandpass-filter';

/**
 * Vital signs extraction from Wi-Fi CSI phase data.
 *
 * Pipeline (inspired by RuView):
 *   raw phase → unwrap → detrend → Hampel outlier removal →
 *   bandpass filter → FFT → peak detection → BPM estimate
 *
 * Supports two bands:
 *   - Breathing: 0.1 – 0.5 Hz (6 – 30 BPM)
 *   - Heart rate: 0.8 – 2.0 Hz (48 – 120 BPM)
 *
 * IMPORTANT: These are ESTIMATED proxy metrics, NOT clinical-grade measurements.
 * Confidence and signal quality MUST be exposed to the consumer.
 */
@Injectable()
export class VitalSignsService {
  private readonly logger = new Logger(VitalSignsService.name);

  /** Phase sample buffer per subcarrier — rolling window */
  private phaseBuffer: number[][] = [];
  private readonly bufferSize = 1024; // ~10 s at 100 Hz
  private sampleCount = 0;

  /** Configurable sample rate (expected from CSI packet rate) */
  private sampleRate = 100; // Hz, adjustable

  constructor(
    private readonly hampel: HampelFilter,
    private readonly unwrapper: PhaseUnwrapper,
    private readonly bandpass: BandpassFilter,
  ) {}

  /**
   * Push a new CSI phase snapshot (one per packet).
   * @param phases Phase values per subcarrier (radians)
   */
  pushPhaseSnapshot(phases: number[]): void {
    // Initialize buffer columns on first call
    if (this.phaseBuffer.length === 0) {
      this.phaseBuffer = phases.map(() => []);
    }

    for (let sc = 0; sc < phases.length && sc < this.phaseBuffer.length; sc++) {
      this.phaseBuffer[sc].push(phases[sc]);
      if (this.phaseBuffer[sc].length > this.bufferSize) {
        this.phaseBuffer[sc].shift();
      }
    }

    this.sampleCount++;
  }

  /**
   * Estimate breathing rate from current buffer.
   * Returns null if insufficient data.
   */
  estimateBreathingRate(): VitalEstimate | null {
    return this.estimateRate(0.1, 0.5, 6, 30, 'breathing');
  }

  /**
   * Estimate heart rate from current buffer.
   * Returns null if insufficient data.
   */
  estimateHeartRate(): VitalEstimate | null {
    return this.estimateRate(0.8, 2.0, 48, 120, 'heartRate');
  }

  /**
   * Get a full vital signs snapshot.
   */
  getVitalSigns(): VitalSignsSnapshot {
    const breathing = this.estimateBreathingRate();
    const heartRate = this.estimateHeartRate();

    return {
      timestamp: Date.now(),
      breathing,
      heartRate,
      sampleCount: this.sampleCount,
      bufferFill: this.getBufferFillRatio(),
    };
  }

  setSampleRate(rate: number): void {
    this.sampleRate = rate;
  }

  getBufferFillRatio(): number {
    if (this.phaseBuffer.length === 0) return 0;
    return Math.min(1, this.phaseBuffer[0].length / this.bufferSize);
  }

  reset(): void {
    this.phaseBuffer = [];
    this.sampleCount = 0;
  }

  // ── private ──

  private estimateRate(
    bandLow: number,
    bandHigh: number,
    minBpm: number,
    maxBpm: number,
    label: string,
  ): VitalEstimate | null {
    // Need at least 4 seconds of data
    const minSamples = this.sampleRate * 4;
    if (
      this.phaseBuffer.length === 0 ||
      this.phaseBuffer[0].length < minSamples
    ) {
      return null;
    }

    // Use the first 8 subcarriers (typically most informative for body motion)
    const subcarrierCount = Math.min(8, this.phaseBuffer.length);
    const bpmEstimates: number[] = [];
    const confidences: number[] = [];

    for (let sc = 0; sc < subcarrierCount; sc++) {
      const raw = this.phaseBuffer[sc];

      // Phase processing pipeline
      const unwrapped = this.unwrapper.unwrap(raw);
      const detrended = this.unwrapper.detrend(unwrapped);
      const cleaned = this.hampel.filter(detrended, 5, 3);
      const filtered = this.bandpass.apply(
        cleaned,
        bandLow,
        bandHigh,
        this.sampleRate,
      );

      // FFT peak detection
      const result = this.fftPeakBpm(
        filtered,
        this.sampleRate,
        bandLow,
        bandHigh,
      );

      if (result) {
        const bpm = result.frequencyHz * 60;
        if (bpm >= minBpm && bpm <= maxBpm) {
          bpmEstimates.push(bpm);
          confidences.push(result.magnitude);
        }
      }
    }

    if (bpmEstimates.length === 0) {
      return null;
    }

    // Weighted average by confidence (FFT magnitude)
    const totalWeight = confidences.reduce((s, c) => s + c, 0);
    const weightedBpm =
      totalWeight > 0
        ? bpmEstimates.reduce((s, b, i) => s + b * confidences[i], 0) /
          totalWeight
        : bpmEstimates.reduce((s, b) => s + b, 0) / bpmEstimates.length;

    // Confidence: based on agreement across subcarriers
    const bpmStd = this.std(bpmEstimates);
    const agreementScore = Math.max(0, 1 - bpmStd / 10);
    const coverageScore = bpmEstimates.length / subcarrierCount;
    const confidence = Math.min(1, agreementScore * 0.7 + coverageScore * 0.3);

    return {
      estimatedBpm: Math.round(weightedBpm * 10) / 10,
      confidence,
      subcarriersUsed: bpmEstimates.length,
      label,
      validationStatus: 'experimental' as const,
    };
  }

  /**
   * Simple real-valued FFT via DFT on the band of interest.
   * (Full FFT would be better — this covers the needed frequency range)
   */
  private fftPeakBpm(
    signal: number[],
    sampleRate: number,
    minFreq: number,
    maxFreq: number,
  ): { frequencyHz: number; magnitude: number } | null {
    const n = signal.length;
    const freqResolution = sampleRate / n;

    const minBin = Math.max(1, Math.floor(minFreq / freqResolution));
    const maxBin = Math.min(
      Math.floor(n / 2),
      Math.ceil(maxFreq / freqResolution),
    );

    let peakMag = 0;
    let peakBin = minBin;

    for (let k = minBin; k <= maxBin; k++) {
      let re = 0;
      let im = 0;
      const w = (2 * Math.PI * k) / n;

      for (let t = 0; t < n; t++) {
        re += signal[t] * Math.cos(w * t);
        im -= signal[t] * Math.sin(w * t);
      }

      const mag = Math.sqrt(re * re + im * im);
      if (mag > peakMag) {
        peakMag = mag;
        peakBin = k;
      }
    }

    if (peakMag < 1e-6) return null;

    return {
      frequencyHz: peakBin * freqResolution,
      magnitude: peakMag,
    };
  }

  private std(arr: number[]): number {
    if (arr.length < 2) return 0;
    const mean = arr.reduce((s, v) => s + v, 0) / arr.length;
    const variance =
      arr.reduce((s, v) => s + (v - mean) ** 2, 0) / (arr.length - 1);
    return Math.sqrt(variance);
  }
}

// ── Types ──

export interface VitalEstimate {
  estimatedBpm: number;
  confidence: number;
  subcarriersUsed: number;
  label: string;
  validationStatus: 'unvalidated' | 'experimental' | 'station_validated' | 'externally_validated';
}

export interface VitalSignsSnapshot {
  timestamp: number;
  breathing: VitalEstimate | null;
  heartRate: VitalEstimate | null;
  sampleCount: number;
  bufferFill: number;
}

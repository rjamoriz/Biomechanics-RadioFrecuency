import { Injectable } from '@nestjs/common';
import { BandpassFilter } from '../signal/bandpass-filter';
import { fft, nextPowerOf2 } from '../signal/stft-processor';

/**
 * Estimates respiratory rate from CSI amplitude signals.
 *
 * Uses two complementary methods:
 *   1. FFT peak detection in the breathing band [0.1 – 0.5 Hz]
 *   2. Zero-crossing count as secondary confirmation
 *
 * All outputs are EXPERIMENTAL proxy metrics — Wi-Fi CSI is not a
 * clinical respiratory monitor. Confidence reflects signal quality
 * and agreement between methods, not clinical accuracy.
 */

// ─── Types ──────────────────────────────────────────────────────────

export type BreathingEstimationMethod = 'fft_peak' | 'zero_crossing';

export type ValidationStatus =
  | 'unvalidated'
  | 'experimental'
  | 'station_validated'
  | 'externally_validated';

export interface BreathingRateResult {
  /** Primary estimate in breaths per minute */
  estimatedBreathingRateBpm: number;
  /** FFT dominant peak frequency (Hz) */
  fftPeakHz: number;
  /** FFT dominant peak power (magnitude) */
  fftPeakPower: number;
  /** Zero-crossing-based estimate (BPM) */
  zeroCrossingBpm: number;
  /** Which method was used for the primary estimate */
  method: BreathingEstimationMethod;
  /** Signal quality indicator [0, 1] */
  signalQuality: number;
  /** Confidence in the estimate [0, 1] */
  confidence: number;
  /** Always 'experimental' for breathing rate */
  validationStatus: ValidationStatus;
}

// ─── Constants ──────────────────────────────────────────────────────

/** Breathing band lower bound (Hz) — 6 BPM */
const BREATHING_LOW_HZ = 0.1;
/** Breathing band upper bound (Hz) — 30 BPM */
const BREATHING_HIGH_HZ = 0.5;
/** Minimum samples for a valid estimate (10s at 25 Hz) */
const MIN_SAMPLES = 250;
/** Minimum SNR: breathing band power must be >= this × noise floor */
const MIN_SNR_RATIO = 2.0;
/** Default sample rate for CSI frames */
const DEFAULT_SAMPLE_RATE = 25;

// ─── Implementation ─────────────────────────────────────────────────

@Injectable()
export class BreathingRateEstimator {
  private readonly bandpassFilter: BandpassFilter;
  private readonly sampleRate: number;

  constructor(sampleRate?: number) {
    this.bandpassFilter = new BandpassFilter();
    this.sampleRate = sampleRate ?? DEFAULT_SAMPLE_RATE;
  }

  /**
   * Estimate breathing rate from a window of CSI amplitude samples.
   *
   * @param amplitudes Raw CSI amplitude array (at least MIN_SAMPLES long)
   * @returns BreathingRateResult or null if insufficient data / low quality
   */
  estimate(amplitudes: number[]): BreathingRateResult | null {
    if (amplitudes.length < MIN_SAMPLES) return null;

    // 1. Bandpass filter to isolate breathing band
    const filtered = this.bandpassFilter.apply(
      amplitudes,
      BREATHING_LOW_HZ,
      BREATHING_HIGH_HZ,
      this.sampleRate,
    );

    // 2. FFT-based estimation
    const fftResult = this.fftEstimate(filtered);

    // 3. Zero-crossing estimation
    const zeroCrossingBpm = this.zeroCrossingEstimate(filtered);

    // 4. SNR check
    const signalQuality = this.computeSignalQuality(
      amplitudes,
      fftResult.peakPower,
    );

    if (signalQuality < MIN_SNR_RATIO / 10) {
      // Below minimum SNR — reject
      return null;
    }

    // 5. Choose primary method
    const { method, primaryBpm } = this.selectMethod(
      fftResult.peakHz,
      fftResult.peakPower,
      zeroCrossingBpm,
      signalQuality,
    );

    // 6. Confidence from method agreement + signal quality
    const confidence = this.computeConfidence(
      fftResult.peakHz * 60,
      zeroCrossingBpm,
      signalQuality,
    );

    return {
      estimatedBreathingRateBpm: round2(primaryBpm),
      fftPeakHz: round4(fftResult.peakHz),
      fftPeakPower: round4(fftResult.peakPower),
      zeroCrossingBpm: round2(zeroCrossingBpm),
      method,
      signalQuality: round4(signalQuality),
      confidence: round4(confidence),
      validationStatus: 'experimental',
    };
  }

  /**
   * Check if the sample count is sufficient for estimation.
   */
  isReady(sampleCount: number): boolean {
    return sampleCount >= MIN_SAMPLES;
  }

  // ─── Private helpers ────────────────────────────────────────────

  private fftEstimate(filtered: number[]): {
    peakHz: number;
    peakPower: number;
  } {
    const n = nextPowerOf2(filtered.length);
    const padded = new Array<number>(n).fill(0);
    for (let i = 0; i < filtered.length; i++) padded[i] = filtered[i];

    const { re, im } = fft(padded);

    // Only look at positive frequencies in the breathing range
    const binLow = Math.ceil((BREATHING_LOW_HZ * n) / this.sampleRate);
    const binHigh = Math.floor((BREATHING_HIGH_HZ * n) / this.sampleRate);

    let peakBin = binLow;
    let peakPower = 0;

    for (let i = binLow; i <= binHigh && i < n / 2; i++) {
      const mag = Math.sqrt(re[i] * re[i] + im[i] * im[i]);
      if (mag > peakPower) {
        peakPower = mag;
        peakBin = i;
      }
    }

    const peakHz = (peakBin * this.sampleRate) / n;
    return { peakHz, peakPower };
  }

  private zeroCrossingEstimate(filtered: number[]): number {
    const mean =
      filtered.reduce((sum, v) => sum + v, 0) / filtered.length;

    let crossings = 0;
    for (let i = 1; i < filtered.length; i++) {
      const prev = filtered[i - 1] - mean;
      const curr = filtered[i] - mean;
      if ((prev < 0 && curr >= 0) || (prev >= 0 && curr < 0)) {
        crossings++;
      }
    }

    // Each full cycle = 2 zero crossings
    const durationSec = filtered.length / this.sampleRate;
    const cyclesPerSec = crossings / 2 / durationSec;

    return cyclesPerSec * 60;
  }

  private computeSignalQuality(
    rawAmplitudes: number[],
    breathingPeakPower: number,
  ): number {
    // Compute total spectral power across all frequencies
    const n = nextPowerOf2(rawAmplitudes.length);
    const padded = new Array<number>(n).fill(0);
    for (let i = 0; i < rawAmplitudes.length; i++) padded[i] = rawAmplitudes[i];

    const { re, im } = fft(padded);

    // Noise floor: average power outside breathing band
    const binLow = Math.ceil((BREATHING_LOW_HZ * n) / this.sampleRate);
    const binHigh = Math.floor((BREATHING_HIGH_HZ * n) / this.sampleRate);

    let noiseSum = 0;
    let noiseBins = 0;

    for (let i = 1; i < n / 2; i++) {
      if (i < binLow || i > binHigh) {
        noiseSum += Math.sqrt(re[i] * re[i] + im[i] * im[i]);
        noiseBins++;
      }
    }

    const noiseFloor = noiseBins > 0 ? noiseSum / noiseBins : 1;
    const snr = noiseFloor > 0 ? breathingPeakPower / noiseFloor : 0;

    // Map SNR to [0, 1] with saturation at SNR=10
    return Math.min(1, snr / 10);
  }

  private selectMethod(
    fftPeakHz: number,
    fftPeakPower: number,
    zeroCrossingBpm: number,
    signalQuality: number,
  ): { method: BreathingEstimationMethod; primaryBpm: number } {
    const fftBpm = fftPeakHz * 60;

    // Prefer FFT when signal quality is reasonable
    if (signalQuality >= 0.2 && fftBpm >= 6 && fftBpm <= 30) {
      return { method: 'fft_peak', primaryBpm: fftBpm };
    }

    // Fallback to zero-crossing
    if (zeroCrossingBpm >= 6 && zeroCrossingBpm <= 30) {
      return { method: 'zero_crossing', primaryBpm: zeroCrossingBpm };
    }

    // Default to FFT even with low quality
    return { method: 'fft_peak', primaryBpm: fftBpm };
  }

  private computeConfidence(
    fftBpm: number,
    zeroCrossingBpm: number,
    signalQuality: number,
  ): number {
    // Agreement between methods (closer = higher confidence)
    const maxBpm = Math.max(fftBpm, zeroCrossingBpm, 1);
    const agreement =
      1 - Math.abs(fftBpm - zeroCrossingBpm) / maxBpm;

    // Weighted: 50% signal quality, 50% method agreement
    const raw = 0.5 * signalQuality + 0.5 * Math.max(0, agreement);
    return clamp(raw, 0, 1);
  }
}

// ─── Utils ──────────────────────────────────────────────────────────

function round2(v: number): number {
  return Math.round(v * 100) / 100;
}

function round4(v: number): number {
  return Math.round(v * 10000) / 10000;
}

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

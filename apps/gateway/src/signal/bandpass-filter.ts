import { Injectable } from '@nestjs/common';

/**
 * Second-order IIR biquad bandpass filter.
 *
 * Used to isolate frequency bands of interest from CSI signals:
 *   - Breathing: 0.1 – 0.5 Hz  (6 – 30 BPM)
 *   - Heart rate: 0.8 – 2.0 Hz (48 – 120 BPM)
 *   - Gait cadence: 1.0 – 3.5 Hz (120 – 210 SPM)
 */
@Injectable()
export class BandpassFilter {
  /**
   * Design a biquad bandpass filter and apply it to the signal.
   *
   * @param signal   Input samples
   * @param lowFreq  Lower cutoff (Hz)
   * @param highFreq Upper cutoff (Hz)
   * @param sampleRate Sample rate (Hz)
   * @returns Filtered signal
   */
  apply(
    signal: number[],
    lowFreq: number,
    highFreq: number,
    sampleRate: number,
  ): number[] {
    // Apply low-pass then high-pass in cascade
    const lpCoeffs = this.lowpassCoeffs(highFreq, sampleRate);
    const hpCoeffs = this.highpassCoeffs(lowFreq, sampleRate);

    const afterLp = this.biquadFilter(signal, lpCoeffs);
    return this.biquadFilter(afterLp, hpCoeffs);
  }

  /**
   * Design and apply a lowpass biquad filter.
   */
  lowpass(signal: number[], cutoff: number, sampleRate: number): number[] {
    return this.biquadFilter(signal, this.lowpassCoeffs(cutoff, sampleRate));
  }

  /**
   * Design and apply a highpass biquad filter.
   */
  highpass(signal: number[], cutoff: number, sampleRate: number): number[] {
    return this.biquadFilter(signal, this.highpassCoeffs(cutoff, sampleRate));
  }

  private lowpassCoeffs(
    cutoff: number,
    sampleRate: number,
  ): BiquadCoefficients {
    const w0 = (2 * Math.PI * cutoff) / sampleRate;
    const alpha = Math.sin(w0) / (2 * 0.7071); // Q = 1/√2 (Butterworth)
    const cosW0 = Math.cos(w0);

    const a0 = 1 + alpha;
    return {
      b0: ((1 - cosW0) / 2) / a0,
      b1: (1 - cosW0) / a0,
      b2: ((1 - cosW0) / 2) / a0,
      a1: (-2 * cosW0) / a0,
      a2: (1 - alpha) / a0,
    };
  }

  private highpassCoeffs(
    cutoff: number,
    sampleRate: number,
  ): BiquadCoefficients {
    const w0 = (2 * Math.PI * cutoff) / sampleRate;
    const alpha = Math.sin(w0) / (2 * 0.7071);
    const cosW0 = Math.cos(w0);

    const a0 = 1 + alpha;
    return {
      b0: ((1 + cosW0) / 2) / a0,
      b1: (-(1 + cosW0)) / a0,
      b2: ((1 + cosW0) / 2) / a0,
      a1: (-2 * cosW0) / a0,
      a2: (1 - alpha) / a0,
    };
  }

  private biquadFilter(
    signal: number[],
    c: BiquadCoefficients,
  ): number[] {
    const n = signal.length;
    if (n === 0) return [];

    const out = new Array<number>(n);
    let x1 = 0;
    let x2 = 0;
    let y1 = 0;
    let y2 = 0;

    for (let i = 0; i < n; i++) {
      const x0 = signal[i];
      out[i] = c.b0 * x0 + c.b1 * x1 + c.b2 * x2 - c.a1 * y1 - c.a2 * y2;
      x2 = x1;
      x1 = x0;
      y2 = y1;
      y1 = out[i];
    }

    return out;
  }
}

interface BiquadCoefficients {
  b0: number;
  b1: number;
  b2: number;
  a1: number;
  a2: number;
}

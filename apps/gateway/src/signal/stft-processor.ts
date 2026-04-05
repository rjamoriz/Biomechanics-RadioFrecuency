/**
 * Short-Time Fourier Transform (STFT) processor for time-frequency analysis.
 *
 * Provides spectrogram computation and peak frequency tracking from 1D
 * CSI-derived signals. Used by breathing rate estimation, gait frequency
 * analysis, and cadence verification pipelines.
 *
 * FFT implementation: in-place Cooley-Tukey radix-2 DIT.
 * No external signal processing libraries required.
 */

// ─── Types ──────────────────────────────────────────────────────────

export interface StftConfig {
  /** FFT window size in samples (will be zero-padded to next power of 2) */
  windowSize?: number;
  /** Hop size in samples between successive windows */
  hopSize?: number;
  /** Sample rate in Hz (used for frequency/time axis labeling) */
  sampleRate?: number;
}

export interface SpectrogramResult {
  /** Magnitude matrix [timeFrame][freqBin] */
  magnitudes: number[][];
  /** Frequency axis in Hz */
  frequencies: number[];
  /** Time axis in seconds */
  timeStamps: number[];
  /** Effective window size in ms */
  windowSizeMs: number;
  /** Effective hop size in ms */
  hopSizeMs: number;
}

export interface PeakTrackPoint {
  /** Time in seconds */
  time: number;
  /** Peak frequency in Hz */
  frequency: number;
  /** Peak magnitude (power) */
  power: number;
}

// ─── Defaults ───────────────────────────────────────────────────────

const DEFAULT_WINDOW_SIZE = 128;
const DEFAULT_HOP_SIZE = 32;
const DEFAULT_SAMPLE_RATE = 25;

// ─── Implementation ─────────────────────────────────────────────────

export class StftProcessor {
  private readonly windowSize: number;
  private readonly hopSize: number;
  private readonly sampleRate: number;
  private readonly fftSize: number;
  private readonly hannWindow: number[];

  constructor(config?: StftConfig) {
    this.windowSize = config?.windowSize ?? DEFAULT_WINDOW_SIZE;
    this.hopSize = config?.hopSize ?? DEFAULT_HOP_SIZE;
    this.sampleRate = config?.sampleRate ?? DEFAULT_SAMPLE_RATE;
    this.fftSize = nextPowerOf2(this.windowSize);
    this.hannWindow = buildHannWindow(this.windowSize);
  }

  /**
   * Compute the spectrogram of a 1D signal.
   *
   * @param signal Input samples
   * @returns SpectrogramResult with magnitude matrix, frequency and time axes
   */
  compute(signal: number[]): SpectrogramResult {
    if (signal.length < this.windowSize) {
      return {
        magnitudes: [],
        frequencies: this.buildFrequencyAxis(),
        timeStamps: [],
        windowSizeMs: (this.windowSize / this.sampleRate) * 1000,
        hopSizeMs: (this.hopSize / this.sampleRate) * 1000,
      };
    }

    const magnitudes: number[][] = [];
    const timeStamps: number[] = [];

    for (
      let start = 0;
      start + this.windowSize <= signal.length;
      start += this.hopSize
    ) {
      const frame = signal.slice(start, start + this.windowSize);
      const windowed = this.applyWindow(frame);
      const padded = zeroPad(windowed, this.fftSize);

      const { re, im } = fft(padded);
      const mags = computeMagnitudes(re, im, this.fftSize);

      magnitudes.push(mags);
      timeStamps.push((start + this.windowSize / 2) / this.sampleRate);
    }

    return {
      magnitudes,
      frequencies: this.buildFrequencyAxis(),
      timeStamps,
      windowSizeMs: (this.windowSize / this.sampleRate) * 1000,
      hopSizeMs: (this.hopSize / this.sampleRate) * 1000,
    };
  }

  /**
   * Extract the peak frequency track within a specified frequency band.
   *
   * @param spectrogramOrSignal A SpectrogramResult or raw signal array
   * @param freqMin Lower bound of the band (Hz)
   * @param freqMax Upper bound of the band (Hz)
   */
  extractPeakTrack(
    spectrogramOrSignal: SpectrogramResult | number[],
    freqMin: number,
    freqMax: number,
  ): PeakTrackPoint[] {
    const spec = Array.isArray(spectrogramOrSignal)
      ? this.compute(spectrogramOrSignal)
      : spectrogramOrSignal;

    if (spec.magnitudes.length === 0) return [];

    const freqs = spec.frequencies;
    const minBin = freqs.findIndex((f) => f >= freqMin);
    const maxBin = findLastIndex(freqs, (f) => f <= freqMax);

    if (minBin < 0 || maxBin < 0 || minBin > maxBin) return [];

    const track: PeakTrackPoint[] = [];

    for (let t = 0; t < spec.magnitudes.length; t++) {
      const frame = spec.magnitudes[t];
      let peakBin = minBin;
      let peakPower = frame[minBin];

      for (let b = minBin + 1; b <= maxBin; b++) {
        if (frame[b] > peakPower) {
          peakPower = frame[b];
          peakBin = b;
        }
      }

      track.push({
        time: spec.timeStamps[t],
        frequency: freqs[peakBin],
        power: peakPower,
      });
    }

    return track;
  }

  /** Get the configured FFT size (power of 2). */
  getFftSize(): number {
    return this.fftSize;
  }

  // ─── Private ────────────────────────────────────────────────────

  private applyWindow(frame: number[]): number[] {
    const out = new Array<number>(frame.length);
    for (let i = 0; i < frame.length; i++) {
      out[i] = frame[i] * this.hannWindow[i];
    }
    return out;
  }

  private buildFrequencyAxis(): number[] {
    const n = Math.floor(this.fftSize / 2) + 1;
    const freqs = new Array<number>(n);
    for (let i = 0; i < n; i++) {
      freqs[i] = (i * this.sampleRate) / this.fftSize;
    }
    return freqs;
  }
}

// ─── Pure helpers ───────────────────────────────────────────────────

/** Hann window coefficients. */
function buildHannWindow(size: number): number[] {
  const w = new Array<number>(size);
  for (let i = 0; i < size; i++) {
    w[i] = 0.5 * (1 - Math.cos((2 * Math.PI * i) / (size - 1)));
  }
  return w;
}

/** Zero-pad array to target length. */
function zeroPad(arr: number[], targetLen: number): number[] {
  if (arr.length >= targetLen) return arr.slice(0, targetLen);
  const out = new Array<number>(targetLen).fill(0);
  for (let i = 0; i < arr.length; i++) out[i] = arr[i];
  return out;
}

/** Next power of 2 >= n. */
export function nextPowerOf2(n: number): number {
  let p = 1;
  while (p < n) p <<= 1;
  return p;
}

/**
 * In-place Cooley-Tukey radix-2 DIT FFT.
 * Input length MUST be a power of 2.
 */
export function fft(input: number[]): { re: number[]; im: number[] } {
  const n = input.length;
  const re = input.slice();
  const im = new Array<number>(n).fill(0);

  // Bit-reversal permutation
  const bits = Math.log2(n);
  for (let i = 0; i < n; i++) {
    const j = bitReverse(i, bits);
    if (j > i) {
      [re[i], re[j]] = [re[j], re[i]];
      [im[i], im[j]] = [im[j], im[i]];
    }
  }

  // Butterfly stages
  for (let size = 2; size <= n; size *= 2) {
    const halfSize = size / 2;
    const angle = (-2 * Math.PI) / size;

    for (let i = 0; i < n; i += size) {
      for (let k = 0; k < halfSize; k++) {
        const theta = angle * k;
        const twRe = Math.cos(theta);
        const twIm = Math.sin(theta);

        const evenIdx = i + k;
        const oddIdx = i + k + halfSize;

        const tRe = twRe * re[oddIdx] - twIm * im[oddIdx];
        const tIm = twRe * im[oddIdx] + twIm * re[oddIdx];

        re[oddIdx] = re[evenIdx] - tRe;
        im[oddIdx] = im[evenIdx] - tIm;
        re[evenIdx] = re[evenIdx] + tRe;
        im[evenIdx] = im[evenIdx] + tIm;
      }
    }
  }

  return { re, im };
}

function bitReverse(x: number, bits: number): number {
  let result = 0;
  for (let i = 0; i < bits; i++) {
    result = (result << 1) | (x & 1);
    x >>= 1;
  }
  return result;
}

/** Compute magnitude spectrum (only positive frequencies: 0..N/2). */
function computeMagnitudes(
  re: number[],
  im: number[],
  n: number,
): number[] {
  const half = Math.floor(n / 2) + 1;
  const mags = new Array<number>(half);
  for (let i = 0; i < half; i++) {
    mags[i] = Math.sqrt(re[i] * re[i] + im[i] * im[i]);
  }
  return mags;
}

function findLastIndex<T>(arr: T[], pred: (v: T) => boolean): number {
  for (let i = arr.length - 1; i >= 0; i--) {
    if (pred(arr[i])) return i;
  }
  return -1;
}
